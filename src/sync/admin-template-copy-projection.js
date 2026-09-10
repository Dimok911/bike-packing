import { canonicalTemplateJson, validTemplateOperationId } from "./admin-template-protocol.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const fail = () => { throw Error("Шаблон требует отдельной подготовки копии. Исходные данные сохранены."); };
const editorFields = ["adminCausalSource", "templateDraftSyncPending", "templateDraftServerHydrated", "templatePublished",
  "templateUnpublishPending", "adminDemo", "adminDemoLanguage", "adminDemoListId", "adminSharedSourceId", "adminTemplateCopy", "publicCatalogLayoutId", "adminCausalCopyPlan"];

// Shared by the browser and API. IDs depend only on the immutable operation;
// every catalog entity is copied, including trees outside the arrangement.
export function projectAdminTemplateCopy(payload, operationId, metadata) {
  if (!validTemplateOperationId(operationId) || Object.keys(payload?.layouts || {}).length !== 1
    || payload.sharedLayoutsIndex) fail();
  const source = clone(payload), layout = Object.values(source.layouts)[0], layoutId = "layout-" + operationId;
  for (const start of Object.keys(source.containers || {})) {
    const seen = new Set(); let id = start;
    while (id) { if (seen.has(id) || !source.containers[id]) fail(); seen.add(id); id = source.containers[id].parentId; }
  }
  const maps = Object.fromEntries(["items", "containers"].map(kind => [kind,
    new Map(Object.keys(source[kind] || {}).sort().map((id, i) => [id, `template-copy-${operationId}-${kind === "items" ? "i" : "c"}-${i}`]))]));
  const ref = (id, kind) => { if (id === "" || id == null) return ""; const mapped = maps[kind].get(id); if (!mapped) fail(); return mapped; };
  const refs = (ids, kind) => (ids || []).map(id => { if (!id) fail(); return ref(id, kind); });
  const order = rows => (rows || []).map(row => {
    if (!["item", "container"].includes(row?.type)) fail();
    return { ...row, id: ref(row.id, row.type === "item" ? "items" : "containers") };
  });
  const placement = row => ({ ...row, parentId: ref(row.parentId, "containers"), childIds: refs(row.childIds, "containers"),
    itemIds: refs(row.itemIds, "items"), order: order(row.order) });
  const clean = row => { editorFields.forEach(key => delete row[key]); return row; };
  const entities = (kind, convert) => Object.fromEntries([...maps[kind]].map(([id, next]) => {
    if (source[kind][id]?.id !== id) fail();
    return [next, clean({ ...convert(source[kind][id]), id: next })];
  }));
  const remap = (rows, kind, convert) => Object.fromEntries(Object.entries(rows || {}).map(([id, row]) => [ref(id, kind), convert(row, id)]));
  if (!layout.arrangement) fail();
  const old = layout.arrangement;
  const arrangement = { ...old, rootContainerIds: refs(old.rootContainerIds, "containers"),
    containers: remap(old.containers, "containers", (row, id) => ({ ...placement(row), ...(Object.hasOwn(row, "id") ? { id: ref(id, "containers") } : {}) })), items: remap(old.items, "items", id => ref(id, "containers")),
    itemQuantities: remap(old.itemQuantities, "items", value => value), packedItems: remap(old.packedItems, "items", value => value) };
  return { ...source, items: entities("items", row => ({ ...row, containerId: ref(row.containerId, "containers") })),
    containers: entities("containers", placement), activeLayoutId: layoutId, packedItems: clone(arrangement.packedItems),
    layouts: { [layoutId]: clean({ ...layout, id: layoutId, name: metadata.title, note: metadata.description, language: metadata.language,
      rootContainerIds: refs(layout.rootContainerIds, "containers"), arrangement }) } };
}

export async function adminTemplateCopyPayloadDigest(payload) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(payload)));
  return Array.from(new Uint8Array(bytes)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
