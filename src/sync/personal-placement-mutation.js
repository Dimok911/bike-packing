import { getItemContainerIdInLayout, removeItemFromLayoutInState, removeContainerFromLayoutOnlyInState,
  moveItemInLayoutArrangement, moveContainerInLayoutArrangement, moveRootColumnInState, createGroupFromItemsInState } from "../state/layout-ops.js";
import { deleteUnusedLayoutContainerEntityFromState } from "../state/container-ops.js";

const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const validIds = ids => Array.isArray(ids) && ids.every(validId) && new Set(ids).size === ids.length;
const privateRecord = record => record && !record.adminDemo && !record.adminSharedSourceId && !record.publicCatalogLayoutId;
const difference = (before, after) => Object.keys(before || {}).filter(id => !Object.hasOwn(after || {}, id));
const actions = new Set(["remove-item", "remove-container", "set-packed", "move-item", "move-container", "move-root", "group-items"]);
const moves = new Set(["move-item", "move-container", "move-root"]);
const validIndex = index => index === null || Number.isSafeInteger(index) && index >= 0;
const expectedCount = action => action === "group-items" ? 2 : 1;

export function personalPlacementIntent(value) {
  if (value?.type !== "placement" || value.version !== 1 || !validId(value.layoutId)
    || !actions.has(value.action)
    || !validIds(value.ids) || !value.ids.length || value.action !== "set-packed" && value.ids.length !== expectedCount(value.action)
    || value.action === "set-packed" && typeof value.packed !== "boolean"
    || moves.has(value.action) && (!validIndex(value.targetIndex) || value.action !== "move-root" && !validId(value.targetContainerId))
    || value.action === "group-items" && !validId(value.groupId)
    || ![value.removedItemIds, value.removedContainerIds, value.deletedContainerIds].every(validIds)
    || !value.action.startsWith("remove-") && (value.removedItemIds.length || value.removedContainerIds.length || value.deletedContainerIds.length)
    || value.action === "remove-item" && (value.removedItemIds.length !== 1 || value.removedItemIds[0] !== value.ids[0] || value.deletedContainerIds.length)
    || value.action === "remove-container" && !value.removedContainerIds.includes(value.ids[0])
    || value.deletedContainerIds.some(id => !value.removedContainerIds.includes(id))) throw Error("Не подтверждён состав изменения укладки.");
  return clone({ type: "placement", version: 1, layoutId: value.layoutId, action: value.action, ids: value.ids,
    ...(value.action === "set-packed" ? { packed: value.packed } : {}),
    ...(moves.has(value.action) ? { targetIndex: value.targetIndex, ...(value.action !== "move-root" ? { targetContainerId: value.targetContainerId } : {}) } : {}),
    ...(value.action === "group-items" ? { groupId: value.groupId } : {}), removedItemIds: value.removedItemIds,
    removedContainerIds: value.removedContainerIds, deletedContainerIds: value.deletedContainerIds });
}

export function preparePersonalPlacementMutation(state, { layoutId, action, ids, packed, targetContainerId, targetIndex = null, groupId },
  { changedAt = "", markEdited = () => {}, hasPhotos = record => Boolean(record.photos?.length) } = {}) {
  const unpackAll = action === "unpack-all";
  if (unpackAll) { action = "set-packed"; packed = false; }
  const layout = state?.layouts?.[layoutId];
  if (!validId(layoutId) || !privateRecord(layout) || layoutId !== state.activeLayoutId || !layout.arrangement
    || !validIds(ids) || !ids.length || !actions.has(action)
    || action !== "set-packed" && ids.length !== expectedCount(action) || action === "set-packed" && typeof packed !== "boolean"
    || moves.has(action) && (!validIndex(targetIndex) || action !== "move-root" && (!validId(targetContainerId)
      || !privateRecord(state.containers?.[targetContainerId]) || !layout.arrangement.containers?.[targetContainerId]))
    || action === "group-items" && (!validId(groupId) || Object.hasOwn(state.containers || {}, groupId))) {
    throw Error("Укладка изменилась. Повторите выбор.");
  }
  const field = ["remove-container", "move-container", "move-root"].includes(action) ? "containers" : "items";
  if (ids.some(id => !privateRecord(state[field]?.[id]) || (field === "items"
    ? !getItemContainerIdInLayout(state, layout, id)
    : !layout.arrangement.containers?.[id]))) {
    throw Error("Выбранная запись больше не находится в этой укладке.");
  }
  const snapshot = clone(state), next = snapshot.layouts[layoutId];
  if (unpackAll) snapshot.showOnlyUnpacked = false;
  if (action === "set-packed") {
    next.arrangement.packedItems ||= {};
    for (const id of ids) {
      if (packed) next.arrangement.packedItems[id] = true;
      else delete next.arrangement.packedItems[id];
      markEdited(snapshot.items[id], changedAt);
    }
  } else if (moves.has(action)) {
    const moved = action === "move-item" ? moveItemInLayoutArrangement(snapshot, next, ids[0], targetContainerId, targetIndex)
      : action === "move-container" ? moveContainerInLayoutArrangement(snapshot, next, ids[0], targetContainerId, targetIndex)
      : moveRootColumnInState(snapshot, layoutId, ids[0], targetIndex);
    if (!moved) throw Error("Не удалось подготовить выбранное перемещение.");
  } else if (action === "group-items") {
    // Grouping moves existing records; their placement quantities must not be
    // reset by the remove/reinsert implementation.
    const quantities = Object.fromEntries(ids.map(id => [id, next.arrangement.itemQuantities?.[id] ?? 1]));
    if (!createGroupFromItemsInState(snapshot, layoutId, ids[0], ids[1], { groupId, changedAt })) throw Error("Не удалось подготовить группу.");
    Object.assign(next.arrangement.itemQuantities ||= {}, quantities);
    markEdited(snapshot.containers[groupId], changedAt);
  } else if (action === "remove-item") {
    if (!removeItemFromLayoutInState(snapshot, layoutId, ids[0])) throw Error("Не удалось подготовить удаление из укладки.");
  } else if (!removeContainerFromLayoutOnlyInState(snapshot, next, ids[0], { changedAt, markEdited,
    deleteUnusedLayoutContainerEntity: (id, removedFrom) => deleteUnusedLayoutContainerEntityFromState(snapshot, id, removedFrom, {
      beforeDeleteContainer: record => {
        if (hasPhotos(record)) throw Error("Удаление вложенного контейнера с фото ждёт файлового адаптера. Данные оставлены без изменений.");
      }
    }) })) throw Error("Не удалось подготовить удаление сумки из укладки.");
  markEdited(next, changedAt);
  snapshot.packedItems = clone(next.arrangement.packedItems || {});
  const intent = personalPlacementIntent({ type: "placement", version: 1, layoutId, action, ids, packed, targetContainerId, targetIndex, groupId,
    removedItemIds: difference(layout.arrangement.items, next.arrangement.items),
    removedContainerIds: difference(layout.arrangement.containers, next.arrangement.containers),
    deletedContainerIds: difference(state.containers, snapshot.containers) });
  return { snapshot, intent };
}

// Only the explicitly removed relationships are subtracted from the loss
// comparison. Never replay the source tree against a newer/different baseline.
export function reducePersonalPlacementReference(reference, value, payload) {
  const intent = personalPlacementIntent(value), current = payload?.layouts?.[intent.layoutId];
  if (!current || intent.removedItemIds.some(id => Object.hasOwn(current.arrangement?.items || {}, id))
    || intent.removedContainerIds.some(id => Object.hasOwn(current.arrangement?.containers || {}, id))
    || intent.deletedContainerIds.some(id => Object.hasOwn(payload.containers || {}, id))) throw Error("Снимок не соответствует заявленному удалению размещений.");
  const layout = reference.layouts?.[intent.layoutId], removedItems = new Set(intent.removedItemIds), removedContainers = new Set(intent.removedContainerIds);
  if (layout?.arrangement) {
    for (const id of removedItems) {
      delete layout.arrangement.items?.[id]; delete layout.arrangement.packedItems?.[id]; delete layout.arrangement.itemQuantities?.[id];
    }
    for (const id of removedContainers) delete layout.arrangement.containers?.[id];
    layout.rootContainerIds = (layout.rootContainerIds || []).filter(id => !removedContainers.has(id));
    layout.arrangement.rootContainerIds = (layout.arrangement.rootContainerIds || []).filter(id => !removedContainers.has(id));
    for (const placement of Object.values(layout.arrangement.containers || {})) {
      placement.itemIds = (placement.itemIds || []).filter(id => !removedItems.has(id));
      placement.childIds = (placement.childIds || []).filter(id => !removedContainers.has(id));
      placement.order = (placement.order || []).filter(entry => !(entry.type === "item" ? removedItems : removedContainers).has(entry.id));
    }
  }
  for (const id of intent.deletedContainerIds) delete reference.containers?.[id];
  // Runtime links are mirrors of the active arrangement, not another source
  // from which regression repair may bring the confirmed removals back.
  if (!reference.activeLayoutId || reference.activeLayoutId === intent.layoutId) {
    for (const id of removedItems) {
      if (reference.items?.[id]) reference.items[id].containerId = "";
      delete reference.packedItems?.[id];
    }
    for (const [id, record] of Object.entries(reference.containers || {})) {
      if (removedContainers.has(id)) { record.parentId = null; record.itemIds = []; record.childIds = []; record.order = []; }
      else {
        record.itemIds = (record.itemIds || []).filter(id => !removedItems.has(id));
        record.childIds = (record.childIds || []).filter(id => !removedContainers.has(id));
        record.order = (record.order || []).filter(entry => !(entry.type === "item" ? removedItems : removedContainers).has(entry.id));
      }
    }
  }
  return reference;
}
