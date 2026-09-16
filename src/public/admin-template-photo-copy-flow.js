import { canonicalTemplateJson, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoCopyIntent, adminTemplatePhotoCopyStageManifests, adminTemplatePhotoCopyStageDigest } from "../sync/admin-template-photo-copy-protocol.js";
import { prepareAdminTemplatePhotoCopyRecord } from "../sync/admin-template-photo-copy-record.js";
import { assertAdminTemplatePhotoOwnerMap, captureAdminTemplatePhotoOwnerMap } from "../sync/admin-template-photo-owner-map.js";
import { captureAdminTemplatePhotoView } from "../sync/admin-template-photo-view.js";

const clone = value => JSON.parse(canonicalTemplateJson(value));
const paused = () => Object.assign(Error("Исходный шаблон и выбранная копия требуют сверки. Выбор сохранён без повторного создания."),
  { code: "admin-template-photo-copy-form", isAdminTemplateBlocked: true });
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalTemplateJson(value)))),
  byte => byte.toString(16).padStart(2, "0")).join("");

// The UI supplies all IDs and both before snapshots before its first await.
// This preparer never repairs an editor, invents owners or reads photo bytes.
export async function prepareAdminTemplatePhotoCopyForm(input) {
  const value = clone(input), { binding, operationId, sourcePayload, targetPayload, snapshot, fields, assets } = value;
  if (!validTemplateOperationId(operationId) || !Array.isArray(assets) || assets.length < 1 || assets.length > 50) throw paused();
  const source = snapshot.source.beforeState.layouts[snapshot.source.layoutId].adminCausalSource;
  const target = snapshot.target.beforeState.layouts[snapshot.target.layoutId].adminCausalSource;
  const selected = snapshot.source.ownerMap.owners.find(owner => owner.localId === snapshot.copiedOwner.sourceLocalId
    && owner.type === (snapshot.copiedOwner.entityType === "item" ? "items" : "containers"));
  if (!selected) throw paused();
  const body = { version: 1, base: clone(target.base), payload: targetPayload, metadata: clone(snapshot.target.metadata), photoCopy: {
    version: 1, entityType: snapshot.copiedOwner.entityType, entityId: snapshot.copiedOwner.serverId, fields,
    source: { itemKey: source.binding.itemKey, listId: source.binding.listId, base: clone(source.base),
      payloadDigest: await digest(sourcePayload), payload: sourcePayload, entityId: selected.serverId },
    assets: assets.map(asset => ({ ...asset, assetDigest: "0".repeat(64) }))
  } };
  let intent = adminTemplatePhotoCopyIntent({ ...binding, operationId, kind: "template.save", body });
  const manifests = await adminTemplatePhotoCopyStageManifests(intent);
  for (const [index, manifest] of manifests.entries()) body.photoCopy.assets[index].assetDigest = await adminTemplatePhotoCopyStageDigest(manifest);
  intent = adminTemplatePhotoCopyIntent({ ...binding, operationId, kind: "template.save", body });
  return prepareAdminTemplatePhotoCopyRecord({ binding, action: { operationId, kind: intent.kind, listId: intent.listId, itemKey: intent.itemKey, body: intent.body }, snapshot });
}

// A catalog copy adds one identity. Keep every existing target editor identity
// instead of adopting the generic server decision's replacement IDs. Relabel
// only schema-defined links; opaque business attributes are never traversed.
export function preserveAdminTemplatePhotoCopyOwnerIds(state, projection, intent, confirmedPayload, stateRevision, record) {
  const layoutId = projection.layoutId, binding = Object.fromEntries(["actorId", "environment", "listId", "itemKey"].map(key => [key, intent[key]]));
  const previous = state.layouts[layoutId]?.adminCausalSource?.photoOwnerMap;
  if (record?.action?.operationId !== intent.id || record.snapshot?.target?.layoutId !== layoutId
    || canonicalTemplateJson(record.action.body) !== canonicalTemplateJson(intent.body)
    || canonicalTemplateJson(record.snapshot.target.ownerMap) !== canonicalTemplateJson(previous)
    || record.snapshot.copiedOwner.entityType !== intent.body.photoCopy.entityType
    || record.snapshot.copiedOwner.serverId !== intent.body.photoCopy.entityId) throw paused();
  assertAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision: intent.body.base.stateRevision,
    map: previous, state, sourcePayload: intent.body.payload });
  const value = clone(projection), current = value.layout.adminCausalSource?.photoOwnerMap;
  if (!current || current.stateRevision !== stateRevision || canonicalTemplateJson(current.binding) !== canonicalTemplateJson(binding)) throw paused();
  const maps = { items: new Map(), containers: new Map() }, mappings = { items: {}, containers: {} };
  const created = intent.body.photoCopy, createdType = created.entityType === "item" ? "items" : "containers";
  for (const owner of current.owners) {
    const old = previous.owners.find(row => row.type === owner.type && row.serverId === owner.serverId);
    if (!old && (owner.type !== createdType || owner.serverId !== created.entityId)) throw paused();
    const localId = old?.localId || record.snapshot.copiedOwner.localId;
    if (!old && ["layouts", "items", "containers"].some(type => Object.hasOwn(state[type], localId))) throw paused();
    maps[owner.type].set(owner.localId, localId); mappings[owner.type][localId] = owner.serverId;
  }
  const ref = (id, type) => { if (!id) return ""; if (!maps[type].has(id)) throw paused(); return maps[type].get(id); };
  const ids = (rows, type) => (rows || []).map(id => ref(id, type));
  const placement = row => ({ ...row, parentId: ref(row.parentId, "containers"), childIds: ids(row.childIds, "containers"),
    itemIds: ids(row.itemIds, "items"), order: (row.order || []).map(entry => {
      if (!["item", "container"].includes(entry.type)) throw paused();
      return { ...entry, id: ref(entry.id, entry.type === "item" ? "items" : "containers") };
    }) });
  value.containers = Object.fromEntries(Object.entries(value.containers).map(([id, row]) => [ref(id, "containers"), { ...placement(row), id: ref(id, "containers") }]));
  value.items = Object.fromEntries(Object.entries(value.items).map(([id, row]) => [ref(id, "items"), { ...row, id: ref(id, "items"), containerId: ref(row.containerId, "containers") }]));
  const object = (rows, type, convert) => Object.fromEntries(Object.entries(rows || {}).map(([id, row]) => [ref(id, type), convert(row)]));
  const arrangement = value.layout.arrangement;
  value.layout.rootContainerIds = ids(value.layout.rootContainerIds, "containers");
  value.layout.arrangement = { ...arrangement, rootContainerIds: ids(arrangement.rootContainerIds, "containers"),
    containers: object(arrangement.containers, "containers", placement), items: object(arrangement.items, "items", id => ref(id, "containers")),
    itemQuantities: object(arrangement.itemQuantities, "items", row => row), packedItems: object(arrangement.packedItems, "items", row => row) };
  const candidate = { layouts: { [layoutId]: value.layout }, items: value.items, containers: value.containers };
  value.layout.adminCausalSource = {
    photoView: captureAdminTemplatePhotoView({ binding, layoutId, state: candidate, sourcePayload: confirmedPayload, mappings }),
    photoOwnerMap: captureAdminTemplatePhotoOwnerMap({ binding, layoutId, stateRevision, state: candidate, sourcePayload: confirmedPayload, mappings })
  };
  return value;
}
