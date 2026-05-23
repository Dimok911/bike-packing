export async function fetchAdminReports(apiFetch, { timeoutMs } = {}) {
  if (typeof apiFetch !== "function") {
    throw new Error("apiFetch is required");
  }
  return await apiFetch("/bike-packing/admin/reports", {
    timeoutMs,
    silentErrors: true,
  });
}
