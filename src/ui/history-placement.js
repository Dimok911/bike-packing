import { snapshotsEqual } from "../utils/json.js";

const historyRuText = (_english, russian) => russian;

function objectMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function arrangementFor(layout = {}) {
  return objectMap(layout?.arrangement);
}

function linkedContainerId(value) {
  if (value && typeof value === "object") return String(value.containerId || value.parentId || "").trim();
  return String(value || "").trim();
}

function itemParentId(layout = {}, itemId = "") {
  const arrangement = arrangementFor(layout);
  const direct = linkedContainerId(arrangement.items?.[itemId]);
  if (direct) return direct;
  for (const [containerId, placement] of Object.entries(objectMap(arrangement.containers))) {
    if ((placement?.itemIds || []).map(String).includes(String(itemId))) return containerId;
    if ((placement?.order || []).some((entry) => entry?.type === "item" && String(entry.id) === String(itemId))) {
      return containerId;
    }
  }
  return "";
}

function layoutItemIds(layout = {}) {
  const arrangement = arrangementFor(layout);
  const ids = new Set(Object.keys(objectMap(arrangement.items)).map(String));
  Object.values(objectMap(arrangement.containers)).forEach((placement) => {
    (placement?.itemIds || []).forEach((id) => ids.add(String(id)));
    (placement?.order || []).forEach((entry) => {
      if (entry?.type === "item" && entry.id) ids.add(String(entry.id));
    });
  });
  ids.delete("");
  return ids;
}

function layoutContainerIds(layout = {}) {
  const arrangement = arrangementFor(layout);
  return [...new Set([
    ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : []),
    ...(Array.isArray(arrangement.rootContainerIds) ? arrangement.rootContainerIds : []),
    ...Object.keys(objectMap(arrangement.containers))
  ].map(String).filter(Boolean))];
}

function normalizedContainerOrder(layout = {}, containerId = "") {
  const arrangement = arrangementFor(layout);
  const placement = objectMap(arrangement.containers?.[containerId]);
  const entries = [];
  const seen = new Set();
  const append = (type, id) => {
    const normalizedType = type === "container" ? "container" : "item";
    const normalizedId = String(id || "").trim();
    const key = `${normalizedType}:${normalizedId}`;
    if (!normalizedId || seen.has(key)) return;
    seen.add(key);
    entries.push({ type: normalizedType, id: normalizedId });
  };
  (placement.order || []).forEach((entry) => {
    if (typeof entry === "string") {
      append((placement.childIds || []).map(String).includes(entry) ? "container" : "item", entry);
      return;
    }
    if (entry?.type === "item" || entry?.type === "container") append(entry.type, entry.id);
  });
  (placement.itemIds || []).forEach((id) => append("item", id));
  Object.entries(objectMap(arrangement.items)).forEach(([itemId, parentValue]) => {
    if (linkedContainerId(parentValue) === String(containerId)) append("item", itemId);
  });
  (placement.childIds || []).forEach((id) => append("container", id));
  return entries;
}

function entryKey(entry) {
  return `${entry?.type === "container" ? "container" : "item"}:${String(entry?.id || "")}`;
}

function comparableArrangementWithoutItem(layout = {}, ignoredItemId = "") {
  const containers = layoutContainerIds(layout).sort();
  const parents = Object.fromEntries(containers.map((containerId) => [
    containerId,
    String(arrangementFor(layout).containers?.[containerId]?.parentId || "")
  ]));
  const orders = Object.fromEntries(containers.map((containerId) => [
    containerId,
    normalizedContainerOrder(layout, containerId)
      .filter((entry) => !(entry.type === "item" && entry.id === ignoredItemId))
      .map(entryKey)
  ]));
  const itemParents = Object.fromEntries([...layoutItemIds(layout)]
    .filter((itemId) => itemId !== ignoredItemId)
    .sort()
    .map((itemId) => [itemId, itemParentId(layout, itemId)]));
  return {
    roots: [...new Set([
      ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : []),
      ...(Array.isArray(arrangementFor(layout).rootContainerIds) ? arrangementFor(layout).rootContainerIds : [])
    ].map(String).filter(Boolean))],
    containers,
    parents,
    orders,
    itemParents
  };
}

function entryTitle(state = {}, entry = null) {
  if (!entry?.id) return "";
  const record = entry.type === "container" ? state?.containers?.[entry.id] : state?.items?.[entry.id];
  return String(record?.name || record?.id || entry.id).trim();
}

function rootContainerId(layout = {}, containerId = "") {
  const arrangement = arrangementFor(layout);
  let currentId = String(containerId || "");
  const seen = new Set();
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const parentId = String(arrangement.containers?.[currentId]?.parentId || "");
    if (!parentId) return currentId;
    currentId = parentId;
  }
  return String(containerId || "");
}

function containerParentId(layout = {}, containerId = "") {
  return String(arrangementFor(layout).containers?.[containerId]?.parentId || "");
}

function positionSnapshot(state = {}, layout = {}, itemId = "") {
  const containerId = itemParentId(layout, itemId);
  if (!containerId) return null;
  const order = normalizedContainerOrder(layout, containerId);
  const index = order.findIndex((entry) => entry.type === "item" && entry.id === itemId);
  if (index < 0) return null;
  const rootId = rootContainerId(layout, containerId);
  return {
    containerId,
    containerTitle: String(state?.containers?.[containerId]?.name || containerId),
    rootContainerId: rootId,
    rootContainerTitle: String(state?.containers?.[rootId]?.name || rootId),
    index,
    total: order.length,
    previousTitle: entryTitle(state, order[index - 1]),
    nextTitle: entryTitle(state, order[index + 1]),
    orderTitles: order.map((entry) => entryTitle(state, entry))
  };
}

function containerPositionSnapshot(state = {}, layout = {}, movedContainerId = "") {
  const parentId = containerParentId(layout, movedContainerId);
  const rootIds = [...new Set([
    ...(Array.isArray(layout?.rootContainerIds) ? layout.rootContainerIds : []),
    ...(Array.isArray(arrangementFor(layout).rootContainerIds) ? arrangementFor(layout).rootContainerIds : [])
  ].map(String).filter(Boolean))];
  const order = parentId
    ? normalizedContainerOrder(layout, parentId)
    : rootIds.map((id) => ({ type: "container", id }));
  const index = order.findIndex((entry) => entry.type === "container" && entry.id === movedContainerId);
  if (index < 0) return null;
  if (!parentId) return {
    containerId: "",
    containerTitle: "",
    rootContainerId: "",
    rootContainerTitle: "",
    isLayoutRoot: true,
    index,
    total: order.length,
    previousTitle: entryTitle(state, order[index - 1]),
    nextTitle: entryTitle(state, order[index + 1]),
    orderTitles: order.map((entry) => entryTitle(state, entry))
  };
  const rootId = rootContainerId(layout, parentId);
  return {
    containerId: parentId,
    containerTitle: String(state?.containers?.[parentId]?.name || parentId),
    rootContainerId: rootId,
    rootContainerTitle: String(state?.containers?.[rootId]?.name || rootId),
    isLayoutRoot: false,
    index,
    total: order.length,
    previousTitle: entryTitle(state, order[index - 1]),
    nextTitle: entryTitle(state, order[index + 1]),
    orderTitles: order.map((entry) => entryTitle(state, entry))
  };
}

function moveCandidate(fromState, toState, layoutId, itemId) {
  const beforeLayout = fromState?.layouts?.[layoutId];
  const afterLayout = toState?.layouts?.[layoutId];
  const before = positionSnapshot(fromState, beforeLayout, itemId);
  const after = positionSnapshot(toState, afterLayout, itemId);
  if (!before || !after) return null;
  if (before.containerId === after.containerId && before.index === after.index) return null;
  if (!snapshotsEqual(
    comparableArrangementWithoutItem(beforeLayout, itemId),
    comparableArrangementWithoutItem(afterLayout, itemId)
  )) return null;
  return {
    kind: "itemMove",
    layoutId,
    layoutTitle: String(afterLayout?.name || beforeLayout?.name || layoutId),
    itemId,
    itemTitle: String(toState?.items?.[itemId]?.name || fromState?.items?.[itemId]?.name || itemId),
    before,
    after
  };
}

function directItemMove(fromState, toState, layoutId, itemId) {
  const beforeLayout = fromState?.layouts?.[layoutId];
  const afterLayout = toState?.layouts?.[layoutId];
  const before = positionSnapshot(fromState, beforeLayout, itemId);
  const after = positionSnapshot(toState, afterLayout, itemId);
  if (!before || !after || before.containerId === after.containerId) return null;
  return {
    kind: "itemMove",
    layoutId,
    layoutTitle: String(afterLayout?.name || beforeLayout?.name || layoutId),
    itemId,
    itemTitle: String(toState?.items?.[itemId]?.name || fromState?.items?.[itemId]?.name || itemId),
    before,
    after
  };
}

function directContainerMove(fromState, toState, layoutId, containerId) {
  const beforeLayout = fromState?.layouts?.[layoutId];
  const afterLayout = toState?.layouts?.[layoutId];
  const before = containerPositionSnapshot(fromState, beforeLayout, containerId);
  const after = containerPositionSnapshot(toState, afterLayout, containerId);
  if (!before || !after) return null;
  const beforeParent = before.isLayoutRoot ? "__layout_root__" : before.containerId;
  const afterParent = after.isLayoutRoot ? "__layout_root__" : after.containerId;
  if (beforeParent === afterParent) return null;
  return {
    kind: "containerMove",
    layoutId,
    layoutTitle: String(afterLayout?.name || beforeLayout?.name || layoutId),
    containerId,
    containerTitle: String(toState?.containers?.[containerId]?.name || fromState?.containers?.[containerId]?.name || containerId),
    before,
    after
  };
}

function changedOrderFallbacks(fromState, toState, layoutId) {
  const beforeLayout = fromState?.layouts?.[layoutId];
  const afterLayout = toState?.layouts?.[layoutId];
  const changedContainers = [...new Set([
    ...layoutContainerIds(beforeLayout),
    ...layoutContainerIds(afterLayout)
  ])].filter((containerId) => !snapshotsEqual(
    normalizedContainerOrder(beforeLayout, containerId).map(entryKey),
    normalizedContainerOrder(afterLayout, containerId).map(entryKey)
  ));
  return changedContainers.map((containerId) => {
    const beforeOrder = normalizedContainerOrder(beforeLayout, containerId);
    const afterOrder = normalizedContainerOrder(afterLayout, containerId);
    if (!beforeOrder.length && !afterOrder.length) return null;
    return {
      kind: "orderChange",
      layoutId,
      layoutTitle: String(afterLayout?.name || beforeLayout?.name || layoutId),
      containerId,
      containerTitle: String(toState?.containers?.[containerId]?.name || fromState?.containers?.[containerId]?.name || containerId),
      beforeTitles: beforeOrder.map((entry) => entryTitle(fromState, entry)),
      afterTitles: afterOrder.map((entry) => entryTitle(toState, entry))
    };
  }).filter(Boolean);
}

export function detectHistoryItemPlacementChanges(fromState = {}, toState = {}) {
  const layoutIds = [...new Set([
    ...Object.keys(objectMap(fromState?.layouts)),
    ...Object.keys(objectMap(toState?.layouts))
  ])];
  const changes = [];
  layoutIds.forEach((layoutId) => {
    const beforeLayout = fromState?.layouts?.[layoutId];
    const afterLayout = toState?.layouts?.[layoutId];
    if (!beforeLayout || !afterLayout) return;
    const itemIds = [...new Set([...layoutItemIds(beforeLayout), ...layoutItemIds(afterLayout)])]
      .filter((itemId) => itemParentId(beforeLayout, itemId) && itemParentId(afterLayout, itemId));
    const directMoves = itemIds
      .map((itemId) => directItemMove(fromState, toState, layoutId, itemId))
      .filter(Boolean);
    const containerIds = [...new Set([...layoutContainerIds(beforeLayout), ...layoutContainerIds(afterLayout)])]
      .filter((containerId) => layoutContainerIds(beforeLayout).includes(containerId) && layoutContainerIds(afterLayout).includes(containerId));
    const directContainerMoves = containerIds
      .map((containerId) => directContainerMove(fromState, toState, layoutId, containerId))
      .filter(Boolean);
    if (directMoves.length || directContainerMoves.length) {
      changes.push(...directMoves, ...directContainerMoves);
      return;
    }
    const candidates = itemIds
      .map((itemId) => moveCandidate(fromState, toState, layoutId, itemId))
      .filter(Boolean);
    if (candidates.length === 1) {
      changes.push(candidates[0]);
      return;
    }
    const sameItems = snapshotsEqual([...layoutItemIds(beforeLayout)].sort(), [...layoutItemIds(afterLayout)].sort());
    const sameContainers = snapshotsEqual(layoutContainerIds(beforeLayout).sort(), layoutContainerIds(afterLayout).sort());
    if (sameItems && sameContainers) changes.push(...changedOrderFallbacks(fromState, toState, layoutId));
  });
  return changes;
}

function quoted(value, localText) {
  const text = String(value || "").trim();
  return localText(`“${text}”`, `«${text}»`);
}

function positionCountText(position, localText) {
  if (!position) return "";
  return localText(
    `position ${position.index + 1} of ${position.total}`,
    `позиция ${position.index + 1} из ${position.total}`
  );
}

function routeLocationText(position, direction, localText) {
  if (!position) return "";
  if (position.isLayoutRoot) return direction === "from"
    ? localText("the top level of the layout", "верхнего уровня укладки")
    : localText("the top level of the layout", "верхний уровень укладки");
  if (position.rootContainerId && position.rootContainerId !== position.containerId) return direction === "from"
    ? localText(
      `nested bag ${quoted(position.containerTitle, localText)} in top-level bag ${quoted(position.rootContainerTitle, localText)}`,
      `сумки ${quoted(position.containerTitle, localText)} внутри верхнеуровневой сумки ${quoted(position.rootContainerTitle, localText)}`
    )
    : localText(
      `nested bag ${quoted(position.containerTitle, localText)} in top-level bag ${quoted(position.rootContainerTitle, localText)}`,
      `сумку ${quoted(position.containerTitle, localText)} внутри верхнеуровневой сумки ${quoted(position.rootContainerTitle, localText)}`
    );
  return direction === "from"
    ? localText(
      `top-level bag ${quoted(position.containerTitle, localText)}`,
      `верхнеуровневой сумки ${quoted(position.containerTitle, localText)}`
    )
    : localText(
      `top-level bag ${quoted(position.containerTitle, localText)}`,
      `верхнеуровневую сумку ${quoted(position.containerTitle, localText)}`
    );
}

function placementChangeRoute(change, localText) {
  if (change?.kind !== "itemMove" && change?.kind !== "containerMove") return null;
  const entityTitle = String(change.kind === "containerMove" ? change.containerTitle : change.itemTitle);
  const entityType = change.kind === "containerMove"
    ? localText("Bag", "Сумка")
    : localText("Item", "Вещь");
  return {
    heading: localText(`${entityType} ${quoted(entityTitle, localText)} moved`, `${entityType} ${quoted(entityTitle, localText)} перемещена`),
    entityTitle,
    fromLabel: localText("From", "Из"),
    fromText: `${routeLocationText(change.before, "from", localText)}, ${positionCountText(change.before, localText)}`,
    toLabel: localText("To", "В"),
    toText: `${routeLocationText(change.after, "to", localText)}, ${positionCountText(change.after, localText)}`
  };
}

export function formatHistoryItemPlacementChange(change, {
  localText = historyRuText
} = {}) {
  if (!change) return "";
  if (change.kind === "orderChange") {
    const before = change.beforeTitles.length
      ? change.beforeTitles.map((title) => quoted(title, localText)).join(" → ")
      : localText("empty", "пусто");
    const after = change.afterTitles.length
      ? change.afterTitles.map((title) => quoted(title, localText)).join(" → ")
      : localText("empty", "пусто");
    return localText(
      `Changed contents of bag ${quoted(change.containerTitle, localText)}. Before: ${before}; after: ${after}`,
      `Изменено содержимое сумки ${quoted(change.containerTitle, localText)}. Было: ${before}; стало: ${after}`
    );
  }
  const route = placementChangeRoute(change, localText);
  return route ? `${route.heading}. ${route.fromLabel} ${route.fromText}. ${route.toLabel} ${route.toText}.` : "";
}

function placementChangeHighlight(change) {
  if (change?.kind === "itemMove") return String(change.itemTitle || "");
  if (change?.kind === "containerMove") return String(change.containerTitle || "");
  return "";
}

function placementChangeContext(change) {
  if (change?.kind !== "itemMove" && change?.kind !== "containerMove") return null;
  const makeState = (position) => ({
    titles: Array.isArray(position?.orderTitles) ? position.orderTitles : [],
    activeIndex: Math.max(0, Number(position?.index) || 0)
  });
  return {
    before: makeState(change.before),
    after: makeState(change.after)
  };
}

export function historyPlacementDetailEntries(fromState = {}, toState = {}, {
  localText = historyRuText
} = {}) {
  return detectHistoryItemPlacementChanges(fromState, toState)
    .map((change) => ({
      text: formatHistoryItemPlacementChange(change, { localText }),
      highlight: placementChangeHighlight(change),
      context: placementChangeContext(change),
      route: placementChangeRoute(change, localText)
    }))
    .filter((entry) => entry.text);
}

export function historyItemPlacementDetails(fromState = {}, toState = {}, {
  localText = historyRuText
} = {}) {
  return historyPlacementDetailEntries(fromState, toState, { localText }).map((entry) => entry.text);
}
