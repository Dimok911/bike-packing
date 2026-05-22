import { clonePlain } from "../utils/json.js";

export function markLocalPublicCopyOrigin(record, kind, sourceId, sourceLayoutId = "") {
  if (!record || !sourceId) return;
  record._publicCopySourceKind = kind;
  record._publicCopySourceId = String(sourceId);
  record._publicCopySourceLayoutId = sourceLayoutId ? String(sourceLayoutId) : "";
}

export const PRIVATE_COPY_PUBLIC_ORIGIN_FIELDS = [
  "scope",
  "entityScope",
  "entity_scope",
  "sourceScope",
  "source_scope",
  "source",
  "origin",
  "sourceType",
  "source_type",
  "originType",
  "origin_type",
  "visibility",
  "sourceId",
  "source_id",
  "sourceEntityId",
  "sourceListId",
  "source_list_id",
  "originListId",
  "origin_list_id",
  "publicListId",
  "listId",
  "list_id",
  "sourceItemId",
  "source_item_id",
  "sourceContainerId",
  "source_container_id",
  "sourceLayoutId",
  "source_layout_id",
  "sharedSourceId",
  "sharedSourceItemId",
  "sharedSourceContainerId",
  "sharedSourceLayoutId",
  "publicSourceId",
  "publicSourceItemId",
  "publicSourceContainerId",
  "publicSourceLayoutId",
  "publicCatalogLayoutId",
  "publicCatalogItemId",
  "publicCatalogContainerId",
  "templateId",
  "templateSourceId",
  "adminDemo",
  "isAdminDemo",
  "demo",
  "isDemo",
  "adminShared",
  "isAdminShared",
  "adminSharedSourceId",
  "isPublicCatalog",
  "publicCatalog"
];

function originalSharedId(virtualId, prefix) {
  return String(virtualId || "").startsWith(prefix) ? String(virtualId).slice(prefix.length) : "";
}

export function isExternalBikePackingSourceId(value) {
  const id = String(value || "").trim().toLowerCase();
  return Boolean(id && (
    id.startsWith("public-demo-state") ||
    id.startsWith("public-shared-layout-") ||
    id.startsWith("admin-demo-") ||
    id.startsWith("demo-") ||
    id.startsWith("admin-shared-") ||
    id.startsWith("shared-") ||
    id.startsWith("shared-virtual-") ||
    id.includes("public-demo") ||
    id.includes("public-shared") ||
    id.includes("item-shared-item-shared") ||
    id.includes("container-shared-container-shared") ||
    id.includes("shared-item-shared") ||
    id.includes("shared-container-shared")
  ));
}

export function hasPrivateSyncBlockedPublicOrigin(record, fallbackId = "") {
  if (!record || typeof record !== "object") return false;
  if (isExternalBikePackingSourceId(record.id || fallbackId)) return true;
  const scope = String(record.scope || record.entityScope || record.entity_scope || record.sourceScope || record.source_scope || "").trim().toLowerCase();
  if (scope && scope !== "private" && scope !== "user" && scope !== "personal") return true;
  const sourceType = String(record.sourceType || record.source_type || record.originType || record.origin_type || "").trim().toLowerCase();
  if (["demo", "shared", "public", "public-template", "curated-bikepacker"].includes(sourceType)) return true;
  const visibility = String(record.visibility || "").trim().toLowerCase();
  if (visibility === "public" || visibility === "shared") return true;
  if ([
    record.adminDemo,
    record.isAdminDemo,
    record.demo,
    record.isDemo,
    record.adminShared,
    record.isAdminShared,
    record.isPublicCatalog,
    record.publicCatalog
  ].some((value) => value === true)) return true;
  const markerKeys = [
    "adminDemoId",
    "adminDemoItemId",
    "adminDemoContainerId",
    "adminDemoLayoutId",
    "adminSharedSourceId",
    "publicCatalogLayoutId",
    "sharedSourceId",
    "sharedSourceItemId",
    "sharedSourceContainerId",
    "sharedSourceLayoutId"
  ];
  if (markerKeys.some((key) => String(record[key] || "").trim())) return true;
  return ["listId", "list_id", "sourceListId", "source_list_id", "originListId", "origin_list_id", "publicListId", "sourceId", "source_id", "sourceEntityId"]
    .some((key) => isExternalBikePackingSourceId(record[key]));
}

export function stripPublicOriginForPrivateCopy(record) {
  if (!record || typeof record !== "object") return false;
  let changed = false;
  PRIVATE_COPY_PUBLIC_ORIGIN_FIELDS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      delete record[key];
      changed = true;
    }
  });
  return changed;
}

export function stripPublishedPublicOriginMarkers(record) {
  if (!record || typeof record !== "object") return false;
  let changed = stripPublicOriginForPrivateCopy(record);
  [
    "_publicCopySourceKind",
    "_publicCopySourceId",
    "_publicCopySourceLayoutId"
  ].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      delete record[key];
      changed = true;
    }
  });
  return changed;
}

export function publicCopySourceIdFromRecord(record, kind, fallbackId = "") {
  if (!record || typeof record !== "object") return "";
  if (record._publicCopySourceKind === kind && record._publicCopySourceId) {
    return String(record._publicCopySourceId);
  }
  const virtualPrefix = kind === "container" ? "shared-virtual-container-" : "shared-virtual-item-";
  const sourceId = String(
    record.sharedSourceId ||
    originalSharedId(record.id || fallbackId, virtualPrefix) ||
    fallbackId ||
    ""
  ).trim();
  if (!sourceId) return "";
  return hasPrivateSyncBlockedPublicOrigin(record, record.id || fallbackId) || isExternalBikePackingSourceId(sourceId)
    ? sourceId
    : "";
}

export function markPrivateCopyOriginFromSource(target, source, kind, fallbackId = "") {
  const sourceId = publicCopySourceIdFromRecord(source, kind, fallbackId);
  if (!sourceId) return false;
  markLocalPublicCopyOrigin(target, kind, sourceId, source?._publicCopySourceLayoutId || source?.publicCatalogLayoutId || "");
  return true;
}

export function publicCopySnapshotFromSourceSnapshot(sourceSnapshot) {
  const containers = {};
  const items = {};
  Object.entries(sourceSnapshot?.containers || {}).forEach(([id, container]) => {
    const sourceId = publicCopySourceIdFromRecord(container, "container", id) || id;
    containers[sourceId] = container;
  });
  Object.entries(sourceSnapshot?.items || {}).forEach(([id, item]) => {
    const sourceId = publicCopySourceIdFromRecord(item, "item", id) || id;
    items[sourceId] = item;
  });
  const rootId = publicCopySourceIdFromRecord(sourceSnapshot?.containers?.[sourceSnapshot?.rootId], "container", sourceSnapshot?.rootId) ||
    sourceSnapshot?.rootId ||
    "";
  return { rootId, containers, items };
}

export function snapshotHasPrivateSyncBlockedPublicOrigin(sourceSnapshot) {
  return Object.entries(sourceSnapshot?.containers || {}).some(([id, container]) =>
    hasPrivateSyncBlockedPublicOrigin(container, id)
  ) || Object.entries(sourceSnapshot?.items || {}).some(([id, item]) =>
    hasPrivateSyncBlockedPublicOrigin(item, id)
  );
}

export function snapshotHasLocalPublicCopyOrigin(sourceSnapshot) {
  return Object.entries(sourceSnapshot?.containers || {}).some(([id, container]) =>
    Boolean(publicCopySourceIdFromRecord(container, "container", id))
  ) || Object.entries(sourceSnapshot?.items || {}).some(([id, item]) =>
    Boolean(publicCopySourceIdFromRecord(item, "item", id))
  );
}

export function sanitizePrivateCopiedPublicOrigins(targetState, { guestDemoCopyFlag = "" } = {}) {
  const layouts = Object.values(targetState?.layouts || {}).filter((layout) =>
    layout && !layout.adminDemo && !layout.adminSharedSourceId && !(guestDemoCopyFlag && layout?.[guestDemoCopyFlag])
  );
  if (!layouts.length) return 0;
  const containerIds = new Set();
  const itemIds = new Set();
  layouts.forEach((layout) => {
    const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : null;
    [...(layout.rootContainerIds || []), ...(arrangement?.rootContainerIds || [])].forEach((id) => containerIds.add(id));
    Object.keys(arrangement?.containers || {}).forEach((id) => containerIds.add(id));
    Object.keys(arrangement?.items || {}).forEach((id) => itemIds.add(id));
  });
  let changed = 0;
  containerIds.forEach((id) => {
    const container = targetState.containers?.[id];
    if (!container || isExternalBikePackingSourceId(id) || !hasPrivateSyncBlockedPublicOrigin(container, id)) return;
    if (stripPublicOriginForPrivateCopy(container)) changed += 1;
  });
  itemIds.forEach((id) => {
    const item = targetState.items?.[id];
    if (!item || isExternalBikePackingSourceId(id) || !hasPrivateSyncBlockedPublicOrigin(item, id)) return;
    if (stripPublicOriginForPrivateCopy(item)) changed += 1;
  });
  return changed;
}

export function legacySharedRootSnapshot(root) {
  const containers = {};
  const items = {};
  if (!root?.id) return { rootId: "", containers, items };
  containers[root.id] = {
    id: root.id,
    name: root.name,
    childIds: [],
    itemIds: (root.items || []).map((item) => item.id).filter(Boolean),
    order: (root.items || []).map((item) => ({ type: "item", id: item.id })).filter((entry) => entry.id)
  };
  (root.items || []).forEach((item) => {
    if (item?.id) items[item.id] = item;
  });
  return { rootId: root.id, containers, items };
}

export function cloneIsolatedPublicEntity(entity) {
  const cloned = clonePlain(entity || {});
  delete cloned.scope;
  delete cloned.entityScope;
  delete cloned.entity_scope;
  delete cloned.source;
  delete cloned.origin;
  delete cloned.sourceType;
  delete cloned.source_type;
  delete cloned.originType;
  delete cloned.origin_type;
  delete cloned.visibility;
  delete cloned.sourceId;
  delete cloned.source_id;
  delete cloned.sourceEntityId;
  delete cloned.sourceScope;
  delete cloned.source_scope;
  delete cloned.sourceListId;
  delete cloned.source_list_id;
  delete cloned.originListId;
  delete cloned.origin_list_id;
  delete cloned.publicListId;
  delete cloned.listId;
  delete cloned.list_id;
  delete cloned.sourceItemId;
  delete cloned.source_item_id;
  delete cloned.sourceContainerId;
  delete cloned.source_container_id;
  delete cloned.sourceLayoutId;
  delete cloned.source_layout_id;
  delete cloned.sharedSourceId;
  delete cloned.sharedSourceItemId;
  delete cloned.sharedSourceContainerId;
  delete cloned.sharedSourceLayoutId;
  delete cloned.publicSourceId;
  delete cloned.publicSourceItemId;
  delete cloned.publicSourceContainerId;
  delete cloned.publicSourceLayoutId;
  delete cloned.publicCatalogLayoutId;
  delete cloned.publicCatalogItemId;
  delete cloned.publicCatalogContainerId;
  delete cloned.templateId;
  delete cloned.templateSourceId;
  delete cloned.adminDemo;
  delete cloned.isAdminDemo;
  delete cloned.isDemo;
  delete cloned.demo;
  delete cloned.adminShared;
  delete cloned.isAdminShared;
  delete cloned.adminSharedSourceId;
  delete cloned.isPublicCatalog;
  delete cloned.publicCatalog;
  return cloned;
}
