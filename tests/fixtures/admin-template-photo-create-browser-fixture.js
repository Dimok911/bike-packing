import { expect } from "@playwright/test";

// Independent fixture assembly: do not use the production create projector to
// invent the expected result that the browser's production validator checks.
export function createPhotoBrowserOwner(payload, create) {
  for (const type of ["layouts", "items", "containers"]) expect(payload[type][create.entityId]).toBeUndefined();
  const fields = structuredClone(create.fields);
  if (fields.dimensions === null) delete fields.dimensions;
  const item = create.entityType === "item";
  const row = item ? { id: create.entityId, quantity: 1, containerId: "", ...fields, photos: [] }
    : { id: create.entityId, parentId: null, childIds: [], itemIds: [], order: [], ...fields, photos: [] };
  if (item && create.formContext.availabilityStatus !== "available") row.availabilityStatus = create.formContext.availabilityStatus;
  payload[item ? "items" : "containers"][row.id] = row;
}

export function placePhotoBrowserOwner(payload, create) {
  const place = create.formContext.placement;
  if (!place) return;
  const layout = payload.layouts[place.layoutId], arrangement = layout.arrangement;
  expect(layout).toBeTruthy();
  if (create.entityType === "item") {
    const target = arrangement.containers[place.containerId]; expect(target).toBeTruthy();
    target.itemIds.push(create.entityId); target.order.push({ type: "item", id: create.entityId });
    arrangement.items[create.entityId] = place.containerId; arrangement.itemQuantities[create.entityId] = place.quantity;
    payload.items[create.entityId].containerId = place.containerId;
    payload.containers[place.containerId].itemIds = structuredClone(target.itemIds);
    payload.containers[place.containerId].order = structuredClone(target.order);
  } else {
    payload.containers[create.entityId].parentId = "";
    arrangement.containers[create.entityId] = { parentId: "", childIds: [], itemIds: [], order: [] };
    arrangement.rootContainerIds.push(create.entityId); layout.rootContainerIds.push(create.entityId);
  }
  for (const key of ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]) layout[key] = create.fields[key];
}
