import { formatShortDateTime } from "./date-format.js";
import { snapshotsEqual } from "../utils/json.js";

export function conflictVersionStamp(value, exists, fallbackDevice, missingText = "нет") {
  if (!exists) return missingText;
  const device = value?.updatedByDeviceName || fallbackDevice || "устройство";
  const time = formatShortDateTime(value?.updatedAt);
  return time ? `${device}, ${time}` : device;
}

export function describeChangedFields(localValue, remoteValue, fields, {
  maxLabels = 4,
  fallback = "служебные данные"
} = {}) {
  const changed = fields
    .filter(([key]) => !snapshotsEqual(localValue?.[key], remoteValue?.[key]))
    .map(([, label]) => label);
  if (changed.length) return changed.slice(0, maxLabels).join(", ") + (changed.length > maxLabels ? "…" : "");
  return fallback;
}
