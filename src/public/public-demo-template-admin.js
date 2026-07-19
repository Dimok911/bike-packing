import {
  canonicalCatalogConfirmsDemoTemplateAbsent,
  publicDemoTemplateExactDeletePath,
  publicTemplateDeleteResponseMatches
} from "./public-template-metadata.js";

async function fetchAuthoritativeCatalog(fetchCatalog) {
  if (typeof fetchCatalog !== "function") return null;
  try {
    return await fetchCatalog();
  } catch {
    return null;
  }
}

export async function deletePublishedDemoTemplateRecord({
  listId = "",
  apiFetch,
  fetchCatalog,
  timeoutMs
} = {}) {
  const path = publicDemoTemplateExactDeletePath(listId);
  if (!path || typeof apiFetch !== "function") return false;

  const catalogBeforeDelete = await fetchAuthoritativeCatalog(fetchCatalog);
  if (canonicalCatalogConfirmsDemoTemplateAbsent(catalogBeforeDelete, listId)) return true;

  try {
    const result = await apiFetch(path, {
      method: "DELETE",
      timeoutMs,
      silentErrors: true
    });
    if (!publicTemplateDeleteResponseMatches(result, listId)) {
      throw new Error(`API did not confirm deletion of demo template ${listId}`);
    }
    return true;
  } catch (error) {
    const catalogAfterDelete = await fetchAuthoritativeCatalog(fetchCatalog);
    if (canonicalCatalogConfirmsDemoTemplateAbsent(catalogAfterDelete, listId)) return true;
    throw error;
  }
}

export async function unpublishPublishedDemoTemplateRecord({
  listId = "",
  apiFetch,
  historyAction = "",
  timeoutMs
} = {}) {
  const normalizedListId = String(listId || "").trim();
  if (!normalizedListId || typeof apiFetch !== "function") return false;
  try {
    const result = await apiFetch(
      `/bike-packing/admin/demo-templates/${encodeURIComponent(normalizedListId)}/publication`,
      {
        method: "PATCH",
        timeoutMs,
        silentErrors: true,
        body: JSON.stringify({
          published: false,
          ...(historyAction ? { historyAction } : {})
        })
      }
    );
    return Boolean(
      result?.ok !== false &&
      result?.published === false &&
      String(result?.listId || "").trim() === normalizedListId
    );
  } catch (error) {
    if (error?.status === 404) return true;
    throw error;
  }
}
