import { validTemplateOperationId } from "../sync/admin-template-protocol.js";

// A fresh target requests create-if-absent (base:null); it does not claim an
// observed server revision or convert an existing/copy draft into a new source.
export function initializeNewAdminTemplateDraft(layout, { actorId, kind, targetId = crypto.randomUUID() }) {
  if (!layout?.id || layout.adminCausalSource || !["demo", "shared"].includes(kind)
    || typeof actorId !== "string" || !actorId || actorId.length > 36 || actorId !== actorId.trim()
    || !validTemplateOperationId(targetId) || layout.rootContainerIds?.length
    || layout.arrangement?.rootContainerIds?.length || Object.keys(layout.arrangement?.items || {}).length
    || Object.keys(layout.arrangement?.containers || {}).length) throw Error("Новый шаблон требует пустого черновика и отдельного идентификатора.");
  const result = JSON.parse(JSON.stringify(layout));
  const binding = { actorId, environment: "bike-packing-experiment",
    listId: (kind === "demo" ? "public-demo-state-" : "public-shared-layout-") + targetId,
    itemKey: (kind === "demo" ? "demo-state:" : "shared-layout:") + targetId };
  if (kind === "demo") { result.adminDemoListId = binding.listId; delete result.adminSharedSourceId; }
  else { result.adminSharedSourceId = targetId; delete result.adminDemoListId; delete result.adminDemo; }
  result.adminCausalSource = { version: 1, binding, exists: false, visibility: null, base: null, indexes: [], planId: null };
  result.templatePublished = false;
  return result;
}
