// Review decisions are admin metadata, not mutations of a personal packing list.
export function isManufacturerCatalogDecisionRequest(path, options = {}) {
  return String(options.method || 'GET').toUpperCase() === 'PATCH'
    && typeof path === 'string'
    && /^\/bike-packing\/admin\/catalog-scans\/[^/?#]+\/changes\/[^/?#]+$/.test(path);
}

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
  photoSelection,
  timeoutMs,
} = {}) {
  if (typeof apiFetch !== "function") throw new Error("apiFetch is required");
  if (!scanId || !changeId || !decision) throw new Error("Catalog decision is incomplete");
  return await apiFetch(
    `/bike-packing/admin/catalog-scans/${encodeURIComponent(scanId)}/changes/${encodeURIComponent(changeId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ decision, note, ...(photoSelection ? { photoSelection } : {}) }),
      timeoutMs,
      silentErrors: true,
    }
  );
}
