import { formatShortDateTime } from "./date-format.js";

export function conflictVersionStamp(value, exists, fallbackDevice, missingText = "нет") {
  if (!exists) return missingText;
  const device = value?.updatedByDeviceName || fallbackDevice || "устройство";
  const time = formatShortDateTime(value?.updatedAt);
  return time ? `${device}, ${time}` : device;
}
