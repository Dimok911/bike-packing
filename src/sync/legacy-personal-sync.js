export const LEGACY_PERSONAL_SYNC_WRITE_BLOCKED_CODE = "legacy_personal_sync_write_disabled";

export function shouldBlockLegacyPersonalSyncWriteFallback(error) {
  return error?.status !== 409;
}

export function createLegacyPersonalSyncWriteBlockedError(cause = null) {
  const error = new Error("Personal list save failed; legacy bike-packing-data.json writes are disabled.");
  error.code = LEGACY_PERSONAL_SYNC_WRITE_BLOCKED_CODE;
  error.status = 503;
  error.path = "/bike-packing-data.json";
  error.cause = cause;
  error.data = {
    ok: false,
    code: LEGACY_PERSONAL_SYNC_WRITE_BLOCKED_CODE,
    message: error.message
  };
  return error;
}

export function isLegacyPersonalSyncWriteBlockedError(error) {
  return Boolean(
    error?.code === LEGACY_PERSONAL_SYNC_WRITE_BLOCKED_CODE ||
    error?.data?.code === LEGACY_PERSONAL_SYNC_WRITE_BLOCKED_CODE
  );
}
