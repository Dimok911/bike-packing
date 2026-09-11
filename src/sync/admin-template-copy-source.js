import { hasPrivateSyncBlockedPublicOrigin } from "../public/copy-public-to-private.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson } from "./admin-template-protocol.js";
import { adminTemplateCopyPayloadDigest } from "./admin-template-copy-projection.js";
import { adminTemplateDataSourceSnapshot } from "./admin-template-save-plan.js";

// `saved` is read through createAdminTemplateSavePlans, which verifies its hash
// and full plan grammar. The data write supplies the snapshot; the last step
// supplies its prerequisite. Unsaved editor changes cannot enter this copy.
export async function pendingAdminTemplateCopySource(source, saved, snapshot) {
  const fail = () => { throw Error("Ожидающая версия шаблона не совпадает с сохранённым действием. Сначала сверьте исходный шаблон."); };
  const plan = saved?.plan, equal = (a, b) => canonicalTemplateJson(a) === canonicalTemplateJson(b);
  if (!source?.exists || source.deleted || !source.planId || !source.base?.operationId || !saved || saved.cancelRequested
    || ![1, 4].includes(plan?.version) || plan.id !== source.planId || !equal(plan.binding, source.binding)) fail();
  const { operationId, payload, metadata } = adminTemplateDataSourceSnapshot(plan);
  if (operationId !== source.base.operationId || !equal({ payload, metadata }, snapshot)) fail();
  return { payload, source: { itemKey: source.binding.itemKey, listId: source.binding.listId,
    base: { operationId }, payloadDigest: await adminTemplateCopyPayloadDigest(payload) } };
}

// Source authority belongs to the caller's captured server proof. This helper
// only verifies the namespace and intact placement used by the pure planners.
export function adminCopySourceOwner(state, sourceLayoutId, targetLayoutId, sourceKind = "template") {
  const layout = state.layouts?.[sourceLayoutId];
  if (sourceKind === "template") return layout?.adminCausalSource?.exists
    ? row => row?.publicCatalogLayoutId === sourceLayoutId : null;
  if (sourceKind !== "personal" || !layout || sourceLayoutId === targetLayoutId || layout.adminCausalSource
    || hasPrivateSyncBlockedPublicOrigin(layout, sourceLayoutId) || !layout.arrangement) return null;
  const before = canonicalTemplateJson(layout.arrangement);
  normalizeLayoutArrangement(layout, state);
  if (canonicalTemplateJson(layout.arrangement) !== before
    || canonicalTemplateJson(layout.rootContainerIds) !== canonicalTemplateJson(layout.arrangement.rootContainerIds)) return null;
  return row => Boolean(row && !row.adminCausalSource && !hasPrivateSyncBlockedPublicOrigin(row, row.id));
}
