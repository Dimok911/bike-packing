import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";
import { adminTemplateEditorSource } from "./admin-template-causal-save-flow.js";
import { activeAdminTemplateDraftRecords, findLocalAdminTemplateDraft } from "./admin-template-draft-sync.js";

const paused = () => Object.assign(Error("Загрузка черновиков остановлена: контекст редактирования изменился."), { isAdminTemplateBlocked: true });

// Catalog enumeration only discovers targets. The prepare snapshot supplies the
// exact data, revision and current authority used to open a new editor. Existing
// local drafts are never rebased or replaced by a background catalog refresh.
export async function hydrateCausalAdminTemplateDrafts({ getContext, getLayouts, getBinding, readCatalog, normalizeRecords,
  readTemplate, materialize, rememberSource = null, acceptRecords = () => {}, persist = () => {} }) {
  const initial = canonicalTemplateJson(getContext());
  if (getContext()?.admin !== true) throw paused();
  const guard = () => { if (canonicalTemplateJson(getContext()) !== initial) throw paused(); };
  const catalog = await readCatalog(); guard();
  const records = normalizeRecords(catalog?.lists); acceptRecords(records);
  let restored = 0, migrationPending = 0;
  for (const record of activeAdminTemplateDraftRecords(records)) {
    guard(); const binding = getBinding(record);
    const existing = findLocalAdminTemplateDraft(getLayouts(), record);
    if (existing) {
      if (!existing.adminCausalSource || canonicalTemplateJson(existing.adminCausalSource.binding) !== canonicalTemplateJson(binding)) migrationPending++;
      continue;
    }
    let prepared;
    try { prepared = await readTemplate(binding, record); } catch { guard(); continue; }
    guard();
    // The catalog may already be stale. Do not turn a published, removed or
    // multi-layout source into a fresh private draft from its old catalog row.
    if (!prepared?.exists || prepared.deleted || prepared.visibility !== "private" || !prepared.payload
      || Object.keys(prepared.payload.layouts || {}).length !== 1) continue;
    const source = adminTemplateEditorSource(binding, prepared);
    if (findLocalAdminTemplateDraft(getLayouts(), record)) continue;
    const layout = materialize(record, prepared); guard();
    if (!layout) continue;
    layout.adminCausalSource = { ...source, ...(layout.adminCausalSource?.photoView ? { photoView: layout.adminCausalSource.photoView } : {}),
      ...(layout.adminCausalSource?.photoOwnerMap ? { photoOwnerMap: layout.adminCausalSource.photoOwnerMap } : {}) };
    layout.name = prepared.metadata.title; layout.note = prepared.metadata.description;
    layout.language = prepared.metadata.language; layout.templatePublished = false; layout.templateDraftServerHydrated = true;
    delete layout.templateDraftSyncPending; delete layout.templateUnpublishPending;
    await rememberSource?.(layout, prepared); guard();
    persist(); restored++;
  }
  return { records, restored, migrationPending };
}
