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

export function filterAutoResolvedMergeConflicts(conflicts, {
  baseState = null,
  localState = null,
  remoteState = null,
  valuesEqual = snapshotsEqual
} = {}) {
  return conflicts.filter((conflict) => !isAutoResolvedMergeConflict(conflict, {
    baseState,
    localState,
    remoteState,
    valuesEqual
  }));
}

export function isAutoResolvedMergeConflict(conflict, {
  localState = null,
  remoteState = null,
  valuesEqual = snapshotsEqual
} = {}) {
  if (isEmptyEquivalentLayoutConflict(conflict, { valuesEqual })) return true;
  if (isEmptyEquivalentActiveLayoutConflict(conflict, { localState, remoteState })) return true;
  return false;
}

export function isEmptyEquivalentLayoutConflict(conflict, {
  valuesEqual = snapshotsEqual
} = {}) {
  if (!conflict || conflict.type !== "layout" || !conflict.localHas || !conflict.remoteHas) return false;
  if (!isEffectivelyEmptyLayout(conflict.localValue) || !isEffectivelyEmptyLayout(conflict.remoteValue)) return false;
  const localComparable = comparableValueForMerge("layout", normalizeEmptyLayoutForCompare(conflict.localValue));
  const remoteComparable = comparableValueForMerge("layout", normalizeEmptyLayoutForCompare(conflict.remoteValue));
  return valuesEqual(localComparable, remoteComparable);
}

export function isEmptyEquivalentActiveLayoutConflict(conflict, {
  localState = null,
  remoteState = null
} = {}) {
  if (!conflict || conflict.type !== "setting" || conflict.id !== "activeLayoutId") return false;
  if (!conflict.localHas || !conflict.remoteHas) return false;
  const localLayoutId = String(conflict.localValue || "");
  const remoteLayoutId = String(conflict.remoteValue || "");
  if (!localLayoutId || !remoteLayoutId || localLayoutId === remoteLayoutId) return false;
  const localLayout = localState?.layouts?.[localLayoutId];
  const remoteLayout = remoteState?.layouts?.[remoteLayoutId];
  return isEffectivelyEmptyLayout(localLayout) && isEffectivelyEmptyLayout(remoteLayout);
}

export function isEffectivelyEmptyLayout(layout) {
  if (!layout || typeof layout !== "object") return false;
  const arrangement = layout.arrangement && typeof layout.arrangement === "object" ? layout.arrangement : {};
  return !arrayLength(layout.rootContainerIds) &&
    !arrayLength(arrangement.rootContainerIds) &&
    !objectKeyCount(arrangement.containers) &&
    !objectKeyCount(arrangement.items) &&
    !objectKeyCount(arrangement.packedItems);
}

function normalizeEmptyLayoutForCompare(layout) {
  if (!layout || typeof layout !== "object") return layout;
  return {
    ...layout,
    rootContainerIds: [],
    arrangement: {
      rootContainerIds: [],
      containers: {},
      items: {},
      packedItems: {}
    }
  };
}

function arrayLength(value) {
  return Array.isArray(value) ? value.filter(Boolean).length : 0;
}

function objectKeyCount(value) {
  return value && typeof value === "object" ? Object.keys(value).length : 0;
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
