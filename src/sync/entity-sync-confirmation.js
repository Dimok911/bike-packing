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
