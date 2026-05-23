export function editMetaForDevice(device, when, {
  fallbackDeviceId = "local-device",
  fallbackDeviceName = "Это устройство"
} = {}) {
  return {
    updatedAt: when,
    updatedByDeviceId: device?.id || fallbackDeviceId,
    updatedByDeviceName: device?.name || fallbackDeviceName
  };
}

export function createMetaForDevice(device, when, options = {}) {
  return {
    createdAt: when,
    ...editMetaForDevice(device, when, options)
  };
}

export function applyEditMeta(record, meta, when = meta?.updatedAt || "") {
  if (!record || typeof record !== "object") return when;
  Object.assign(record, meta);
  return when;
}
