import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";
import { personalPhotoFormLayoutInventory } from "./personal-photo-form-layout.js";

export const PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_ENABLED = false;
export const PERSONAL_PHOTO_CONTAINER_FORM_CONTEXT_CAPABILITY = "personalCausalPhotoContainerFormContextV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = () => { throw Object.assign(Error("Место сумки и полный состав укладки не подтверждены. Поля и фотографии сохранены в форме."), { code: "photo-container-form-context" }); };

// One selected complete layout, never a fresh lookup at dispatch time. New
// empty bags and existing placed subtrees keep the same identities throughout.
export function personalPhotoContainerFormContext(body, state = null) {
  const context = body?.containerFormContext;
  if (body?.action !== "form" || body.entityType !== "container" || !id(body.entityId)
    || Object.hasOwn(body, "copySource") || Object.hasOwn(body, "formContext")
    || !exact(context, ["version", "targetLayout", "sourceLayout", "targetParentId", "targetIndex", "layoutFields"])
    || context.version !== 1 || context.targetParentId !== "" && !id(context.targetParentId)
    || context.targetIndex !== null && (!Number.isSafeInteger(context.targetIndex) || context.targetIndex < 0)
    || !plain(context.layoutFields) || Object.keys(context.layoutFields).some(key => !["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key))
    || Object.values(context.layoutFields).some(value => typeof value !== "string" || value.length > 255)) fail();
  const inventory = personalPhotoFormLayoutInventory(context.targetLayout, state, fail);
  const before = context.targetLayout.arrangement, previous = before.containers[body.entityId];
  const created = body.baseEntityRevision === 0 || [4, 5].includes(body.ownerResult?.version);
  if (context.sourceLayout !== null) {
    if (!plain(context.sourceLayout) || created || previous || context.sourceLayout.id === context.targetLayout.id) fail();
    personalPhotoFormLayoutInventory(context.sourceLayout, state, fail);
    if (!context.sourceLayout.arrangement.containers[body.entityId]) fail();
  }
  if (inventory.items.has(body.entityId) || created && previous
    || context.targetParentId && !inventory.containers.has(context.targetParentId)
    || state && Object.values(state.layouts || {}).some(layout => layout.locked && Object.hasOwn(layout.arrangement?.containers || {}, body.entityId))) fail();
  const sourceOwner = state?.containers?.[body.entityId];
  if (!created && state && !isPersonalPhotoPrivateOwner(sourceOwner)) fail();
  const nestable = body.fields?.nestable ?? sourceOwner?.nestable;
  const previousParentId = previous?.parentId || "";
  if ((created || state) && nestable !== true && (context.targetParentId && !previousParentId || !context.targetParentId && previousParentId)) fail();
  const source = previous ? before : context.sourceLayout?.arrangement;
  const selected = new Set(), selectedItems = new Set();
  const visit = containerId => {
    selected.add(containerId);
    for (const itemId of source.containers[containerId].itemIds) selectedItems.add(itemId);
    for (const child of source.containers[containerId].childIds) visit(child);
  };
  if (source) visit(body.entityId);
  if (!previous && ([...selected].some(value => inventory.containers.has(value) || inventory.items.has(value))
    || [...selectedItems].some(value => inventory.items.has(value) || inventory.containers.has(value)))) fail();
  if (context.targetParentId === body.entityId || selected.has(context.targetParentId)) fail();
  const layout = clone(context.targetLayout), a = layout.arrangement;
  // Every subtree row, item quantity and packed bit remains untouched. Only
  // this root's parent membership and exact insertion position are changed.
  a.rootContainerIds = a.rootContainerIds.filter(value => value !== body.entityId);
  for (const row of Object.values(a.containers)) {
    row.childIds = row.childIds.filter(value => value !== body.entityId);
    row.order = row.order.filter(entry => !(entry.type === "container" && entry.id === body.entityId));
  }
  if (!previous && source) {
    for (const containerId of selected) {
      const original = source.containers[containerId];
      a.containers[containerId] = { parentId: original.parentId, childIds: clone(original.childIds), itemIds: clone(original.itemIds), order: clone(original.order) };
    }
    for (const itemId of selectedItems) { a.items[itemId] = source.items[itemId]; a.itemQuantities[itemId] = 1; }
  }
  const row = a.containers[body.entityId] || { parentId: "", childIds: [], itemIds: [], order: [] };
  a.containers[body.entityId] = row; row.parentId = context.targetParentId;
  if (context.targetParentId) {
    const parent = a.containers[context.targetParentId];
    // The picker records an insertion slot before removal of the old member.
    const oldIndex = previousParentId === context.targetParentId
      ? before.containers[context.targetParentId].order.findIndex(entry => entry.type === "container" && entry.id === body.entityId) : -1;
    const requested = context.targetIndex === null ? parent.order.length
      : context.targetIndex - Number(oldIndex >= 0 && oldIndex < context.targetIndex);
    const index = Math.min(requested, parent.order.length);
    parent.childIds.push(body.entityId); parent.order.splice(index, 0, { type: "container", id: body.entityId });
  } else a.rootContainerIds.splice(context.targetIndex === null ? a.rootContainerIds.length : Math.min(context.targetIndex, a.rootContainerIds.length), 0, body.entityId);
  layout.rootContainerIds = [...a.rootContainerIds]; Object.assign(layout, clone(context.layoutFields));
  return { layout, targetLayoutId: layout.id };
}

export function applyPersonalPhotoContainerFormContext(state, body, basePayload = state) {
  const context = personalPhotoContainerFormContext(body, basePayload);
  if (!isPersonalPhotoPrivateOwner(state.containers?.[body.entityId])) fail();
  state.layouts[context.targetLayoutId] = context.layout;
  return context;
}

export function refreshPersonalPhotoContainerContextView(snapshot, context) {
  if (snapshot.activeLayoutId !== context.targetLayoutId) return;
  const a = context.layout.arrangement;
  for (const [containerId, row] of Object.entries(a.containers)) {
    Object.assign(snapshot.containers[containerId], { parentId: row.parentId || null,
      childIds: clone(row.childIds), itemIds: clone(row.itemIds), order: clone(row.order) });
  }
  for (const [itemId, containerId] of Object.entries(a.items)) snapshot.items[itemId].containerId = containerId;
  snapshot.packedItems = clone(a.packedItems);
}
