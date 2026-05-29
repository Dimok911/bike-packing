import {
  normalizePhotoStatus,
  normalizePhotoUrlFields
} from "../state/item-photos.js";
import { normalizeCollectionModeState } from "../state/collection-mode.js";
import {
  normalizeRemotePhotoUrl,
  syncSafePhotoUrl
} from "./photos.js";

export function cloneStateForSyncPayload(sourceState, {
  forSync = false,
  cleanupGeneratedCatalogArtifacts = null,
  normalizeDictionariesForSync = null,
  pruneAdminPublishedDraftsForSync = null
} = {}) {
  const cloned = JSON.parse(JSON.stringify(sourceState));
  normalizeCollectionModeState(cloned);
  if (forSync) {
    cleanupGeneratedCatalogArtifacts?.(cloned, { forSync: true });
    mirrorTopLevelPackedItemsToActiveLayoutArrangement(cloned);
    delete cloned.collapsedContainers;
    delete cloned.itemDisplayMode;
    delete cloned.showItemMeta;
    delete cloned.showFilterContext;
    delete cloned.collectionMode;
    delete cloned.showOnlyUnpacked;
    delete cloned.packedItems;
    delete cloned.activeLayoutId;
    prunePhotoPayloadForSync(cloned);
    normalizeDictionariesForSync?.(cloned);
    pruneAdminPublishedDraftsForSync?.(cloned);
    normalizeDictionariesForSync?.(cloned);
    stripAppliedArrangementFieldsForSync(cloned);
  }
  return cloned;
}

export function mirrorTopLevelPackedItemsToActiveLayoutArrangement(cloned) {
  if (!cloned || typeof cloned !== "object") return cloned;
  const packedItems = cloned.packedItems && typeof cloned.packedItems === "object" && !Array.isArray(cloned.packedItems)
    ? cloned.packedItems
    : null;
  const activeLayoutId = typeof cloned.activeLayoutId === "string" ? cloned.activeLayoutId : "";
  const layout = activeLayoutId ? cloned.layouts?.[activeLayoutId] : null;
  const arrangement = layout?.arrangement;
  if (!packedItems || !arrangement || typeof arrangement !== "object" || Array.isArray(arrangement)) return cloned;
  const arrangedItems = arrangement.items && typeof arrangement.items === "object" && !Array.isArray(arrangement.items)
    ? arrangement.items
    : {};
  arrangement.packedItems = arrangement.packedItems && typeof arrangement.packedItems === "object" && !Array.isArray(arrangement.packedItems)
    ? arrangement.packedItems
    : {};
  Object.keys(arrangement.packedItems).forEach((itemId) => {
    if (!packedItems[itemId] || !arrangedItems[itemId]) delete arrangement.packedItems[itemId];
  });
  Object.entries(packedItems).forEach(([itemId, packed]) => {
    if (packed && arrangedItems[itemId]) arrangement.packedItems[itemId] = true;
  });
  return cloned;
}

export function stripLocalPublicCopyOriginsForSync(cloned) {
  Object.values(cloned.items || {}).forEach(stripLocalPublicCopyOrigin);
  Object.values(cloned.containers || {}).forEach(stripLocalPublicCopyOrigin);
}

export function stripLocalPublicCopyOrigin(record) {
  if (!record || typeof record !== "object") return;
  delete record._publicCopySourceKind;
  delete record._publicCopySourceId;
  delete record._publicCopySourceLayoutId;
  delete record._publicCopySourceContentHash;
}

export function stripAppliedArrangementFieldsForSync(cloned) {
  Object.values(cloned.items || {}).forEach((item) => stripItemPlacementFields(item));
  Object.values(cloned.containers || {}).forEach((container) => stripContainerArrangementFields(container));
}

export function prunePhotoPayloadForSync(cloned) {
  Object.values(cloned.items || {}).forEach((item) => {
    if (Array.isArray(item.photos)) item.photos = item.photos.map(compactPhotoForSync).filter(Boolean);
  });
  Object.values(cloned.containers || {}).forEach((container) => {
    if (Array.isArray(container.photos)) container.photos = container.photos.map(compactPhotoForSync).filter(Boolean);
  });
}

export function compactPhotoForSync(photo) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const id = String(photo.id || photo.photoId || "").trim();
  if (!id) return null;
  const url = normalizeRemotePhotoUrl(photo.url);
  const thumbUrl = normalizeRemotePhotoUrl(photo.thumbUrl);
  const compact = {
    id,
    status: normalizePhotoStatus(photo.status),
    url,
    thumbUrl,
    listId: typeof photo.listId === "string" || typeof photo.listId === "number" ? String(photo.listId) : "",
    width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
    height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0,
    updatedAt: typeof photo.updatedAt === "string" ? photo.updatedAt : ""
  };
  if (!compact.url && !compact.thumbUrl && compact.status === "synced") compact.status = "pending";
  return compact;
}

export function compactRecordForEntitySync(record) {
  if (!record || typeof record !== "object") return null;
  const compact = JSON.parse(JSON.stringify(record));
  if (Array.isArray(compact.photos)) compact.photos = compact.photos.map(compactPhotoForSync).filter(Boolean);
  compact.id = String(compact.id || "").trim();
  return compact.id ? compact : null;
}

export function stripItemPlacementFields(record) {
  if (!record) return record;
  delete record.containerId;
  delete record.parentContainerId;
  return record;
}

export function stripContainerArrangementFields(record) {
  if (!record) return record;
  delete record.parentId;
  delete record.parentContainerId;
  delete record.containerId;
  delete record.itemIds;
  delete record.childIds;
  delete record.order;
  return record;
}

export function compactItemForEntitySync(item) {
  return stripItemPlacementFields(compactRecordForEntitySync(item));
}

export function compactContainerForEntitySync(container) {
  return stripContainerArrangementFields(compactRecordForEntitySync(container));
}

export function compactLayoutForEntitySync(layout) {
  return compactRecordForEntitySync(layout);
}

export function compactDictionaryForEntitySync(record) {
  if (!record || typeof record !== "object") return null;
  return {
    id: "dictionary-state",
    categories: normalizeDictionaryValues(record.categories),
    locations: normalizeDictionaryValues(record.locations),
    customCategories: normalizeDictionaryValues(record.customCategories || record.categoryDictionary),
    customLocations: normalizeDictionaryValues(record.customLocations || record.locationDictionary),
    hiddenCategories: normalizeDictionaryValues(record.hiddenCategories),
    hiddenLocations: normalizeDictionaryValues(record.hiddenLocations)
  };
}

function normalizeDictionaryValues(values) {
  const result = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
}

export function remoteUpdatedAt(record) {
  return record?.updatedAt || record?.updated_at || record?.updatedAtUtc || null;
}
