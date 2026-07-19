function normalizedTemplateId(template) {
  return String(template?.listId || template?.id || "").trim();
}

export function adminDemoCopyTargetRequests(languages = [], {
  templatesForLanguage = () => []
} = {}) {
  const requests = [];
  const seen = new Set();
  [...new Set((Array.isArray(languages) ? languages : [])
    .map((language) => String(language || "").trim())
    .filter(Boolean))]
    .forEach((language) => {
      const templates = templatesForLanguage(language);
      const templateIds = [...new Set((Array.isArray(templates) ? templates : [])
        .map(normalizedTemplateId)
        .filter(Boolean))];
      const ids = templateIds.length ? templateIds : [""];
      ids.forEach((templateId) => {
        const key = `${language}:${templateId}`;
        if (seen.has(key)) return;
        seen.add(key);
        requests.push({ language, templateId });
      });
    });
  return requests;
}

export async function ensureAdminPublicCopyTargets({
  canOpen = false,
  languages = [],
  templatesForLanguage = () => [],
  materializeDemoTemplate = async () => null,
  linkedSharedLayout = null,
  sharedLayouts = [],
  loadSharedLayoutPayload = async () => false,
  materializeSharedLayout = () => null
} = {}) {
  if (!canOpen) return { demoCount: 0, sharedCount: 0 };

  const demoRequests = adminDemoCopyTargetRequests(languages, { templatesForLanguage });
  for (const request of demoRequests) {
    await materializeDemoTemplate(request.language, request.templateId);
  }

  const seenSharedIds = new Set();
  let sharedCount = 0;
  for (const layout of [
    ...(linkedSharedLayout ? [linkedSharedLayout] : []),
    ...(Array.isArray(sharedLayouts) ? sharedLayouts : [])
  ]) {
    const layoutId = String(layout?.id || "").trim();
    if (!layoutId || seenSharedIds.has(layoutId)) continue;
    seenSharedIds.add(layoutId);
    try {
      await loadSharedLayoutPayload(layoutId);
    } catch {
      // A locally bundled shared template can still be materialized offline.
    }
    materializeSharedLayout(layoutId);
    sharedCount += 1;
  }

  return { demoCount: demoRequests.length, sharedCount };
}
