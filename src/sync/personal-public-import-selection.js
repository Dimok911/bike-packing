import { getLayoutContainerIdSet, getLayoutItemIdSet } from "../state/layout-ops.js";
import { personalGuestSourceLayout } from "./personal-guest-import-source.js";
import { personalGuestBusinessPayload } from "./personal-guest-import-plan.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED, personalPublicImportSource } from "./personal-public-import-protocol.js";
import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED, personalPublicEntityGraph } from "./personal-public-entity-plan.js";

const clone = value => JSON.parse(JSON.stringify(value));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
const fail = () => { throw Object.assign(Error("Не удалось зафиксировать выбранный шаблон и все записи личной копии."), { code: "public-import-selection" }); };

// All identities and the complete selected API snapshot precede the first
// file read or confirmation. A public namespace never reuses private IDs.
export function preparePersonalPublicImportSelection({ binding, basePayload, baseStateRevision, source, sourcePayload,
  layoutIds, layoutNames, editMeta = {} }, { enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, createUuid = () => crypto.randomUUID() } = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || !id(binding.listId) || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).length !== 4
    || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1) fail();
  assertListOperationPayload({ ...binding, kind: "list.import", body: { basePayload, baseStateRevision, source, sourcePayload, layoutIds, layoutNames, editMeta } });
  const chosenSource = personalPublicImportSource(source), base = personalGuestBusinessPayload(basePayload), frozen = clone(sourcePayload);
  if (chosenSource.listId === binding.listId || !frozen || !["items", "containers", "layouts"].every(key => frozen[key]
    && Object.getPrototypeOf(frozen[key]) === Object.prototype) || !Array.isArray(layoutIds) || !layoutIds.length || layoutIds.length > 50
    || layoutIds.some(value => !id(value)) || new Set(layoutIds).size !== layoutIds.length
    || !Array.isArray(layoutNames) || layoutNames.length !== layoutIds.length
    || layoutNames.some(value => typeof value !== "string" || !value.trim() || value.length > 1000)
    || new Set(layoutNames.map(value => value.trim().toLowerCase())).size !== layoutNames.length
    || layoutNames.some(value => Object.values(base.layouts).some(layout => String(layout.name || "").trim().toLowerCase() === value.trim().toLowerCase()))) fail();
  const projected = { ...frozen, layouts: { ...frozen.layouts } };
  for (const layoutId of layoutIds) projected.layouts[layoutId] = personalGuestSourceLayout(frozen, layoutId);
  const allocated = new Set(), reserved = new Set([frozen, base].flatMap(state => ["items", "containers", "layouts"].flatMap(field => Object.keys(state[field]))));
  for (const state of [frozen, base]) for (const field of ["items", "containers"]) for (const owner of Object.values(state[field])) {
    if (owner.photos !== undefined && !Array.isArray(owner.photos)) fail();
    for (const photo of owner.photos || []) for (const key of ["id", "photoId", "assetId", "localId"]) if (photo[key]) reserved.add(photo[key]);
  }
  const allocate = prefix => {
    const value = createUuid(), result = prefix ? `${prefix}-${value}` : value;
    if (!uuid(value) || allocated.has(value) || reserved.has(value) || reserved.has(result)) fail();
    allocated.add(value); reserved.add(result); return result;
  };
  const operationId = allocate(""), layoutTargets = [], ownerTargets = [], photoTargets = [], seen = { items: new Set(), containers: new Set() };
  for (const [index, layoutId] of layoutIds.entries()) {
    const layout = projected.layouts[layoutId], selected = { containers: [...getLayoutContainerIdSet(projected, layout)], items: [...getLayoutItemIdSet(projected, layout)] };
    for (const [field, entityType] of [["containers", "container"], ["items", "item"]]) for (const sourceId of selected[field]) {
      const owner = frozen[field][sourceId];
      if (!id(sourceId) || owner?.id !== sourceId) fail();
      if (seen[field].has(sourceId)) continue; seen[field].add(sourceId);
      const targetId = allocate(entityType);
      ownerTargets.push({ entityType, sourceId, targetId, reuse: false, sourceLayoutId: layoutId });
      const photos = new Set();
      for (const photo of owner.photos || []) {
        const sourcePhotoId = photo.id || photo.localId;
        if (!id(sourcePhotoId) || photos.has(sourcePhotoId) || photoTargets.length >= 50) fail(); photos.add(sourcePhotoId);
        photoTargets.push({ entityType, sourceEntityId: sourceId, entityId: targetId, sourcePhotoId, photoId: allocate(""), assetId: allocate("") });
      }
    }
    layoutTargets.push({ sourceId: layoutId, targetId: allocate("layout"), name: layoutNames[index] });
  }
  return { version: 1, binding: clone(binding), operationId, source: chosenSource, sourcePayload: frozen,
    basePayload: base, baseStateRevision, layoutTargets, ownerTargets, photoTargets, editMeta: clone(editMeta) };
}

export function preparePersonalPublicEntitySelection({ binding, basePayload, baseStateRevision, source, sourcePayload, copy, editMeta = {} },
  { enabled = PERSONAL_PUBLIC_IMPORT_ENABLED && PERSONAL_PUBLIC_ENTITY_COPY_ENABLED, createUuid = () => crypto.randomUUID() } = {}) {
  if (!enabled || binding?.environment !== "bike-packing-experiment" || !id(binding.actorId) || binding.actorId.length > 36
    || !id(binding.listId) || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).length !== 4
    || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 1) fail();
  assertListOperationPayload({ ...binding, kind: "list.import", body: { basePayload, baseStateRevision, source, sourcePayload, copy, editMeta } });
  const chosenSource = personalPublicImportSource(source), base = personalGuestBusinessPayload(basePayload), frozen = clone(sourcePayload);
  if (chosenSource.listId === binding.listId) fail();
  const graph = personalPublicEntityGraph(frozen, copy), reserved = new Set(), allocated = new Set();
  for (const payload of [frozen, base]) {
    for (const field of ["items", "containers", "layouts"]) for (const [key, owner] of Object.entries(payload[field])) {
      reserved.add(key);
      if (field === "layouts") continue;
      if (owner.photos !== undefined && !Array.isArray(owner.photos)) fail();
      for (const photo of owner.photos || []) for (const key of ["id", "photoId", "assetId", "localId"]) if (photo[key]) reserved.add(photo[key]);
    }
  }
  const allocate = prefix => {
    const value = createUuid(), result = prefix ? `${prefix}-${value}` : value;
    if (!uuid(value) || allocated.has(value) || reserved.has(value) || reserved.has(result)) fail();
    allocated.add(value); reserved.add(result); return result;
  };
  const operationId = allocate(""), ownerTargets = [], photoTargets = [];
  for (const row of graph.selectedOwners) {
    const targetId = allocate(row.entityType), owner = frozen[row.entityType === "item" ? "items" : "containers"][row.sourceId];
    ownerTargets.push({ ...row, targetId, reuse: false });
    const seen = new Set();
    for (const photo of owner.photos || []) {
      const sourcePhotoId = photo.id || photo.localId;
      if (!id(sourcePhotoId) || seen.has(sourcePhotoId) || photoTargets.length >= 50) fail(); seen.add(sourcePhotoId);
      photoTargets.push({ entityType: row.entityType, sourceEntityId: row.sourceId, entityId: targetId,
        sourcePhotoId, photoId: allocate(""), assetId: allocate("") });
    }
  }
  return { version: 2, binding: clone(binding), operationId, source: chosenSource, sourcePayload: frozen,
    basePayload: base, baseStateRevision, copy: clone(copy), ownerTargets, photoTargets, editMeta: clone(editMeta) };
}
