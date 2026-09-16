import { canonicalTemplateJson as canonical, validTemplateOperationId } from "../sync/admin-template-protocol.js";
import { adminTemplatePhotoActionBinding } from "../sync/admin-template-photo-record.js";
import { assertAdminTemplatePhotoCopyEditor } from "../sync/admin-template-photo-copy-record.js";
import { projectAdminTemplateCopy } from "../sync/admin-template-copy-projection.js";
import { adminTemplatePhotoWholeCopySourceInventory } from "../sync/admin-template-photo-whole-copy-projection.js";

const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const clone = value => JSON.parse(canonical(value));
const id = value => typeof value === "string" && value.length <= 191 && /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const text = (value, max, empty = false) => typeof value === "string" && value.length <= max && (empty || value.length > 0)
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const freeze = value => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const fail = () => { throw Object.assign(Error("Исходный шаблон и выбранная копия требуют сверки. Новая копия не создана."),
  { code: "admin-template-photo-whole-copy-selection", isAdminTemplateBlocked: true }); };

// Capture the complete confirmed private editor before the first await. Server
// owner IDs are deterministic protocol allocations; local editor IDs remain
// separate. This selection grants no live namespace, persistence or POST rights.
export function allocateAdminTemplatePhotoWholeCopySelection(input, { newUuid = () => crypto.randomUUID() } = {}) {
  try {
    const value = clone(input);
    if (!exact(value, ["source", "sourcePayload", "targetKind", "metadata", "occupiedIds"])
      || !["demo", "shared"].includes(value.targetKind) || typeof newUuid !== "function"
      || !Array.isArray(value.occupiedIds) || !value.occupiedIds.every(id) || new Set(value.occupiedIds).size !== value.occupiedIds.length
      || !exact(value.metadata, ["title", "description", "language"]) || !text(value.metadata.title, 255)
      || !text(value.metadata.description, 10000, true) || !["ru", "en"].includes(value.metadata.language)) fail();
    const source = value.source, meta = source?.beforeState?.layouts?.[source?.layoutId]?.adminCausalSource;
    const sourceBinding = adminTemplatePhotoActionBinding(meta?.binding);
    if (!plain(meta) || ["treePending", "photoTreeCopyPending", "wholePending", "photoWholeCopyPending"]
      .some(key => Object.hasOwn(meta, key))) fail();
    const inventory = adminTemplatePhotoWholeCopySourceInventory({ payload: value.sourcePayload, listId: sourceBinding.listId });
    assertAdminTemplatePhotoCopyEditor({ binding: sourceBinding, revision: meta.base?.stateRevision, payload: value.sourcePayload, side: source });
    const occupied = new Set(value.occupiedIds);
    for (const key of [sourceBinding.listId, sourceBinding.itemKey, sourceBinding.itemKey.split(":")[1]]) if (key) occupied.add(key);
    for (const state of [value.sourcePayload, source.beforeState]) for (const type of ["layouts", "items", "containers"])
      Object.keys(state[type]).forEach(key => occupied.add(key));
    for (const owner of inventory.owners) for (const photo of owner.photos) {
      occupied.add(photo.sourcePhotoId); if (photo.reference.assetId) occupied.add(photo.reference.assetId);
    }
    const reserve = next => { if (occupied.has(next)) fail(); occupied.add(next); return next; };
    const allocate = () => {
      const next = newUuid();
      if (next && typeof next.then === "function") { Promise.resolve(next).catch(() => {}); fail(); }
      if (!validTemplateOperationId(next)) fail(); return reserve(next);
    };
    const operationId = allocate(), targetId = allocate();
    const binding = adminTemplatePhotoActionBinding({ ...sourceBinding,
      listId: reserve(`${value.targetKind === "demo" ? "public-demo-state" : "public-shared-layout"}-${targetId}`),
      itemKey: reserve(`${value.targetKind === "demo" ? "demo-state" : "shared-layout"}:${targetId}`) });
    const projected = projectAdminTemplateCopy(value.sourcePayload, operationId, value.metadata);
    reserve(projected.activeLayoutId);
    for (const type of ["containers", "items"]) Object.keys(projected[type]).forEach(reserve);
    const layoutId = allocate(), photos = [];
    const copiedOwners = inventory.owners.map(owner => {
      const type = owner.entityType === "item" ? "items" : "containers";
      const original = source.ownerMap.owners.find(row => row.type === type && row.serverId === owner.sourceEntityId);
      if (!original) fail();
      const index = Object.keys(value.sourcePayload[type]).sort().indexOf(owner.sourceEntityId);
      const selected = { entityType: owner.entityType, sourceLocalId: original.localId, localId: allocate(), serverId: Object.keys(projected[type])[index] };
      photos.push(owner.photos.map(photo => ({ sourcePhotoId: photo.sourcePhotoId, photoId: allocate(), assetId: allocate() })));
      return selected;
    });
    return freeze({ binding, operationId, sourcePayload: value.sourcePayload, snapshot: { version: 1, source,
      target: { layoutId, serverLayoutId: projected.activeLayoutId, metadata: value.metadata }, copiedOwners }, photos });
  } catch { fail(); }
}
