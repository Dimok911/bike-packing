import { uniqueLayoutIds } from "./layout-arrangement.js";

export function repairContainerMembershipFromItemLinks(targetState) {
  const containers = targetState.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const items = targetState.items && typeof targetState.items === "object" ? targetState.items : {};
  Object.values(containers).forEach((container) => {
    if (!container || typeof container !== "object") return;
    container.childIds = uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : []).filter((id) => containers[id]);
    container.itemIds = uniqueLayoutIds(Array.isArray(container.itemIds) ? container.itemIds : []).filter((id) => items[id]);
    if (container.parentId && !containers[container.parentId]) container.parentId = null;
  });
  Object.entries(containers).forEach(([containerId, container]) => {
    container.itemIds.forEach((itemId) => {
      const item = items[itemId];
      if (!item || (item.containerId && containers[item.containerId])) return;
      item.containerId = containerId;
    });
  });
  Object.entries(items).forEach(([itemId, item]) => {
    const containerId = item?.containerId;
    if (!containerId || !containers[containerId]) return;
    const container = containers[containerId];
    if (!container.itemIds.includes(itemId)) container.itemIds.push(itemId);
  });
  Object.entries(containers).forEach(([containerId, container]) => {
    const parentId = container?.parentId;
    if (!parentId || !containers[parentId]) return;
    if (!containers[parentId].childIds.includes(containerId)) containers[parentId].childIds.push(containerId);
  });
}
