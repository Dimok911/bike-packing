import {
  hasListFreshnessSignal,
  listFreshnessChanged
} from "./list-freshness.js";

export function buildPreflightConflictError({
  freshness = {},
  record = null,
  remoteUpdatedAt = () => ""
} = {}) {
  const error = new Error("List was updated on server before save");
  error.status = 409;
  error.data = {
    ok: false,
    code: "preflight_conflict",
    message: "List was updated on server before save",
    record,
    currentRecord: record,
    serverPayload: record?.payload || null,
    serverUpdatedAt: remoteUpdatedAt(record) || freshness.serverUpdatedAt || freshness.updatedAt || null,
    stateRevision: freshness.stateRevision ?? record?.stateRevision ?? record?.state_revision ?? null
  };
  return error;
}

export async function preflightRemoteSaveConflictFlow({
  currentUser = null,
  fetchRemoteListFreshnessRecord,
  fetchRemoteListStateSnapshot,
  handleRemoteSaveConflict,
  isForcedOffline = () => false,
  isPublicLayoutContext = () => false,
  isSharedListLinkRoute = () => false,
  listId = "",
  notify = false,
  preferredLayout = null,
  remoteUpdatedAt = () => "",
  syncMeta = {},
  consoleInfo = console.info
} = {}) {
  if (isForcedOffline()) return false;
  if (isSharedListLinkRoute() || isPublicLayoutContext()) return false;
  if (!currentUser || !listId) return false;
  if (
    typeof fetchRemoteListFreshnessRecord !== "function" ||
    typeof fetchRemoteListStateSnapshot !== "function" ||
    typeof handleRemoteSaveConflict !== "function"
  ) {
    return false;
  }

  let freshness = null;
  try {
    freshness = await fetchRemoteListFreshnessRecord(listId);
  } catch (error) {
    consoleInfo("[bike-packing] Pre-save freshness check skipped", {
      status: error?.status || null,
      message: error?.message || String(error || "")
    });
    return false;
  }

  if (!hasListFreshnessSignal(freshness) || !listFreshnessChanged(syncMeta, freshness)) return false;

  let record = null;
  try {
    record = await fetchRemoteListStateSnapshot(listId);
  } catch (error) {
    consoleInfo("[bike-packing] Pre-save remote payload load failed; server conflict guard remains active", {
      listId,
      status: error?.status || null,
      message: error?.message || String(error || "")
    });
    return false;
  }

  await handleRemoteSaveConflict(
    buildPreflightConflictError({ freshness, record, remoteUpdatedAt }),
    { notify, preferredLayout }
  );
  return true;
}
