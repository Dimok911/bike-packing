export function hasPublicOriginMarker(record) {
  if (!record || typeof record !== "object") return false;
  const scope = generatedCatalogString(record.scope).toLowerCase();
  const sourceType = generatedCatalogString(record.sourceType || record.source_type).toLowerCase();
  const visibility = generatedCatalogString(record.visibility).toLowerCase();
  const sourceListId = generatedCatalogString(record.sourceListId || record.source_list_id || record.listId || record.list_id).toLowerCase();
  if (scope && scope !== "private") return true;
  if (["demo", "shared", "public", "public-template", "curated-bikepacker"].includes(sourceType)) return true;
  if (["public", "shared"].includes(visibility)) return true;
  if (sourceListId.startsWith("public-demo") || sourceListId.startsWith("public-shared")) return true;
  return Boolean(record.isDemo || record.adminDemo || record.adminShared || record.adminSharedSourceId);
}

export function isPublicSyncItem(itemId, item) {
  return Boolean(
    hasPublicOriginMarker(item) ||
    item?.publicCatalogLayoutId ||
    item?.adminDemo ||
    item?.adminSharedSourceId ||
    String(itemId || item?.id || "").startsWith("guest-demo-item-") ||
    isGeneratedCatalogSyncArtifact(itemId, item)
  );
}

export function isPublicSyncContainer(containerId, container) {
  return Boolean(
    hasPublicOriginMarker(container) ||
    container?.publicCatalogLayoutId ||
    container?.adminDemo ||
    container?.adminSharedSourceId ||
    String(containerId || container?.id || "").startsWith("guest-demo-container-") ||
    isGeneratedCatalogContainerSyncArtifact(containerId, container)
  );
}

export function isGeneratedCatalogSyncArtifact(itemId, item) {
  if (!item || typeof item !== "object") return false;
  const id = generatedCatalogString(itemId || item.id);
  const sourceId = generatedCatalogString(item.sharedSourceId);
  return Boolean(
    hasPublicOriginMarker(item) ||
    item.publicCatalogLayoutId ||
    item.adminDemo ||
    item.adminSharedSourceId ||
    id.startsWith("demo-item-") ||
    id.startsWith("admin-demo-item-") ||
    id.startsWith("item-shared-") ||
    id.includes("item-shared-item-shared-") ||
    sourceId.startsWith("item-shared-") ||
    sourceId.includes("item-shared-item-shared-")
  );
}

export function isGeneratedCatalogContainerSyncArtifact(containerId, container) {
  if (!container || typeof container !== "object") return false;
  const id = generatedCatalogString(containerId || container.id);
  const sourceId = generatedCatalogString(container.sharedSourceId);
  return Boolean(
    hasPublicOriginMarker(container) ||
    container.publicCatalogLayoutId ||
    container.adminDemo ||
    container.adminSharedSourceId ||
    id.startsWith("demo-") ||
    id.startsWith("admin-demo-container-") ||
    id.startsWith("container-shared-") ||
    id.includes("container-shared-container-shared-") ||
    sourceId.startsWith("container-shared-") ||
    sourceId.includes("container-shared-container-shared-")
  );
}

export function isGeneratedCatalogStateArtifact(itemId, item, targetState) {
  if (!item || typeof item !== "object") return false;
  const id = generatedCatalogString(itemId || item.id);
  const sourceId = generatedCatalogString(item.sharedSourceId);
  const containerId = generatedCatalogString(item.containerId);
  const hasValidContainer = Boolean(containerId && targetState?.containers?.[containerId]);
  if (hasValidContainer) return false;
  if (isDetachedPublicCatalogItem(item, targetState)) return false;
  return Boolean(
    hasPublicOriginMarker(item) ||
    id.startsWith("demo-item-") ||
    id.startsWith("admin-demo-item-") ||
    id.includes("item-shared-item-shared-") ||
    sourceId.startsWith("item-shared-") ||
    sourceId.includes("item-shared-item-shared-")
  );
}

export function isGeneratedCatalogContainerStateArtifact(containerId, container, targetState) {
  if (!container || typeof container !== "object") return false;
  const id = generatedCatalogString(containerId || container.id);
  const sourceId = generatedCatalogString(container.sharedSourceId);
  const parentId = generatedCatalogString(container.parentId);
  const hasValidParent = Boolean(parentId && targetState?.containers?.[parentId]);
  const isRecursiveSharedContainer = id.includes("container-shared-container-shared-") ||
    sourceId.startsWith("container-shared-") ||
    sourceId.includes("container-shared-container-shared-");
  if (hasPublicOriginMarker(container)) return true;
  if (container.publicCatalogLayoutId || container.adminDemo || container.adminSharedSourceId) return true;
  if (id.startsWith("demo-") || id.startsWith("admin-demo-container-") || id.startsWith("container-shared-")) return true;
  if (!isRecursiveSharedContainer) return false;
  return !hasValidParent || id.includes("container-shared-container-shared-") || sourceId.startsWith("container-shared-");
}

export function generatedCatalogString(value) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isDetachedPublicCatalogItem(item, targetState) {
  const layoutId = generatedCatalogString(item?.publicCatalogLayoutId);
  if (!layoutId) return false;
  const layout = targetState?.layouts?.[layoutId];
  return Boolean(layout && (layout.adminDemo || layout.adminSharedSourceId || layout.publicCatalogLayoutId));
}
