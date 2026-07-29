function uniqueIds(values = []) {
  return [...new Set(values.filter((value) => typeof value === "string" && value))];
}

function validOrderEntries(order = []) {
  const seen = new Set();
  return (Array.isArray(order) ? order : []).filter((entry) => {
    if (!entry || (entry.type !== "item" && entry.type !== "container") || !entry.id) return false;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((entry) => ({ type: entry.type, id: entry.id }));
}

function layoutPlacementSnapshot(layout = {}) {
  const arrangement = layout?.arrangement && typeof layout.arrangement === "object"
    ? layout.arrangement
    : {};
  const placements = {};
  const itemParents = {};
  const containerParents = {};
  const roots = uniqueIds(Array.isArray(arrangement.rootContainerIds)
    ? arrangement.rootContainerIds
    : (Array.isArray(layout.rootContainerIds) ? layout.rootContainerIds : []));

  Object.entries(arrangement.containers || {}).forEach(([containerId, source]) => {
    if (!containerId) return;
    const itemIds = uniqueIds(Array.isArray(source?.itemIds) ? source.itemIds : []);
    const childIds = uniqueIds(Array.isArray(source?.childIds) ? source.childIds : []);
    const knownEntries = new Set([
      ...itemIds.map((id) => `item:${id}`),
      ...childIds.map((id) => `container:${id}`)
    ]);
    const order = validOrderEntries(source?.order).filter((entry) => knownEntries.has(`${entry.type}:${entry.id}`));
    const orderedKeys = new Set(order.map((entry) => `${entry.type}:${entry.id}`));
    placements[containerId] = {
      parentId: String(source?.parentId || ""),
      itemIds,
      childIds,
      order: [
        ...order,
        ...itemIds.filter((id) => !orderedKeys.has(`item:${id}`)).map((id) => ({ type: "item", id })),
        ...childIds.filter((id) => !orderedKeys.has(`container:${id}`)).map((id) => ({ type: "container", id }))
      ]
    };
  });

  Object.entries(placements).forEach(([containerId, placement]) => {
    if (!Object.prototype.hasOwnProperty.call(containerParents, containerId)) {
      containerParents[containerId] = placement.parentId || "";
    }
    placement.childIds.forEach((childId) => {
      containerParents[childId] = containerId;
    });
    placement.itemIds.forEach((itemId) => {
      itemParents[itemId] = containerId;
    });
  });
  Object.entries(arrangement.items || {}).forEach(([itemId, containerId]) => {
    if (itemId && containerId) itemParents[itemId] = String(containerId);
  });
  roots.forEach((containerId) => {
    containerParents[containerId] = "";
    if (!placements[containerId]) {
      placements[containerId] = { parentId: "", itemIds: [], childIds: [], order: [] };
    }
  });
  Object.keys(containerParents).forEach((containerId) => {
    if (!placements[containerId]) {
      placements[containerId] = {
        parentId: containerParents[containerId] || "",
        itemIds: [],
        childIds: [],
        order: []
      };
    }
  });

  return {
    roots,
    placements,
    itemParents,
    containerParents,
    itemIds: new Set(Object.keys(itemParents)),
    containerIds: new Set(Object.keys(containerParents))
  };
}

function presenceStatus(inFrom, inTo, fromParent, toParent) {
  if (!inFrom && inTo) return "added";
  if (inFrom && !inTo) return "removed";
  if (inFrom && inTo && fromParent !== toParent) return "moved";
  return "unchanged";
}

function addAncestors(changedContainerIds, snapshot, startId) {
  let containerId = startId;
  const seen = new Set();
  while (containerId && !seen.has(containerId)) {
    seen.add(containerId);
    changedContainerIds.add(containerId);
    containerId = snapshot.containerParents[containerId] || "";
  }
}

function recordQuantity(record) {
  const value = Number(record?.quantity);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function recordWeight(record, { quantity = false } = {}) {
  const weight = Number(record?.weight);
  if (!Number.isFinite(weight)) return 0;
  return weight * (quantity ? recordQuantity(record) : 1);
}

function layoutWeight(state, snapshot) {
  let total = 0;
  snapshot.itemIds.forEach((itemId) => {
    total += recordWeight(state?.items?.[itemId], { quantity: true });
  });
  snapshot.containerIds.forEach((containerId) => {
    total += recordWeight(state?.containers?.[containerId]);
  });
  return total;
}

export function buildLayoutComparison(state, fromLayoutId, toLayoutId) {
  const fromLayout = state?.layouts?.[fromLayoutId] || null;
  const toLayout = state?.layouts?.[toLayoutId] || null;
  if (!fromLayout || !toLayout || fromLayoutId === toLayoutId) return null;

  const from = layoutPlacementSnapshot(fromLayout);
  const to = layoutPlacementSnapshot(toLayout);
  const itemDiffs = {};
  const containerDiffs = {};
  const changedContainerIds = new Set();
  const allItemIds = uniqueIds([...from.itemIds, ...to.itemIds]);
  const allContainerIds = uniqueIds([...from.containerIds, ...to.containerIds]);

  allItemIds.forEach((itemId) => {
    const inFrom = from.itemIds.has(itemId);
    const inTo = to.itemIds.has(itemId);
    const fromContainerId = inFrom ? from.itemParents[itemId] || "" : "";
    const toContainerId = inTo ? to.itemParents[itemId] || "" : "";
    const status = presenceStatus(inFrom, inTo, fromContainerId, toContainerId);
    itemDiffs[itemId] = { id: itemId, status, fromContainerId, toContainerId };
    if (status !== "unchanged") {
      addAncestors(changedContainerIds, from, fromContainerId);
      addAncestors(changedContainerIds, to, toContainerId);
    }
  });

  allContainerIds.forEach((containerId) => {
    const inFrom = from.containerIds.has(containerId);
    const inTo = to.containerIds.has(containerId);
    const fromParentId = inFrom ? from.containerParents[containerId] || "" : "";
    const toParentId = inTo ? to.containerParents[containerId] || "" : "";
    const status = presenceStatus(inFrom, inTo, fromParentId, toParentId);
    containerDiffs[containerId] = { id: containerId, status, fromParentId, toParentId };
    if (status !== "unchanged") {
      addAncestors(changedContainerIds, from, containerId);
      addAncestors(changedContainerIds, to, containerId);
    }
  });

  const countStatus = (diffs, status) => Object.values(diffs).filter((entry) => entry.status === status).length;
  const fromWeight = layoutWeight(state, from);
  const toWeight = layoutWeight(state, to);

  return {
    fromLayout,
    toLayout,
    from,
    to,
    itemDiffs,
    containerDiffs,
    changedContainerIds,
    rootEntries: [
      ...to.roots.map((id) => ({ type: "container", id, variant: "target" })),
      ...from.roots
        .filter((id) => !to.roots.includes(id))
        .map((id) => ({
          type: "container",
          id,
          variant: to.containerIds.has(id) ? "source-ghost" : "source"
        }))
    ],
    summary: {
      addedItems: countStatus(itemDiffs, "added"),
      removedItems: countStatus(itemDiffs, "removed"),
      movedItems: countStatus(itemDiffs, "moved"),
      addedContainers: countStatus(containerDiffs, "added"),
      removedContainers: countStatus(containerDiffs, "removed"),
      movedContainers: countStatus(containerDiffs, "moved"),
      fromWeight,
      toWeight,
      weightDelta: toWeight - fromWeight
    }
  };
}

export function comparisonContainerEntries(comparison, containerId, variant = "target") {
  if (!comparison || !containerId) return [];
  if (variant === "source-ghost") return [];
  const primary = variant === "source" ? comparison.from : comparison.to;
  const secondary = comparison.from;
  const placement = primary.placements[containerId];
  if (!placement) return [];
  const entries = placement.order.map((entry) => {
    if (variant !== "source") return { ...entry, variant };
    const diff = entry.type === "item"
      ? comparison.itemDiffs[entry.id]
      : comparison.containerDiffs[entry.id];
    return {
      ...entry,
      variant: diff?.status === "moved" ? "source-ghost" : "source"
    };
  });
  if (variant === "source") return entries;

  const primaryKeys = new Set(entries.map((entry) => `${entry.type}:${entry.id}`));
  (secondary.placements[containerId]?.order || []).forEach((entry) => {
    const key = `${entry.type}:${entry.id}`;
    if (primaryKeys.has(key)) return;
    if (entry.type === "item") {
      const diff = comparison.itemDiffs[entry.id];
      if (!diff || (diff.status !== "removed" && diff.status !== "moved")) return;
      entries.push({
        ...entry,
        variant: diff.status === "moved" ? "source-ghost" : "source"
      });
      return;
    }
    const diff = comparison.containerDiffs[entry.id];
    if (!diff || (diff.status !== "removed" && diff.status !== "moved")) return;
    entries.push({
      ...entry,
      variant: diff.status === "moved" ? "source-ghost" : "source"
    });
  });
  return entries;
}

export function comparisonEntryVisible(comparison, entry, onlyChanges = true) {
  if (!comparison || !entry) return false;
  if (!onlyChanges) return true;
  if (entry.type === "item") {
    return comparison.itemDiffs[entry.id]?.status !== "unchanged";
  }
  return comparison.changedContainerIds.has(entry.id);
}
