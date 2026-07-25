const normalizeText = (value) => String(value || "").trim();

export function activeAdminTemplateDraftRecords(records = []) {
  const seen = new Set();
  return (Array.isArray(records) ? records : []).filter((record) => {
    const kind = normalizeText(record?.publicTemplateKind);
    const id = kind === "shared-layout"
      ? normalizeText(record?.sharedId || record?.sharedLayoutId || record?.id)
      : normalizeText(record?.demoListId || record?.listId || record?.id);
    const key = `${kind}:${id}`;
    const active = Boolean(
      id &&
      (kind === "demo" || kind === "shared-layout") &&
      record?.published === false &&
      record?.historyOnly !== true &&
      normalizeText(record?.visibility).toLowerCase() === "private" &&
      normalizeText(record?.adminPayloadEndpoint)
    );
    if (!active || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function findLocalAdminTemplateDraft(layouts = {}, record = {}) {
  const kind = normalizeText(record?.publicTemplateKind);
  const demoListId = normalizeText(record?.demoListId || record?.listId || record?.id);
  const sharedId = normalizeText(record?.sharedId || record?.sharedLayoutId || record?.id);
  return Object.values(layouts || {}).find((layout) => {
    if (!layout || layout.templatePublished !== false) return false;
    if (kind === "demo") {
      return Boolean(layout.adminDemo && normalizeText(layout.adminDemoListId) === demoListId);
    }
    if (kind === "shared-layout") {
      return normalizeText(layout.adminSharedSourceId) === sharedId;
    }
    return false;
  }) || null;
}

export function pendingAdminTemplateDraftLayouts(layouts = {}) {
  return Object.values(layouts || {}).filter((layout) => Boolean(
    layout?.templatePublished === false &&
    layout?.templateDraftSyncPending === true
  ));
}

export async function hydrateAdminTemplateDraftsFlow({
  runtime,
  dependencies
} = {}, {
  renderAfter = false
} = {}) {
  const {
    fetchAdminTemplateCatalog = async () => null,
    fetchAdminTemplatePayload = async () => null,
    materializeDemoDraft = () => null,
    materializeSharedDraft = () => null,
    normalizeAdminTemplateHistoryRecords = (records) => records,
    render = () => {},
    saveState = () => {}
  } = dependencies || {};
  const catalog = await fetchAdminTemplateCatalog();
  const records = normalizeAdminTemplateHistoryRecords(catalog?.lists);
  runtime.adminTemplateHistoryRecords = records;
  let restored = 0;
  for (const record of activeAdminTemplateDraftRecords(records)) {
    if (findLocalAdminTemplateDraft(runtime.state?.layouts, record)) continue;
    let response = null;
    try {
      response = await fetchAdminTemplatePayload(record.adminPayloadEndpoint, record);
    } catch {
      continue;
    }
    const payload = response?.record?.payload || response?.payload || null;
    if (!payload) continue;
    const layout = record.publicTemplateKind === "shared-layout"
      ? await materializeSharedDraft(record, payload)
      : await materializeDemoDraft(record, payload);
    if (!layout) continue;
    layout.templatePublished = false;
    delete layout.templateUnpublishPending;
    delete layout.templateDraftSyncPending;
    if (record.name) layout.name = record.name;
    restored += 1;
  }
  if (restored) {
    saveState({ sync: false });
    if (renderAfter) render();
  }
  return { records, restored };
}
