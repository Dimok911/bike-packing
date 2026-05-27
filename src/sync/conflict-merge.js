import { normalizePhotoUrlFields } from "../state/item-photos.js";
import {
  stripContainerArrangementFields,
  stripItemPlacementFields
} from "./serialize.js";
import { snapshotsEqual } from "../utils/json.js";
import { isConflictMetaField } from "./conflict-meta.js";

export function changedComparableKeys(a, b, {
  valuesEqual = snapshotsEqual
} = {}) {
  return Object.keys({ ...(a || {}), ...(b || {}) })
    .filter((key) => !isConflictMetaField(key))
    .filter((key) => !valuesEqual(a?.[key], b?.[key]));
}

export function comparableValueForMerge(type, value) {
  if (!["item", "container", "layout"].includes(type) || !value || typeof value !== "object") return value;
  const comparable = { ...value };
  Object.keys(comparable).forEach((key) => {
    if (isConflictMetaField(key)) delete comparable[key];
  });
  if (type === "item") stripItemPlacementFields(comparable);
  if (type === "container") stripContainerArrangementFields(comparable);
  if ((type === "item" || type === "container") && Array.isArray(comparable.photos)) {
    comparable.photos = comparable.photos.map(comparablePhotoForMerge).filter(Boolean);
  }
  return comparable;
}

export function isPlacementOnlyLocalChangeAgainstDeletedRemote(type, baseCompare, localCompare, flags = {}, {
  valuesEqual = snapshotsEqual
} = {}) {
  if (!flags.baseHas || !flags.localHas || flags.remoteHas) return false;
  if (!["item", "container"].includes(type)) return false;
  const changedKeys = changedComparableKeys(baseCompare, localCompare, { valuesEqual });
  if (!changedKeys.length) return true;
  const placementKeys = type === "item"
    ? new Set(["containerId"])
    : new Set(["parentId", "itemIds", "childIds", "order"]);
  return changedKeys.every((key) => placementKeys.has(key));
}

export function wasUpdatedByDevice(value, device = {}) {
  if (!value || typeof value !== "object") return false;
  const deviceId = String(value.updatedByDeviceId || value.sourceDeviceId || "").trim();
  if (deviceId && deviceId === device.id) return true;
  const deviceName = String(value.updatedByDeviceName || value.sourceDeviceName || "").trim();
  return Boolean(!deviceId && deviceName && deviceName === device.name);
}

export function isOwnLayoutEchoConflict(conflicts, device = {}, {
  valuesEqual = snapshotsEqual
} = {}) {
  return Boolean(
    conflicts.length &&
    conflicts.every((conflict) =>
      conflict.type === "layout" &&
      conflict.localHas &&
      conflict.remoteHas &&
      (
        (
          wasUpdatedByDevice(conflict.localValue, device) &&
          wasUpdatedByDevice(conflict.remoteValue, device)
        ) ||
        (
          valuesEqual(conflict.localValue?.updatedByDeviceId || "", conflict.remoteValue?.updatedByDeviceId || "") &&
          valuesEqual(conflict.localValue?.updatedByDeviceName || "", conflict.remoteValue?.updatedByDeviceName || "") &&
          valuesEqual(conflict.localValue?.updatedAt || "", conflict.remoteValue?.updatedAt || "")
        )
      )
    )
  );
}

function comparablePhotoForMerge(photo) {
  if (!photo || typeof photo !== "object") return null;
  normalizePhotoUrlFields(photo);
  const id = String(photo.id || photo.photoId || photo.localId || "").trim();
  if (!id) return null;
  return {
    id,
    width: Number.isFinite(Number(photo.width)) ? Number(photo.width) : 0,
    height: Number.isFinite(Number(photo.height)) ? Number(photo.height) : 0
  };
}
