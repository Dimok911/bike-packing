import { canonicalTemplateJson as canonical } from "../sync/admin-template-protocol.js";
import { adminTemplateEditorSource } from "./admin-template-causal-save-flow.js";
import { captureAdminTemplatePhotoOwnerMap } from "../sync/admin-template-photo-owner-map.js";
import { assertAdminTemplatePhotoCopyEditor } from "../sync/admin-template-photo-copy-record.js";
import { adminTemplateCopiedLayoutId } from "./admin-template-server-variant.js";

const clone = value => JSON.parse(canonical(value));
const pause = () => { throw Error("Исходный шаблон изменился. Сначала сверьте его сохранение; местные изменения сохранены."); };

// Upgrade only proof metadata of an already open public editor. Never replace
// its business rows or fetch a newer baseline into an old local draft.
export function prepareAdminTemplateWholeCopySourceUpgrade({ beforeState, layoutId, prepared }) {
  const before = clone(beforeState), layout = before.layouts[layoutId], source = layout?.adminCausalSource;
  if (!source || source.visibility !== "public" || source.planId || layout.templateDraftSyncPending
    || layout.adminCausalCopyPlan || !prepared?.payload) pause();
  const verified = adminTemplateEditorSource(source.binding, prepared);
  if (!verified.exists || verified.deleted || verified.visibility !== "public"
    || canonical(verified.base) !== canonical(source.base)) pause();
  const copied = adminTemplateCopiedLayoutId(prepared.payload), mappings = { items: {}, containers: {} };
  for (const type of ["items", "containers"]) {
    const used = new Set();
    for (const [serverId, raw] of Object.entries(prepared.payload[type] || {})) {
      const sourceId = copied ? serverId : raw.sharedSourceId || serverId;
      const matches = Object.values(before[type]).filter(row => row.publicCatalogLayoutId === layoutId && row.sharedSourceId === sourceId);
      if (matches.length !== 1 || used.has(matches[0].id)) pause();
      used.add(matches[0].id); mappings[type][matches[0].id] = serverId;
    }
  }
  const ownerMap = captureAdminTemplatePhotoOwnerMap({ binding: source.binding, layoutId,
    stateRevision: source.base.stateRevision, sourcePayload: prepared.payload, state: before, mappings });
  layout.adminCausalSource = { ...source, photoOwnerMap: ownerMap, canonicalPayload: clone(prepared.payload) };
  // Identity hints alone are not authority: every field, link and photo must
  // match the exact confirmed source under the whole-copy source rules.
  assertAdminTemplatePhotoCopyEditor({ binding: source.binding, revision: source.base.stateRevision,
    payload: prepared.payload, allowPublicSource: true,
    side: { layoutId, ownerMap, beforeState: before, metadata: {
      title: String(layout.name || "").trim(), description: String(layout.note || "").trim(), language: layout.language } } });
  if (canonical(prepared.metadata) !== canonical({ title: String(layout.name || "").trim(),
    description: String(layout.note || "").trim(), language: layout.language })) pause();
  return clone(layout.adminCausalSource);
}
