import { canonicalTemplateJson } from "../sync/admin-template-protocol.js";

const text = value => String(value || "").trim();

// A missing catalog row is not deletion evidence. This is a presentation-only
// overlay: even a confirmed remote archive cannot discard an unsent local edit,
// an operation journal, or its source snapshot.
export function archivedCausalAdminTemplateDrafts(layouts, records, getBinding) {
  const archived = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.historyOnly !== true || text(record.visibility).toLowerCase() !== "deleted") continue;
    const kind = text(record.publicTemplateKind);
    if (!["demo", "shared-layout"].includes(kind)) continue;
    const sourceId = kind === "demo" ? text(record.demoListId || record.listId || record.id)
      : text(record.sharedId || record.sharedLayoutId || record.id);
    if (!sourceId) continue;
    const binding = getBinding(record);
    if (!binding?.actorId || !binding.environment || !binding.listId || !binding.itemKey) continue;
    for (const layout of Object.values(layouts || {})) {
      if (!layout?.id || layout.templatePublished !== false || !layout.adminCausalSource?.binding) continue;
      const matchesSource = kind === "demo" ? layout.adminDemo && text(layout.adminDemoListId) === sourceId
        : text(layout.adminSharedSourceId) === sourceId;
      if (!matchesSource || canonicalTemplateJson(layout.adminCausalSource.binding) !== canonicalTemplateJson(binding)) continue;
      archived.set(layout.id, { layoutId: layout.id, binding: { ...binding }, record: { ...record } });
    }
  }
  return [...archived.values()];
}
