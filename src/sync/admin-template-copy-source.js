import { hasPrivateSyncBlockedPublicOrigin } from "../public/copy-public-to-private.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { canonicalTemplateJson } from "./admin-template-protocol.js";

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
