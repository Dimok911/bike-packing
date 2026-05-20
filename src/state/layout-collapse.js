import { getDescendantContainerIds } from "./layout-selectors.js";

export function activeLayoutNestedContainerIds(targetState) {
  const layout = targetState?.layouts?.[targetState?.activeLayoutId];
  const rootIds = Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : [];
  return [...new Set(rootIds.flatMap((rootId) => getDescendantContainerIds(targetState, rootId)))]
    .filter((containerId) => targetState?.containers?.[containerId]);
}

export function allActiveLayoutNestedContainersCollapsed(targetState) {
  const nestedIds = activeLayoutNestedContainerIds(targetState);
  return nestedIds.length > 0 && nestedIds.every((containerId) => targetState?.collapsedContainers?.[containerId]);
}

export function setActiveLayoutNestedContainersCollapsed(targetState, collapsed) {
  const nestedIds = activeLayoutNestedContainerIds(targetState);
  if (!targetState.collapsedContainers || typeof targetState.collapsedContainers !== "object") {
    targetState.collapsedContainers = {};
  }
  nestedIds.forEach((containerId) => {
    targetState.collapsedContainers[containerId] = Boolean(collapsed);
  });
  return nestedIds.length;
}

export function toggleActiveLayoutNestedContainersCollapsed(targetState) {
  const collapsed = !allActiveLayoutNestedContainersCollapsed(targetState);
  const count = setActiveLayoutNestedContainersCollapsed(targetState, collapsed);
  return { collapsed, count };
}
