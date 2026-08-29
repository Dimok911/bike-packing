export async function fetchManufacturerCatalogScans(apiFetch, { timeoutMs } = {}) {
  if (typeof apiFetch !== "function") throw new Error("apiFetch is required");
  return await apiFetch("/bike-packing/admin/catalog-scans", {
    timeoutMs,
    silentErrors: true,
  });
}

export async function saveManufacturerCatalogDecision(apiFetch, {
  scanId,
  changeId,
  decision,
  note = "",
  timeoutMs,
} = {}) {
  if (typeof apiFetch !== "function") throw new Error("apiFetch is required");
  if (!scanId || !changeId || !decision) throw new Error("Catalog decision is incomplete");
  return await apiFetch(
    `/bike-packing/admin/catalog-scans/${encodeURIComponent(scanId)}/changes/${encodeURIComponent(changeId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ decision, note }),
      timeoutMs,
      silentErrors: true,
    }
  );
}
