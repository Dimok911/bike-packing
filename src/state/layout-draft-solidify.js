import { createEmptyLayoutArrangement, uniqueLayoutIds } from "./layout-arrangement.js";
import { templateCopySourceRootIds } from "./layout-manage.js";
import { normalizeLayoutArrangement, snapshotContainerTreeFromLayoutArrangement } from "./layout-normalize.js";

function layoutArrangementRecordScore(arrangement) {
  if (!arrangement || typeof arrangement !== "object") return 0;
  return Object.keys(arrangement.containers || {}).length + Object.keys(arrangement.items || {}).length * 2;
}

function containerTreeSnapshotScore(snapshot) {
  if (!snapshot) return 0;
  return Object.keys(snapshot.containers || {}).length + Object.keys(snapshot.items || {}).length * 2;
}

function templateDraftRootSnapshot(targetState, layoutId, rootId, { liveSnapshotForRoot = null } = {}) {
  const arrangementSnapshot = snapshotContainerTreeFromLayoutArrangement(rootId, { sourceLayoutId: layoutId, targetState });
  if (layoutId !== targetState?.activeLayoutId || typeof liveSnapshotForRoot !== "function") return arrangementSnapshot;
  const liveSnapshot = liveSnapshotForRoot(rootId);
  return containerTreeSnapshotScore(liveSnapshot) > containerTreeSnapshotScore(arrangementSnapshot)
    ? liveSnapshot
    : arrangementSnapshot;
}

function layoutArrangementFromContainerSnapshots(targetState, snapshots) {
  const arrangement = createEmptyLayoutArrangement();
  snapshots.forEach((snapshot) => {
    if (!snapshot?.rootId || !targetState.containers?.[snapshot.rootId]) return;
    if (!arrangement.rootContainerIds.includes(snapshot.rootId)) arrangement.rootContainerIds.push(snapshot.rootId);
    Object.entries(snapshot.containers || {}).forEach(([containerId, container]) => {
      if (!targetState.containers?.[containerId]) return;
      const childIds = uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : [])
        .filter((id) => targetState.containers?.[id]);
      const itemIds = uniqueLayoutIds(Array.isArray(container.itemIds) ? container.itemIds : [])
        .filter((id) => targetState.items?.[id]);
      const childSet = new Set(childIds);
      const itemSet = new Set(itemIds);
      arrangement.containers[containerId] = {
        parentId: container.parentId && targetState.containers?.[container.parentId] ? container.parentId : "",
        itemIds,
        childIds,
        order: (Array.isArray(container.order) ? container.order : [])
          .filter((entry) => entry && (entry.type === "item" || entry.type === "container") && entry.id)
          .filter((entry) => entry.type === "item" ? itemSet.has(entry.id) : childSet.has(entry.id))
          .map((entry) => ({ type: entry.type, id: entry.id }))
      };
      itemIds.forEach((itemId) => {
        arrangement.items[itemId] = containerId;
      });
    });
    Object.entries(snapshot.items || {}).forEach(([itemId, item]) => {
      const containerId = item?.containerId;
      const placement = arrangement.containers?.[containerId];
      if (!targetState.items?.[itemId] || !placement) return;
      arrangement.items[itemId] = containerId;
      if (!placement.itemIds.includes(itemId)) placement.itemIds.push(itemId);
      if (!placement.order.some((entry) => entry?.type === "item" && entry.id === itemId)) {
        placement.order.push({ type: "item", id: itemId });
      }
    });
  });
  Object.entries(targetState.packedItems || {}).forEach(([itemId, value]) => {
    if (value && arrangement.items[itemId]) arrangement.packedItems[itemId] = true;
  });
  return arrangement;
}

export function solidifyTemplateDraftLayout(targetState, layoutId, options = {}) {
  const layout = targetState?.layouts?.[layoutId];
  if (!layout?.adminTemplateCopy) return false;
  const rootIds = templateCopySourceRootIds(layout).filter((rootId) => targetState.containers?.[rootId]);
  if (!rootIds.length) return false;
  const snapshots = rootIds
    .map((rootId) => templateDraftRootSnapshot(targetState, layoutId, rootId, options))
    .filter(Boolean);
  const nextArrangement = layoutArrangementFromContainerSnapshots(targetState, snapshots);
  const nextScore = layoutArrangementRecordScore(nextArrangement);
  if (!nextArrangement.rootContainerIds.length || nextScore < layoutArrangementRecordScore(layout.arrangement)) return false;
  const previous = JSON.stringify(layout.arrangement || null);
  layout.arrangement = nextArrangement;
  layout.rootContainerIds = [...nextArrangement.rootContainerIds];
  normalizeLayoutArrangement(layout, targetState);
  return previous !== JSON.stringify(layout.arrangement || null);
}

export function solidifyManagedTemplateDrafts(targetState, options = {}) {
  let changed = false;
  Object.keys(targetState?.layouts || {}).forEach((layoutId) => {
    if (solidifyTemplateDraftLayout(targetState, layoutId, options)) changed = true;
  });
  return changed;
}
