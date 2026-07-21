export function assertEntitySyncConfirmed(result, type, expectedIds = []) {
  const ids = expectedIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) return;
  if (result?.skipped || !result?.attempted) {
    throw new Error(`${type} sync did not run`);
  }
  const upserted = new Set((result.upserted || []).map((id) => String(id || "").trim()).filter(Boolean));
  const missing = ids.filter((id) => !upserted.has(id));
  if (missing.length) {
    throw new Error(`${type} sync did not confirm: ${missing.slice(0, 3).join(", ")}`);
  }
}

export function entitySyncConfirmationFailures(result = {}, type = "") {
  const changedIds = normalizeIdList(result.changedIds);
  const deletedIds = normalizeIdList(result.deletedIds);
  if (!changedIds.length && !deletedIds.length) return [];
  if (result.skipped || !result.attempted) {
    return [`${type || "entity"} sync did not run`];
  }
  const upserted = new Set(normalizeIdList(result.upserted));
  const deleted = new Set(normalizeIdList(result.deleted));
  const missingUpserted = changedIds.filter((id) => !upserted.has(id));
  const missingDeleted = deletedIds.filter((id) => !deleted.has(id));
  const failures = [];
  if (missingUpserted.length) {
    failures.push(`${type || "entity"} sync did not confirm: ${missingUpserted.slice(0, 3).join(", ")}`);
  }
  if (missingDeleted.length) {
    failures.push(`${type || "entity"} delete sync did not confirm: ${missingDeleted.slice(0, 3).join(", ")}`);
  }
  return failures;
}

export function bikePackingEntitySyncConfirmationFailures(entitySync = {}) {
  return [
    ...entitySyncConfirmationFailures(entitySync.item, "items"),
    ...entitySyncConfirmationFailures(entitySync.container, "containers"),
    ...entitySyncConfirmationFailures(entitySync.layout, "layouts"),
    ...entitySyncConfirmationFailures(entitySync.dictionary, "dictionaries")
  ];
}

export function expectedEntitySyncConfirmationFailures(entitySync = {}, expectedEntityIds = {}) {
  return [
    ...expectedUpsertFailures(entitySync.item, "items", expectedEntityIds.items),
    ...expectedUpsertFailures(entitySync.container, "containers", expectedEntityIds.containers),
    ...expectedUpsertFailures(entitySync.layout, "layouts", expectedEntityIds.layouts)
  ];
}

function expectedUpsertFailures(result, type, expectedIds = []) {
  const expected = normalizeIdList(expectedIds);
  if (!expected.length) return [];
  if (result?.skipped || !result?.attempted) return [`${type} sync did not run`];
  const upserted = new Set(normalizeIdList(result?.upserted));
  const missing = expected.filter((id) => !upserted.has(id));
  return missing.length ? [`${type} sync did not confirm: ${missing.slice(0, 3).join(", ")}`] : [];
}

function normalizeIdList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean);
}
