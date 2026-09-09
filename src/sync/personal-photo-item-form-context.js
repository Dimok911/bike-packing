import { isPersonalPhotoPrivateOwner } from "./personal-photo-private-owner.js";

export const PERSONAL_PHOTO_ITEM_FORM_CONTEXT_ENABLED = false;
export const PERSONAL_PHOTO_ITEM_FORM_CONTEXT_CAPABILITY = "personalCausalPhotoItemFormContextV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const canonical = value => JSON.stringify(value && typeof value === "object"
  ? Array.isArray(value) ? value.map(entry => JSON.parse(canonical(entry)))
    : Object.fromEntries(Object.keys(value).sort().map(key => [key, JSON.parse(canonical(value[key]))])) : value);
const same = (a, b) => canonical(a) === canonical(b);
const exact = (value, keys) => plain(value) && same(Object.keys(value).sort(), [...keys].sort());
const fail = () => { throw Object.assign(Error("Место, количество или доступность вещи не подтверждены. Поля и фото сохранены в форме."), { code: "photo-item-form-context" }); };

// Validate the complete selected layout before changing a single link. This
// compiler never repairs an incomplete order, invents an owner or rereads a
// newer target. The API mirrors it and checks the same frozen selection.
function layoutInventory(layout, state) {
  const a = layout?.arrangement;
  if (!isPersonalPhotoPrivateOwner(layout) || layout.locked || !plain(a) || !ids(layout.rootContainerIds)
    || !ids(a.rootContainerIds) || !same(layout.rootContainerIds, a.rootContainerIds)
    || ![a.containers, a.items, a.itemQuantities, a.packedItems].every(plain)
    || state && !same(state.layouts?.[layout.id], layout)) fail();
  const containers = new Set(), items = new Set();
  const walk = (containerId, parentId) => {
    const row = a.containers[containerId];
    if (containers.has(containerId) || !plain(row) || row.parentId !== parentId || !ids(row.childIds)
      || !ids(row.itemIds) || !Array.isArray(row.order)
      || state && !isPersonalPhotoPrivateOwner(state.containers?.[containerId])) fail();
    containers.add(containerId); const ordered = new Set();
    for (const entry of row.order) {
      if (!exact(entry, ["type", "id"]) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id) || ordered.has(`${entry.type}:${entry.id}`)) fail();
      ordered.add(`${entry.type}:${entry.id}`);
    }
    if (ordered.size !== row.itemIds.length + row.childIds.length) fail();
    for (const itemId of row.itemIds) {
      if (items.has(itemId) || a.items[itemId] !== containerId || !Number.isSafeInteger(a.itemQuantities[itemId]) || a.itemQuantities[itemId] < 1
        || state && !isPersonalPhotoPrivateOwner(state.items?.[itemId])) fail();
      items.add(itemId);
    }
    for (const childId of row.childIds) walk(childId, containerId);
  };
  for (const root of a.rootContainerIds) walk(root, "");
  if (Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items).some(key => !items.has(key))
    || Object.keys(a.itemQuantities).some(key => !items.has(key))
    || Object.entries(a.packedItems).some(([key, value]) => !items.has(key) || typeof value !== "boolean")) fail();
  return { containers, items };
}

export function personalPhotoItemFormContext(body, state = null) {
  const context = body?.formContext;
  if (body?.action !== "form" || body.entityType !== "item" || !id(body.entityId) || Object.hasOwn(body, "copySource")
    || !exact(context, ["version", "availabilityStatus", "placement"]) || context.version !== 1
    || !["available", "lost", "broken", "retired"].includes(context.availabilityStatus)
    || state && Object.values(state.layouts || {}).some(layout => layout.locked && Object.hasOwn(layout.arrangement?.items || {}, body.entityId))) fail();
  const result = { availabilityStatus: context.availabilityStatus, layout: null, targetLayoutId: null };
  if (context.placement === null) return result;
  const placement = context.placement;
  if (!exact(placement, ["targetLayout", "targetContainerId", "quantity", "layoutFields"])
    || placement.targetContainerId !== "" && !id(placement.targetContainerId)
    || !Number.isSafeInteger(placement.quantity) || placement.quantity < 1
    || !plain(placement.layoutFields) || Object.keys(placement.layoutFields).some(key => !["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key))
    || Object.values(placement.layoutFields).some(value => typeof value !== "string" || value.length > 255)) fail();
  const inventory = layoutInventory(placement.targetLayout, state), before = placement.targetLayout.arrangement;
  const previousContainerId = before.items[body.entityId] || "", targetContainerId = placement.targetContainerId;
  if (inventory.containers.has(body.entityId) || body.baseEntityRevision === 0 && inventory.items.has(body.entityId)
    || targetContainerId && !inventory.containers.has(targetContainerId)
    || targetContainerId !== previousContainerId && targetContainerId && context.availabilityStatus !== "available"
    || !targetContainerId && placement.quantity !== 1) fail();
  const layout = clone(placement.targetLayout), a = layout.arrangement;
  if (targetContainerId !== previousContainerId) {
    for (const row of Object.values(a.containers)) {
      row.itemIds = row.itemIds.filter(itemId => itemId !== body.entityId);
      row.order = row.order.filter(entry => !(entry.type === "item" && entry.id === body.entityId));
    }
    delete a.items[body.entityId]; delete a.itemQuantities[body.entityId]; delete a.packedItems[body.entityId];
    if (targetContainerId) {
      a.items[body.entityId] = targetContainerId;
      a.containers[targetContainerId].itemIds.push(body.entityId);
      a.containers[targetContainerId].order.push({ type: "item", id: body.entityId });
    }
  }
  if (targetContainerId) a.itemQuantities[body.entityId] = placement.quantity;
  Object.assign(layout, clone(placement.layoutFields));
  return { ...result, layout, targetLayoutId: layout.id };
}

export function personalPhotoItemContextOwner(owner, context) {
  const result = clone(owner);
  if (context.availabilityStatus === "available") delete result.availabilityStatus;
  else result.availabilityStatus = context.availabilityStatus;
  return result;
}

// The caller owns this candidate clone. The original base and manifest remain
// immutable; display placement mirrors are handled only by the UI adapter.
export function applyPersonalPhotoItemFormContext(state, body, basePayload = state) {
  const context = personalPhotoItemFormContext(body, basePayload);
  if (!isPersonalPhotoPrivateOwner(state.items?.[body.entityId])) fail();
  state.items[body.entityId] = personalPhotoItemContextOwner(state.items[body.entityId], context);
  if (context.layout) state.layouts[context.targetLayoutId] = context.layout;
  return context;
}

// UI-only mirrors of the already validated active arrangement. No repair,
// migration or normalization can silently change the captured business state.
export function refreshPersonalPhotoItemContextView(snapshot, context, entityId) {
  if (!context.targetLayoutId || snapshot.activeLayoutId !== context.targetLayoutId) return;
  const a = context.layout.arrangement;
  snapshot.items[entityId].containerId = a.items[entityId] || "";
  for (const [containerId, row] of Object.entries(a.containers)) {
    snapshot.containers[containerId].itemIds = clone(row.itemIds);
    snapshot.containers[containerId].order = clone(row.order);
  }
  snapshot.packedItems = clone(a.packedItems);
}
