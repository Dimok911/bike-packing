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

export function formatArrangementConflictValue(value) {
  if (!value || typeof value !== "object") return "пусто";
  const containers = value.containers && typeof value.containers === "object" ? Object.keys(value.containers).length : 0;
  const items = value.items && typeof value.items === "object" ? Object.keys(value.items).length : 0;
  const roots = Array.isArray(value.rootContainerIds) ? value.rootContainerIds.length : 0;
  return `${roots} корневых, ${containers} сумок, ${items} вещей`;
}
