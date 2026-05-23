const CONFLICT_META_FIELDS = new Set([
  "id",
  "createdAt",
  "created_at",
  "createdByDeviceId",
  "createdByDeviceName",
  "updatedAt",
  "updated_at",
  "updatedByDeviceId",
  "updatedByDeviceName",
  "clientUpdatedAt",
  "client_updated_at",
  "sourceDeviceId",
  "sourceDeviceName",
  "source_device_id",
  "source_device_name"
]);

export function isConflictMetaField(key) {
  return CONFLICT_META_FIELDS.has(key);
}
