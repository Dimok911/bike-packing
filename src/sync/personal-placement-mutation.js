import { getItemContainerIdInLayout, removeItemFromLayoutInState, removeContainerFromLayoutOnlyInState,
  moveItemInLayoutArrangement, moveContainerInLayoutArrangement, moveRootColumnInState, createGroupFromItemsInState,
  placeExistingContainerInLayoutInState, placeExistingItemInLayoutInState, addRootContainerToLayoutInState } from "../state/layout-ops.js";
import { deleteUnusedLayoutContainerEntityFromState } from "../state/container-ops.js";
import { replaceItemInLayoutState, replaceContainerInLayoutState, isTemporaryContainerInLayoutState } from "../state/layout-replace.js";
import { isItemUnavailableForPacking } from "../state/layout-locks.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";

const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const validIds = ids => Array.isArray(ids) && ids.every(validId) && new Set(ids).size === ids.length;
const privateRecord = record => record && !record.adminDemo && !record.adminSharedSourceId && !record.publicCatalogLayoutId;
const difference = (before, after) => Object.keys(before || {}).filter(id => !Object.hasOwn(after || {}, id));
const actions = new Set(["remove-item", "remove-container", "set-packed", "move-item", "move-container", "move-root", "group-items", "replace-item", "replace-container", "lift-container", "link-item", "link-container", "link-root"]);
const links = new Set(["link-item", "link-container", "link-root"]);
const targeted = new Set(["move-item", "move-container", "link-item", "link-container"]);
const moves = new Set(["move-item", "move-container", "move-root"]);
const replacements = new Set(["replace-item", "replace-container"]);
const removals = new Set(["remove-item", "remove-container", "replace-item", "replace-container", "lift-container"]);
const validIndex = index => index === null || Number.isSafeInteger(index) && index >= 0;
const expectedCount = action => action === "group-items" ? 2 : 1;

export function personalPlacementIntent(value) {
  if (value?.type !== "placement" || value.version !== 1 || !validId(value.layoutId)
    || !actions.has(value.action)
    || !validIds(value.ids) || !value.ids.length || value.action !== "set-packed" && value.ids.length !== expectedCount(value.action)
    || value.action === "set-packed" && typeof value.packed !== "boolean"
    || moves.has(value.action) && (!validIndex(value.targetIndex) || value.action !== "move-root" && !validId(value.targetContainerId))
    || value.action === "group-items" && !validId(value.groupId)
    || replacements.has(value.action) && (!validId(value.replacementId) || value.ids.includes(value.replacementId))
    || value.action === "lift-container" && !validIndex(value.targetIndex)
    || links.has(value.action) && (!validIndex(value.targetIndex) || ![value.linkedItemIds, value.linkedContainerIds].every(validIds)
      || value.action === "link-root" && typeof value.includeContents !== "boolean"
      || targeted.has(value.action) && !validId(value.targetContainerId)
      || value.action === "link-item" && (value.linkedItemIds.length !== 1 || value.linkedItemIds[0] !== value.ids[0] || value.linkedContainerIds.length)
      || value.action !== "link-item" && !value.linkedContainerIds.includes(value.ids[0]))
    || ![value.removedItemIds, value.removedContainerIds, value.deletedContainerIds].every(validIds)
    || !removals.has(value.action) && (value.removedItemIds.length || value.removedContainerIds.length || value.deletedContainerIds.length)
    || value.action === "remove-item" && (value.removedItemIds.length !== 1 || value.removedItemIds[0] !== value.ids[0] || value.deletedContainerIds.length)
    || value.action === "remove-container" && !value.removedContainerIds.includes(value.ids[0])
    || value.action === "replace-item" && (value.removedItemIds.length !== 1 || value.removedItemIds[0] !== value.ids[0] || value.deletedContainerIds.length)
    || value.action === "replace-container" && (value.removedContainerIds.length !== 1 || value.removedContainerIds[0] !== value.ids[0] || value.removedItemIds.length)
    || value.action === "lift-container" && (value.removedItemIds.length || value.deletedContainerIds.length || value.removedContainerIds.includes(value.ids[0]))
    || value.deletedContainerIds.some(id => !value.removedContainerIds.includes(id))) throw Error("Не подтверждён состав изменения укладки.");
  return clone({ type: "placement", version: 1, layoutId: value.layoutId, action: value.action, ids: value.ids,
    ...(value.action === "set-packed" ? { packed: value.packed } : {}),
    ...(moves.has(value.action) ? { targetIndex: value.targetIndex, ...(value.action !== "move-root" ? { targetContainerId: value.targetContainerId } : {}) } : {}),
    ...(value.action === "group-items" ? { groupId: value.groupId } : {}), removedItemIds: value.removedItemIds,
    ...(replacements.has(value.action) ? { replacementId: value.replacementId } : {}),
    ...(value.action === "lift-container" ? { targetIndex: value.targetIndex } : {}),
    ...(links.has(value.action) ? { targetIndex: value.targetIndex, linkedItemIds: value.linkedItemIds, linkedContainerIds: value.linkedContainerIds,
      ...(value.action === "link-root" ? { includeContents: value.includeContents } : { targetContainerId: value.targetContainerId }) } : {}),
    removedContainerIds: value.removedContainerIds, deletedContainerIds: value.deletedContainerIds });
}

// Root selection may include a catalog tree. Validate the complete frozen read
// set before invoking legacy normalization, which may otherwise silently move
// an already placed item or truncate a malformed/cyclic source tree.
function validateRootReadSet(state, layout, rootId, includeContents) {
  const containers = new Set(), items = new Set(), linked = new Map();
  if (includeContents) for (const [id, record] of Object.entries(state.items || {})) {
    if (!linked.has(record.containerId)) linked.set(record.containerId, []);
    linked.get(record.containerId).push(id);
  }
  const walk = id => {
    const record = state.containers?.[id];
    if (!validId(id) || !privateRecord(record) || containers.has(id) || layout.arrangement.containers?.[id]) throw Error("Состав выбранной сумки изменился или уже используется в этой укладке.");
    containers.add(id);
    if (!includeContents) return;
    const itemIds = [...new Set([...(record.itemIds || []), ...(linked.get(id) || [])])];
    for (const itemId of itemIds) {
      if (!validId(itemId) || !privateRecord(state.items?.[itemId]) || isItemUnavailableForPacking(state.items[itemId])
        || items.has(itemId) || getItemContainerIdInLayout(state, layout, itemId)) throw Error("Не подтверждён состав вещей выбранной сумки.");
      items.add(itemId);
    }
    if (!validIds(record.childIds || [])) throw Error("Не подтверждён состав вложенных контейнеров.");
    for (const childId of record.childIds || []) walk(childId);
  };
  walk(rootId);
  return { linkedItemIds: [...items], linkedContainerIds: [...containers] };
}

export function preparePersonalPlacementMutation(state, { layoutId, action, ids, packed, targetContainerId, targetIndex = null, groupId, replacementId, includeContents = true },
  { changedAt = "", markEdited = () => {}, hasPhotos = record => Boolean(record.photos?.length) } = {}) {
  const unpackAll = action === "unpack-all";
  if (unpackAll) { action = "set-packed"; packed = false; }
  const layout = state?.layouts?.[layoutId];
  if (!validId(layoutId) || !privateRecord(layout) || layoutId !== state.activeLayoutId && action !== "link-item" || !layout.arrangement
    || !validIds(ids) || !ids.length || !actions.has(action)
    || action !== "set-packed" && ids.length !== expectedCount(action) || action === "set-packed" && typeof packed !== "boolean"
    || (moves.has(action) || links.has(action)) && (!validIndex(targetIndex) || targeted.has(action) && (!validId(targetContainerId)
      || !privateRecord(state.containers?.[targetContainerId]) || !layout.arrangement.containers?.[targetContainerId]))
    || action === "group-items" && (!validId(groupId) || Object.hasOwn(state.containers || {}, groupId))) {
    throw Error("Укладка изменилась. Повторите выбор.");
  }
  const field = ["remove-container", "move-container", "move-root", "replace-container", "lift-container", "link-container", "link-root"].includes(action) ? "containers" : "items";
  const isPlaced = id => Boolean(field === "items" ? getItemContainerIdInLayout(state, layout, id) : layout.arrangement.containers?.[id]);
  if (ids.some(id => !privateRecord(state[field]?.[id]) || (links.has(action) ? isPlaced(id) : !isPlaced(id)))) {
    throw Error("Выбранная запись больше не находится в этой укладке.");
  }
  if (replacements.has(action) && (!validId(replacementId) || ids.includes(replacementId) || !privateRecord(state[field]?.[replacementId]))) {
    throw Error("Не подтверждена выбранная замена.");
  }
  if (action === "lift-container" && (!validIndex(targetIndex) || state.containers[ids[0]].nestable !== true
    || !layout.arrangement.containers[ids[0]].parentId)) throw Error("Нельзя вынести выбранный контейнер в отдельную колонку.");
  if (action === "link-item" && isItemUnavailableForPacking(state.items[ids[0]])
    || action === "link-container" && state.containers[ids[0]].nestable !== true
    || action === "link-root" && typeof includeContents !== "boolean") throw Error("Выбранную запись нельзя добавить в эту укладку.");
  const readSet = action === "link-root" ? validateRootReadSet(state, layout, ids[0], includeContents) : null;
  const snapshot = clone(state), next = snapshot.layouts[layoutId];
  if (unpackAll) snapshot.showOnlyUnpacked = false;
  if (links.has(action)) {
    const linked = action === "link-item" ? placeExistingItemInLayoutInState(snapshot, ids[0], targetContainerId, layoutId, { changedAt, targetIndex })
      : action === "link-container" ? placeExistingContainerInLayoutInState(snapshot, ids[0], targetContainerId, layoutId, { changedAt, targetIndex })
      : addRootContainerToLayoutInState(snapshot, layoutId, ids[0], targetIndex, { changedAt, includeContents });
    if (!linked) throw Error("Не удалось подготовить добавление в укладку.");
    normalizeLayoutArrangement(next, snapshot);
  } else if (action === "set-packed") {
    next.arrangement.packedItems ||= {};
    for (const id of ids) {
      if (packed) next.arrangement.packedItems[id] = true;
      else delete next.arrangement.packedItems[id];
      markEdited(snapshot.items[id], changedAt);
    }
  } else if (replacements.has(action)) {
    const replaced = action === "replace-item" ? replaceItemInLayoutState(snapshot, layoutId, ids[0], replacementId, { changedAt })
      : replaceContainerInLayoutState(snapshot, layoutId, ids[0], replacementId, { changedAt,
        removeSourceRecord: isTemporaryContainerInLayoutState(snapshot, next, ids[0]),
        beforeRemoveSource: record => {
          if (hasPhotos(record)) throw Error("Замена вложенного контейнера с фото ждёт файлового адаптера. Данные оставлены без изменений.");
        } });
    if (!replaced) throw Error("Не удалось подготовить выбранную замену.");
  } else if (action === "lift-container") {
    if (!placeExistingContainerInLayoutInState(snapshot, ids[0], "", layoutId, { changedAt, targetIndex })) {
      throw Error("Не удалось подготовить отдельную колонку.");
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
  if (layoutId === state.activeLayoutId) snapshot.packedItems = clone(next.arrangement.packedItems || {});
  const linkedItemIds = links.has(action) ? difference(next.arrangement.items, layout.arrangement.items) : [];
  const linkedContainerIds = links.has(action) ? difference(next.arrangement.containers, layout.arrangement.containers) : [];
  if (readSet && (JSON.stringify([...readSet.linkedItemIds].sort()) !== JSON.stringify([...linkedItemIds].sort())
    || JSON.stringify([...readSet.linkedContainerIds].sort()) !== JSON.stringify([...linkedContainerIds].sort()))) throw Error("Состав добавления не совпал с выбранной сумкой.");
  const intent = personalPlacementIntent({ type: "placement", version: 1, layoutId, action, ids, packed, targetContainerId, targetIndex, groupId, replacementId, includeContents, linkedItemIds, linkedContainerIds,
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
