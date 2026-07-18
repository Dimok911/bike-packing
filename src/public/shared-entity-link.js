import { escapeHtml } from "../utils/html.js";

export const SHARED_ENTITY_SCOPE_ENTITY = "entity";
export const SHARED_ENTITY_SCOPE_LAYOUT = "layout";
export const SHARED_ENTITY_TYPE_ITEM = "item";
export const SHARED_ENTITY_TYPE_CONTAINER = "container";

export function shouldShowSharedEntityPlacement(targetState, entityType) {
  const target = targetState?.sharedEntityTarget;
  return !(entityType === SHARED_ENTITY_TYPE_ITEM &&
    target?.type === SHARED_ENTITY_TYPE_ITEM &&
    target?.scope === SHARED_ENTITY_SCOPE_ENTITY);
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function normalizedEntityType(value) {
  return value === SHARED_ENTITY_TYPE_CONTAINER ? SHARED_ENTITY_TYPE_CONTAINER :
    value === SHARED_ENTITY_TYPE_ITEM ? SHARED_ENTITY_TYPE_ITEM : "";
}

function normalizedScope(value) {
  return value === SHARED_ENTITY_SCOPE_LAYOUT ? SHARED_ENTITY_SCOPE_LAYOUT : SHARED_ENTITY_SCOPE_ENTITY;
}

export function sharedEntityTargetFromUrl(href, {
  entityIdParam = "sharedEntityId",
  entityTypeParam = "sharedEntityType"
} = {}) {
  try {
    const url = new URL(href);
    const type = normalizedEntityType(url.searchParams.get(entityTypeParam));
    const id = String(url.searchParams.get(entityIdParam) || "").trim();
    return type && id ? { type, id } : null;
  } catch {
    return null;
  }
}

export function buildSharedEntityUrlFromHref(href, {
  entityId,
  entityIdParam = "sharedEntityId",
  entityType,
  entityTypeParam = "sharedEntityType",
  layoutId = "",
  layoutParam,
  listId,
  listParam
} = {}) {
  const type = normalizedEntityType(entityType);
  const id = String(entityId || "").trim();
  if (!type || !id || !listId || !listParam) return "";
  const url = new URL(href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(listParam, String(listId).trim());
  if (layoutParam && layoutId) url.searchParams.set(layoutParam, String(layoutId).trim());
  url.searchParams.set(entityTypeParam, type);
  url.searchParams.set(entityIdParam, id);
  return url.toString();
}

function placementIds(layout) {
  const arrangement = layout?.arrangement || {};
  const containerIds = new Set([
    ...(layout?.rootContainerIds || []),
    ...(arrangement.rootContainerIds || []),
    ...Object.keys(arrangement.containers || {})
  ]);
  const itemIds = new Set(Object.keys(arrangement.items || {}));
  Object.values(arrangement.containers || {}).forEach((placement) => {
    (placement?.childIds || []).forEach((id) => containerIds.add(id));
    (placement?.itemIds || []).forEach((id) => itemIds.add(id));
    (placement?.order || []).forEach((entry) => {
      if (entry?.type === "container") containerIds.add(entry.id);
      if (entry?.type === "item") itemIds.add(entry.id);
    });
  });
  return { containerIds, itemIds };
}

export function sharedEntityBelongsToLayout(targetState, { entityId, entityType, layoutId } = {}) {
  const layout = targetState?.layouts?.[layoutId];
  const type = normalizedEntityType(entityType);
  const id = String(entityId || "");
  if (!layout || !type || !id) return false;
  const ids = placementIds(layout);
  return type === SHARED_ENTITY_TYPE_ITEM ? ids.itemIds.has(id) : ids.containerIds.has(id);
}

function dictionaryValues(records) {
  const locations = new Set();
  const categories = new Set();
  records.forEach((record) => {
    if (record?.location) locations.add(record.location);
    (record?.categories || []).forEach((value) => value && categories.add(value));
    if (record?.category) categories.add(record.category);
  });
  return { locations: [...locations], categories: [...categories] };
}

function basePayload({ containers, items, layout, target }) {
  const records = [...Object.values(containers), ...Object.values(items)];
  const dictionaries = dictionaryValues(records);
  return {
    locations: dictionaries.locations,
    categories: dictionaries.categories,
    containers,
    items,
    layouts: { [layout.id]: layout },
    activeLayoutId: layout.id,
    collapsedContainers: {},
    packedItems: {},
    itemDisplayMode: "meta-photos",
    showItemMeta: true,
    collectionMode: false,
    showOnlyUnpacked: false,
    sharedEntityTarget: target
  };
}

function layoutSnapshotPayload(targetState, { entityId, entityType, layoutId }) {
  const sourceLayout = targetState?.layouts?.[layoutId];
  if (!sourceLayout || !sharedEntityBelongsToLayout(targetState, { entityId, entityType, layoutId })) return null;
  const arrangement = sourceLayout.arrangement || {};
  const ids = placementIds(sourceLayout);
  const containers = {};
  const items = {};

  ids.containerIds.forEach((id) => {
    const source = targetState.containers?.[id];
    if (!source) return;
    const placement = arrangement.containers?.[id] || {};
    const childIds = [...new Set(placement.childIds || source.childIds || [])].filter((childId) => ids.containerIds.has(childId));
    const itemIds = [...new Set(placement.itemIds || source.itemIds || [])].filter((itemId) => ids.itemIds.has(itemId));
    const childSet = new Set(childIds);
    const itemSet = new Set(itemIds);
    const order = (placement.order || source.order || [])
      .filter((entry) => entry?.type === "container" ? childSet.has(entry.id) : entry?.type === "item" && itemSet.has(entry.id))
      .map((entry) => ({ type: entry.type, id: entry.id }));
    containers[id] = {
      ...cloneValue(source),
      parentId: placement.parentId && ids.containerIds.has(placement.parentId) ? placement.parentId : null,
      childIds,
      itemIds,
      order: order.length ? order : [
        ...itemIds.map((itemId) => ({ type: "item", id: itemId })),
        ...childIds.map((childId) => ({ type: "container", id: childId }))
      ]
    };
  });
  ids.itemIds.forEach((id) => {
    const source = targetState.items?.[id];
    if (!source) return;
    const containerId = arrangement.items?.[id] || source.containerId || "";
    items[id] = { ...cloneValue(source), containerId: ids.containerIds.has(containerId) ? containerId : "" };
  });

  const rootContainerIds = [...new Set(arrangement.rootContainerIds || sourceLayout.rootContainerIds || [])]
    .filter((id) => containers[id]);
  const filteredArrangement = {
    rootContainerIds,
    containers: Object.fromEntries(Object.entries(containers).map(([id, container]) => [id, {
      parentId: container.parentId || "",
      childIds: [...container.childIds],
      itemIds: [...container.itemIds],
      order: cloneValue(container.order)
    }])),
    items: Object.fromEntries(Object.entries(items).filter(([, item]) => item.containerId).map(([id, item]) => [id, item.containerId])),
    packedItems: Object.fromEntries(Object.entries(arrangement.packedItems || {}).filter(([id]) => items[id]))
  };
  const layout = {
    ...cloneValue(sourceLayout),
    rootContainerIds,
    arrangement: filteredArrangement
  };
  return basePayload({
    containers,
    items,
    layout,
    target: { type: entityType, id: entityId, scope: SHARED_ENTITY_SCOPE_LAYOUT }
  });
}

function itemSnapshotPayload(targetState, { entityId, wrapperName }) {
  const source = targetState?.items?.[entityId];
  if (!source) return null;
  const layoutId = "shared-entity-layout";
  const containerId = `shared-entity-item-wrapper-${entityId}`;
  const item = { ...cloneValue(source), containerId };
  const container = {
    id: containerId,
    name: wrapperName,
    parentId: null,
    childIds: [],
    itemIds: [entityId],
    order: [{ type: "item", id: entityId }],
    weight: 0,
    volume: 0,
    location: item.location || "",
    categories: [],
    note: "",
    photos: []
  };
  const layout = {
    id: layoutId,
    name: item.name || wrapperName,
    rootContainerIds: [containerId],
    arrangement: {
      rootContainerIds: [containerId],
      containers: { [containerId]: { parentId: "", childIds: [], itemIds: [entityId], order: [{ type: "item", id: entityId }] } },
      items: { [entityId]: containerId },
      packedItems: {}
    }
  };
  return basePayload({
    containers: { [containerId]: container },
    items: { [entityId]: item },
    layout,
    target: { type: SHARED_ENTITY_TYPE_ITEM, id: entityId, scope: SHARED_ENTITY_SCOPE_ENTITY }
  });
}

function containerSnapshotPayload(containerSnapshot, { entityId }) {
  if (!containerSnapshot?.containers?.[entityId]) return null;
  const layoutId = "shared-entity-layout";
  const containers = cloneValue(containerSnapshot.containers || {});
  const items = cloneValue(containerSnapshot.items || {});
  Object.entries(containers).forEach(([id, container]) => {
    if (id === entityId) container.parentId = null;
  });
  const arrangementContainers = Object.fromEntries(Object.entries(containers).map(([id, container]) => [id, {
    parentId: container.parentId || "",
    childIds: [...(container.childIds || [])].filter((childId) => containers[childId]),
    itemIds: [...(container.itemIds || [])].filter((itemId) => items[itemId]),
    order: (container.order || []).filter((entry) => entry?.type === "container" ? containers[entry.id] : entry?.type === "item" && items[entry.id])
  }]));
  const arrangementItems = {};
  Object.entries(arrangementContainers).forEach(([containerId, placement]) => {
    placement.itemIds.forEach((itemId) => {
      arrangementItems[itemId] = containerId;
      if (items[itemId]) items[itemId].containerId = containerId;
    });
  });
  const layout = {
    id: layoutId,
    name: containers[entityId].name || "",
    rootContainerIds: [entityId],
    arrangement: {
      rootContainerIds: [entityId],
      containers: arrangementContainers,
      items: arrangementItems,
      packedItems: {}
    }
  };
  return basePayload({
    containers,
    items,
    layout,
    target: { type: SHARED_ENTITY_TYPE_CONTAINER, id: entityId, scope: SHARED_ENTITY_SCOPE_ENTITY }
  });
}

export function createSharedEntitySnapshotPayload(targetState, {
  containerSnapshot = null,
  entityId,
  entityType,
  layoutId = "",
  scope = SHARED_ENTITY_SCOPE_ENTITY,
  wrapperName = "Shared item"
} = {}) {
  const type = normalizedEntityType(entityType);
  const normalizedId = String(entityId || "").trim();
  if (!type || !normalizedId) return null;
  if (normalizedScope(scope) === SHARED_ENTITY_SCOPE_LAYOUT) {
    return layoutSnapshotPayload(targetState, { entityId: normalizedId, entityType: type, layoutId });
  }
  return type === SHARED_ENTITY_TYPE_ITEM
    ? itemSnapshotPayload(targetState, { entityId: normalizedId, wrapperName })
    : containerSnapshotPayload(containerSnapshot, { entityId: normalizedId });
}

export function sharedEntityPublishDialogHtml({
  authorLabel = "",
  canUseLayout = false,
  labels = {}
} = {}) {
  return `
    <span class="share-link-options">
      <label class="share-link-mode-option">
        <input type="radio" name="shareEntityMode" value="live" checked>
        <span><strong>${escapeHtml(labels.live || "")}</strong><small>${escapeHtml(labels.liveDescription || "")}</small></span>
      </label>
      <label class="share-link-mode-option">
        <input type="radio" name="shareEntityMode" value="snapshot">
        <span><strong>${escapeHtml(labels.snapshot || "")}</strong><small>${escapeHtml(labels.snapshotDescription || "")}</small></span>
      </label>
      <span class="share-link-option-divider" aria-hidden="true"></span>
      <label class="share-link-mode-option">
        <input type="radio" name="shareEntityScope" value="entity" checked>
        <span><strong>${escapeHtml(labels.entityOnly || "")}</strong><small>${escapeHtml(labels.entityOnlyDescription || "")}</small></span>
      </label>
      <label class="share-link-mode-option${canUseLayout ? "" : " is-disabled"}">
        <input type="radio" name="shareEntityScope" value="layout" ${canUseLayout ? "" : "disabled"}>
        <span><strong>${escapeHtml(labels.inLayout || "")}</strong><small>${escapeHtml(canUseLayout ? labels.inLayoutDescription || "" : labels.inLayoutUnavailable || "")}</small></span>
      </label>
      <label class="share-link-author-option">
        <input type="checkbox" data-share-author>
        <span><strong>${escapeHtml(labels.showAuthor || "")}</strong>${authorLabel ? `<small>${escapeHtml(authorLabel)}</small>` : ""}</span>
      </label>
    </span>`;
}

export function readSharedEntityPublishOptions(root) {
  return {
    mode: root?.querySelector('input[name="shareEntityMode"]:checked')?.value === "snapshot" ? "snapshot" : "live",
    scope: root?.querySelector('input[name="shareEntityScope"]:checked')?.value === SHARED_ENTITY_SCOPE_LAYOUT
      ? SHARED_ENTITY_SCOPE_LAYOUT
      : SHARED_ENTITY_SCOPE_ENTITY,
    includeAuthor: Boolean(root?.querySelector("[data-share-author]")?.checked)
  };
}

export function sharedEntityLinkResultHtml(link, { hint = "", ready = "", ariaLabel = "" } = {}) {
  return `
    <span class="share-link-result">
      <strong>${escapeHtml(ready)}</strong>
      <input type="text" readonly value="${escapeHtml(link)}" aria-label="${escapeHtml(ariaLabel)}">
      <small>${escapeHtml(hint)}</small>
    </span>`;
}

export function sharedEntityAncestorContainerIds(payload, target) {
  if (!payload || !target?.id) return [];
  const layout = payload.layouts?.[payload.activeLayoutId] || Object.values(payload.layouts || {})[0];
  const arrangement = layout?.arrangement || {};
  let containerId = target.type === SHARED_ENTITY_TYPE_ITEM
    ? arrangement.items?.[target.id] || payload.items?.[target.id]?.containerId || ""
    : target.id;
  const result = [];
  const visited = new Set();
  while (containerId && !visited.has(containerId)) {
    visited.add(containerId);
    result.push(containerId);
    containerId = arrangement.containers?.[containerId]?.parentId || payload.containers?.[containerId]?.parentId || "";
  }
  return result;
}
