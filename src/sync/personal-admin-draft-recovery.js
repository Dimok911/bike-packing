const clone = value => JSON.parse(JSON.stringify(value));
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const blocked = () => Object.assign(Error("Личный список и административный черновик требуют сверки. Исходные записи сохранены."),
  { code: "admin-template-editor-recovery-required", isPersonalSaveBlocked: true, isAdminTemplateBlocked: true });

function ownedDrafts(value, scopeKey) {
  return Object.fromEntries(Object.entries(value.layouts || {}).filter(([id, layout]) => {
    const source = layout?.adminCausalSource, binding = source?.binding;
    if (source?.version !== 1 || binding?.environment !== "bike-packing-experiment"
      || typeof binding.actorId !== "string" || !binding.actorId || scopeKey !== `id:${binding.actorId}`) return false;
    const demo = typeof layout.adminDemoListId === "string" && layout.adminDemoListId === binding.listId
      && /^public-demo-state(?:-.+)?$/.test(binding.listId)
      && binding.itemKey === (binding.listId === "public-demo-state" ? "demo-state" : `demo-state:${binding.listId.slice("public-demo-state-".length)}`);
    const shared = typeof layout.adminSharedSourceId === "string" && layout.adminSharedSourceId
      && binding.listId === `public-shared-layout-${layout.adminSharedSourceId}`
      && binding.itemKey === `shared-layout:${layout.adminSharedSourceId}`;
    if (layout.id !== id || (!demo && !shared)) throw blocked();
    return true;
  }));
}

// A private journal is authoritative only for private business data. Its local
// snapshot may predate a separately persisted administrative edit/confirmation.
// Restore that independent namespace from the same account's current mirror;
// never adopt personal records, global dictionaries, selection or packed state.
export function recoverPersonalAdminDrafts(snapshot, mirrorJson, { scopeKey, enabled = false } = {}) {
  const result = clone(snapshot);
  if (!enabled || typeof scopeKey !== "string" || !scopeKey.startsWith("id:") || !mirrorJson) return result;
  let mirror;
  try { mirror = JSON.parse(mirrorJson); } catch { throw blocked(); }
  if (!object(mirror) || !["layouts", "items", "containers"].every(key => object(mirror[key]) && object(result[key]))) throw blocked();
  const before = ownedDrafts(result, scopeKey), after = ownedDrafts(mirror, scopeKey);
  for (const id of Object.keys(before)) {
    if (Object.hasOwn(mirror.layouts, id) && !Object.hasOwn(after, id)) throw blocked();
  }
  const assertOwner = (collection, id, layoutId) => {
    if (id && (mirror[collection][id]?.id !== id || mirror[collection][id]?.publicCatalogLayoutId !== layoutId)) throw blocked();
  };
  const assertLinks = (row, layoutId) => {
    for (const containerId of [row.parentId, row.parentContainerId, row.containerId, ...(row.childIds || [])])
      assertOwner("containers", containerId, layoutId);
    for (const itemId of row.itemIds || []) assertOwner("items", itemId, layoutId);
    for (const entry of row.order || []) {
      if (!["container", "item"].includes(entry?.type) || !entry.id) throw blocked();
      assertOwner(entry.type === "item" ? "items" : "containers", entry.id, layoutId);
    }
  };
  for (const [id, layout] of Object.entries(after)) {
    if (Object.hasOwn(result.layouts, id) && (!Object.hasOwn(before, id)
      || before[id].adminCausalSource.binding.listId !== layout.adminCausalSource.binding.listId)) throw blocked();
    const previousRevision = before[id]?.adminCausalSource.base?.stateRevision;
    const mirrorRevision = layout.adminCausalSource.base?.stateRevision;
    if (Number.isSafeInteger(previousRevision) && Number.isSafeInteger(mirrorRevision) && mirrorRevision < previousRevision) throw blocked();
    for (const containerId of [...(layout.rootContainerIds || []), ...(layout.arrangement?.rootContainerIds || []),
      ...Object.keys(layout.arrangement?.containers || {})]) assertOwner("containers", containerId, id);
    for (const [itemId, containerId] of Object.entries(layout.arrangement?.items || {})) {
      assertOwner("items", itemId, id); assertOwner("containers", containerId, id);
    }
    for (const placement of Object.values(layout.arrangement?.containers || {})) assertLinks(placement, id);
    for (const itemId of [...Object.keys(layout.arrangement?.packedItems || {}), ...Object.keys(layout.arrangement?.itemQuantities || {})])
      assertOwner("items", itemId, id);
  }
  for (const collection of ["containers", "items"]) {
    const incoming = Object.entries(mirror[collection]).filter(([, row]) => Object.hasOwn(after, row?.publicCatalogLayoutId));
    for (const [id, row] of incoming) {
      const old = result[collection][id];
      if (row.id !== id || Object.hasOwn(result[collection], id)
        && (!Object.hasOwn(before, old?.publicCatalogLayoutId) || old.publicCatalogLayoutId !== row.publicCatalogLayoutId)) throw blocked();
      assertLinks(row, row.publicCatalogLayoutId);
    }
    for (const [id, row] of Object.entries(result[collection])) if (Object.hasOwn(before, row?.publicCatalogLayoutId)) delete result[collection][id];
    // Include detached catalog records as well as records placed in the tree.
    for (const [id, row] of incoming) Object.defineProperty(result[collection], id,
      { value: clone(row), enumerable: true, writable: true, configurable: true });
  }
  for (const id of Object.keys(before)) delete result.layouts[id];
  for (const [id, layout] of Object.entries(after)) Object.defineProperty(result.layouts, id,
    { value: clone(layout), enumerable: true, writable: true, configurable: true });
  return result;
}
