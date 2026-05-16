import { clonePlain } from "../utils/json.js";

export function markLocalPublicCopyOrigin(record, kind, sourceId, sourceLayoutId = "") {
  if (!record || !sourceId) return;
  record._publicCopySourceKind = kind;
  record._publicCopySourceId = String(sourceId);
  record._publicCopySourceLayoutId = sourceLayoutId ? String(sourceLayoutId) : "";
}

export function legacySharedRootSnapshot(root) {
  const containers = {};
  const items = {};
  if (!root?.id) return { rootId: "", containers, items };
  containers[root.id] = {
    id: root.id,
    name: root.name,
    childIds: [],
    itemIds: (root.items || []).map((item) => item.id).filter(Boolean),
    order: (root.items || []).map((item) => ({ type: "item", id: item.id })).filter((entry) => entry.id)
  };
  (root.items || []).forEach((item) => {
    if (item?.id) items[item.id] = item;
  });
  return { rootId: root.id, containers, items };
}

export function cloneIsolatedPublicEntity(entity) {
  const cloned = clonePlain(entity || {});
  delete cloned.scope;
  delete cloned.source;
  delete cloned.origin;
  delete cloned.sourceType;
  delete cloned.source_type;
  delete cloned.visibility;
  delete cloned.sourceId;
  delete cloned.source_id;
  delete cloned.sourceScope;
  delete cloned.source_scope;
  delete cloned.sourceListId;
  delete cloned.source_list_id;
  delete cloned.listId;
  delete cloned.list_id;
  delete cloned.sourceItemId;
  delete cloned.source_item_id;
  delete cloned.sourceContainerId;
  delete cloned.source_container_id;
  delete cloned.sourceLayoutId;
  delete cloned.source_layout_id;
  delete cloned.sharedSourceId;
  delete cloned.sharedSourceItemId;
  delete cloned.sharedSourceContainerId;
  delete cloned.sharedSourceLayoutId;
  delete cloned.publicSourceId;
  delete cloned.publicSourceItemId;
  delete cloned.publicSourceContainerId;
  delete cloned.publicSourceLayoutId;
  delete cloned.publicCatalogLayoutId;
  delete cloned.publicCatalogItemId;
  delete cloned.publicCatalogContainerId;
  delete cloned.templateId;
  delete cloned.templateSourceId;
  delete cloned.adminDemo;
  delete cloned.isDemo;
  delete cloned.adminShared;
  delete cloned.adminSharedSourceId;
  return cloned;
}
