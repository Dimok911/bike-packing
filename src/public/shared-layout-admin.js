import {
  removeRuntimeSharedLayout,
  removeSharedLayoutIndexEntry,
  withRuntimeSharedLayoutIndex
} from "./shared-layouts.js";

export async function removePublicSharedLayoutIndexEntry({
  sharedId,
  languages = [],
  layoutsByLanguage,
  fetchPublishedPayload,
  fallbackPayload,
  saveDemoPayload,
  demoTitle,
  warn = () => {}
} = {}) {
  const id = String(sharedId || "").trim();
  if (!id) return false;
  let removedAny = false;
  await Promise.all(languages.map(async (language) => {
    let demoPayload = null;
    try {
      demoPayload = await fetchPublishedPayload(language);
    } catch {
      demoPayload = fallbackPayload(language) || null;
    }
    if (!demoPayload) return;
    const { payload, removed } = removeSharedLayoutIndexEntry(
      withRuntimeSharedLayoutIndex(demoPayload, layoutsByLanguage),
      id
    );
    if (!removed) return;
    try {
      await saveDemoPayload(language, payload, demoTitle(payload));
      removedAny = true;
    } catch (error) {
      warn("[bike-packing] Failed to save public shared layout index after removal.", { id, language, error });
    }
  }));
  removeRuntimeSharedLayout(layoutsByLanguage, id);
  return removedAny;
}

export async function deletePublishedSharedTemplate({
  sharedId,
  apiFetch,
  timeoutMs,
  layoutsByLanguage,
  removePublicIndexEntry,
  warn = () => {}
} = {}) {
  const id = String(sharedId || "").trim();
  if (!id) return false;
  if (typeof apiFetch === "function") {
    try {
      await apiFetch(`/bike-packing/admin/shared-layouts/${encodeURIComponent(id)}`, {
        method: "DELETE",
        timeoutMs
      });
    } catch (error) {
      if (!isAlreadyDeletedSharedTemplateError(error)) throw error;
      warn("[bike-packing] Shared layout delete skipped because public record is already absent.", { id, error });
    }
  }
  // The API owns public index cleanup. Re-saving demo-state from the browser can
  // fail on legacy broken photo references and keep deleted templates stuck.
  removeRuntimeSharedLayout(layoutsByLanguage, id);
  return true;
}

function isAlreadyDeletedSharedTemplateError(error) {
  if (error?.status !== 404) return false;
  const message = `${error?.message || ""} ${error?.data?.message || ""} ${error?.data?.error || ""}`;
  return /not\s+found|not\s+been\s+created|has\s+not\s+been\s+created|missing/i.test(message);
}
