import { personalImportOwnersPlan, personalGuestBusinessPayload } from "./personal-import-owners-plan.js";
export { personalGuestBusinessPayload } from "./personal-import-owners-plan.js";
import { personalGuestImportLayout } from "./personal-guest-import-layout.js";
import { personalGuestSourceLayout } from "./personal-guest-import-source.js";
import { assertListOperationPayload } from "./list-operation-payload.js";

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const hash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const dictionary = (...values) => [...new Set(values.flat().filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))];
const fail = () => { throw Object.assign(Error("Зафиксированный гостевой перенос неполон или изменён. Исходная работа сохранена."), { code: "guest-import-plan" }); };

function generatedPlaceholder(layout) {
  return layout?.id === "layout-main" && !layout.createdAt && !layout.updatedAt
    && !layout.adminDemo && !layout.adminSharedSourceId && !layout.publicCatalogLayoutId && !layout.guestDemoCopy
    && ["Текущая укладка", "Current layout"].includes(String(layout.name || "").trim())
    && !(layout.rootContainerIds || []).length && !(layout.arrangement?.rootContainerIds || []).length
    && !Object.keys(layout.arrangement?.containers || {}).length && !Object.keys(layout.arrangement?.items || {}).length;
}

// Every identity and file descriptor is supplied by the frozen selection.
// The server can run this compiler against its locked base without UI state,
// downloads, clocks, random IDs, or mutation of either input snapshot.
export function personalGuestImportPlan({ currentPayload, sourcePayload, layoutTargets, ownerTargets, photoTargets, editMeta = {}, listId, operationId }, files = []) {
  assertListOperationPayload({ actorId: "guest-plan-validation", kind: "list.import", listId,
    body: { currentPayload, sourcePayload, layoutTargets, ownerTargets, photoTargets, editMeta, operationId, files } });
  const payload = personalGuestBusinessPayload(currentPayload), source = clone(sourcePayload);
  if (!id(listId) || !uuid(operationId) || !Array.isArray(layoutTargets) || !layoutTargets.length || layoutTargets.length > 50
    || !Array.isArray(ownerTargets) || !Array.isArray(photoTargets) || photoTargets.length > 50 || !Array.isArray(files) || files.length !== photoTargets.length) fail();
  const selected = { item: new Set(), container: new Set() }, sourceLayouts = new Set(), layoutIds = new Set();
  const firstLayout = new Map(), names = new Set(Object.values(payload.layouts).map(layout => String(layout.name || "").trim().toLowerCase()));
  const reservedIds = new Set([source, payload].flatMap(value => ["items", "containers", "layouts"].flatMap(field => Object.keys(value[field]))));
  for (const target of layoutTargets) {
    if (!exact(target, ["sourceId", "targetId", "name"]) || !id(target.sourceId) || !uuid(target.targetId?.slice(7)) || !target.targetId.startsWith("layout-")
      || sourceLayouts.has(target.sourceId) || layoutIds.has(target.targetId) || reservedIds.has(target.targetId)
      || typeof target.name !== "string" || !target.name.trim() || target.name.length > 1000 || names.has(target.name.trim().toLowerCase())) fail();
    sourceLayouts.add(target.sourceId); layoutIds.add(target.targetId); reservedIds.add(target.targetId); names.add(target.name.trim().toLowerCase());
    const layout = personalGuestSourceLayout(source, target.sourceId); source.layouts[target.sourceId] = layout;
    if (!plain(layout.arrangement?.containers)) fail();
    for (const sourceId of Object.keys(layout.arrangement.containers)) {
      selected.container.add(sourceId); if (!firstLayout.has(`container:${sourceId}`)) firstLayout.set(`container:${sourceId}`, layout.id);
    }
    const placed = new Set([...Object.keys(layout.arrangement.items || {}), ...Object.values(layout.arrangement.containers).flatMap(value => value.itemIds || [])]);
    for (const sourceId of [...placed, ...(layout.guestSharedLinkDetachedItemIds || [])]) {
      selected.item.add(sourceId);
      if (!firstLayout.has(`item:${sourceId}`)) firstLayout.set(`item:${sourceId}`, placed.has(sourceId) ? layout.id : source.activeLayoutId || Object.keys(source.layouts)[0] || "");
    }
  }
  const compiled = personalImportOwnersPlan({ currentPayload, sourcePayload, listId, operationId, ownerTargets, photoTargets, editMeta,
    allocatedLayoutIds: layoutTargets.map(target => target.targetId),
    selectedOwners: [...selected.container].map(sourceId => ({ entityType: "container", sourceId, sourceLayoutId: firstLayout.get(`container:${sourceId}`) }))
      .concat([...selected.item].map(sourceId => ({ entityType: "item", sourceId, sourceLayoutId: firstLayout.get(`item:${sourceId}`) }))) }, files);
  const { attachments, createdOwners } = compiled;
  Object.assign(payload, compiled.payload);
  const removedLayoutIds = [], existingLayouts = Object.values(payload.layouts);
  if (existingLayouts.length === 1 && generatedPlaceholder(existingLayouts[0])) {
    removedLayoutIds.push(existingLayouts[0].id); delete payload.layouts[existingLayouts[0].id];
  }
  for (const field of ["locations", "categories"]) for (const value of source[field]) if (!payload[field].includes(value)) payload[field].push(value);
  for (const target of layoutTargets) {
    const result = personalGuestImportLayout({ sourcePayload: source, targetPayload: payload, ...target, ownerTargets, editMeta });
    payload.layouts[target.targetId] = result.layout;
    for (const field of ["locations", "categories", "customLocations", "customCategories"]) payload[field] = dictionary(payload[field] || [], result.dictionaries[field]);
  }
  return { payload, attachments, deletions: [], createdOwners, removedLayoutIds,
    importedLayoutIds: layoutTargets.map(target => target.targetId), activeLayoutId: layoutTargets[0].targetId };
}
