import {
  isGeneratedCatalogContainerStateArtifact,
  isGeneratedCatalogContainerSyncArtifact,
  isGeneratedCatalogStateArtifact,
  isGeneratedCatalogSyncArtifact
} from "../public/generated-artifacts.js";
import { uniqueLayoutIds } from "./layout-arrangement.js";

export function cleanupGeneratedCatalogArtifacts(targetState, { forSync = false } = {}) {
  const items = targetState?.items && typeof targetState.items === "object" ? targetState.items : {};
  const containers = targetState?.containers && typeof targetState.containers === "object" ? targetState.containers : {};
  const containerIdsToDrop = new Set();
  Object.entries(containers).forEach(([containerId, container]) => {
    const shouldDrop = forSync
      ? isGeneratedCatalogContainerSyncArtifact(containerId, container)
      : isGeneratedCatalogContainerStateArtifact(containerId, container, targetState);
    if (shouldDrop) collectContainerTreeForDrop(targetState, containerId, containerIdsToDrop);
  });
  const itemIdsToDrop = Object.entries(items)
    .filter(([itemId, item]) => forSync
      ? isGeneratedCatalogSyncArtifact(itemId, item)
      : isGeneratedCatalogStateArtifact(itemId, item, targetState)
    )
    .map(([itemId]) => itemId);
  Object.entries(items).forEach(([itemId, item]) => {
    if (item?.containerId && containerIdsToDrop.has(item.containerId)) itemIdsToDrop.push(itemId);
  });
  if (!itemIdsToDrop.length && !containerIdsToDrop.size) return 0;

  containerIdsToDrop.forEach((containerId) => {
    delete containers[containerId];
    if (targetState.collapsedContainers && typeof targetState.collapsedContainers === "object") {
      delete targetState.collapsedContainers[containerId];
    }
  });
  [...new Set(itemIdsToDrop)].forEach((itemId) => {
    delete items[itemId];
    if (targetState.packedItems && typeof targetState.packedItems === "object") {
      delete targetState.packedItems[itemId];
    }
  });
  scrubMissingEntityReferences(targetState);
  return itemIdsToDrop.length + containerIdsToDrop.size;
}

export function scrubMissingEntityReferences(targetState) {
  const itemIds = new Set(Object.keys(targetState?.items || {}));
  const containerIds = new Set(Object.keys(targetState?.containers || {}));
  Object.values(targetState?.containers || {}).forEach((container) => {
    if (!container || typeof container !== "object") return;
    if (container.parentId && !containerIds.has(container.parentId)) container.parentId = null;
    container.childIds = uniqueLayoutIds(Array.isArray(container.childIds) ? container.childIds : []).filter((id) => containerIds.has(id));
    container.itemIds = uniqueLayoutIds(Array.isArray(container.itemIds) ? container.itemIds : []).filter((id) => itemIds.has(id));
    container.order = (Array.isArray(container.order) ? container.order : []).filter((entry) => {
      if (!entry || typeof entry !== "object") return false;
      if (entry.type === "item") return itemIds.has(entry.id);
      if (entry.type === "container") return containerIds.has(entry.id);
      return false;
    });
  });
  Object.values(targetState?.layouts || {}).forEach((layout) => {
    layout.rootContainerIds = uniqueLayoutIds(Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []).filter((id) => containerIds.has(id));
    const arrangement = layout?.arrangement;
    if (!arrangement || typeof arrangement !== "object") return;
    arrangement.rootContainerIds = uniqueLayoutIds(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []).filter((id) => containerIds.has(id));
    arrangement.containers = arrangement.containers && typeof arrangement.containers === "object" ? arrangement.containers : {};
    Object.keys(arrangement.containers).forEach((containerId) => {
      if (!containerIds.has(containerId)) delete arrangement.containers[containerId];
    });
    arrangement.items = arrangement.items && typeof arrangement.items === "object" ? arrangement.items : {};
    Object.keys(arrangement.items).forEach((itemId) => {
      const containerId = arrangement.items[itemId];
      if (!itemIds.has(itemId) || !containerIds.has(containerId)) delete arrangement.items[itemId];
    });
    arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" ? arrangement.packedItems : {};
    Object.keys(arrangement.packedItems).forEach((itemId) => {
      if (!itemIds.has(itemId)) delete arrangement.packedItems[itemId];
    });
    Object.values(arrangement.containers || {}).forEach((placement) => {
      if (!placement || typeof placement !== "object") return;
      placement.parentId = placement.parentId && containerIds.has(placement.parentId) ? placement.parentId : "";
      placement.childIds = uniqueLayoutIds(Array.isArray(placement.childIds) ? placement.childIds : []).filter((id) => containerIds.has(id));
      placement.itemIds = uniqueLayoutIds(Array.isArray(placement.itemIds) ? placement.itemIds : []).filter((id) => itemIds.has(id));
      placement.order = (Array.isArray(placement.order) ? placement.order : []).filter((entry) => {
        if (!entry || typeof entry !== "object") return false;
        if (entry.type === "item") return itemIds.has(entry.id);
        if (entry.type === "container") return containerIds.has(entry.id);
        return false;
      });
    });
  });
}

function collectContainerTreeForDrop(targetState, containerId, containerIdsToDrop) {
  if (!containerId || containerIdsToDrop.has(containerId)) return;
  const container = targetState?.containers?.[containerId];
  if (!container) return;
  containerIdsToDrop.add(containerId);
  (container.childIds || []).forEach((childId) => collectContainerTreeForDrop(targetState, childId, containerIdsToDrop));
  Object.entries(targetState.containers || {}).forEach(([childId, child]) => {
    if (child?.parentId === containerId) collectContainerTreeForDrop(targetState, childId, containerIdsToDrop);
  });
}
