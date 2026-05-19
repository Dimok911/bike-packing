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
  layoutsByLanguage,
  removePublicIndexEntry,
  warn = () => {}
} = {}) {
  const id = String(sharedId || "").trim();
  if (!id) return false;
  await removePublicIndexEntry(id).catch((error) => {
    warn("[bike-packing] Failed to remove shared layout from public index.", { id, error });
    return false;
  });
  removeRuntimeSharedLayout(layoutsByLanguage, id);
  return true;
}
