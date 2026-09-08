// Deterministic DB-only archive compiler shared with the protected API. The
// caller freezes target IDs, names and edit metadata before confirmation.
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const privateRecord = value => plain(value) && !["adminDemo", "adminSharedSourceId", "publicCatalogLayoutId", "sharedSourceId", "_publicCopySourceId"].some(key => value[key]);
const sameIds = (a, b) => ids(a) && ids(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const name = value => typeof value === "string" && value.trim().length > 0 && value.length <= 1000;
const nameKey = value => value.trim().toLowerCase();
const notes = value => String(value || "").replace(/\r\n?/g, "\n").trim();
const fail = () => { throw Object.assign(Error("Не подтверждён полный состав архива и выбранных укладок. Импорт остановлен."), { code: "archive-import-plan" }); };

function state(value) {
  if (!plain(value) || ![value.items, value.containers, value.layouts].every(plain)
    || !Array.isArray(value.locations) || !Array.isArray(value.categories)) fail();
  for (const field of ["items", "containers", "layouts"]) for (const [key, owner] of Object.entries(value[field])) {
    if (!id(key) || !privateRecord(owner) || owner.id !== key || Object.hasOwn(owner, "photos") && (!Array.isArray(owner.photos) || owner.photos.length)) fail();
  }
  for (const field of ["locations", "categories"]) if (value[field].some(entry => typeof entry !== "string")) fail();
}

export function personalArchiveBusinessPayload(value) {
  state(value);
  const payload = clone(value);
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked", "packedItems", "activeLayoutId"]) delete payload[key];
  for (const owner of Object.values(payload.items)) for (const key of ["containerId", "parentContainerId"]) delete owner[key];
  for (const owner of Object.values(payload.containers)) for (const key of ["parentId", "parentContainerId", "containerId", "itemIds", "childIds", "order"]) delete owner[key];
  return payload;
}

function layoutOwners(source, layout) {
  if (!privateRecord(layout) || !plain(layout.arrangement) || !sameIds(layout.rootContainerIds, layout.arrangement.rootContainerIds)) fail();
  const a = layout.arrangement, containers = new Set(), items = new Set();
  if (![a.containers, a.items, a.itemQuantities, a.packedItems].every(plain)) fail();
  const walk = (containerId, parentId) => {
    const placement = a.containers[containerId];
    if (containers.has(containerId) || !source.containers[containerId] || !plain(placement) || placement.parentId !== parentId
      || !ids(placement.childIds) || !ids(placement.itemIds) || !Array.isArray(placement.order)) fail();
    containers.add(containerId);
    const order = new Set();
    for (const entry of placement.order) {
      if (!plain(entry) || !["item", "container"].includes(entry.type) || !id(entry.id)
        || !(entry.type === "item" ? placement.itemIds : placement.childIds).includes(entry.id)
        || order.has(`${entry.type}:${entry.id}`)) fail();
      order.add(`${entry.type}:${entry.id}`);
    }
    if (order.size !== placement.childIds.length + placement.itemIds.length) fail();
    for (const itemId of placement.itemIds) {
      if (items.has(itemId) || !source.items[itemId] || a.items[itemId] !== containerId
        || !Number.isSafeInteger(a.itemQuantities[itemId]) || a.itemQuantities[itemId] < 1) fail();
      items.add(itemId);
    }
    placement.childIds.forEach(childId => walk(childId, containerId));
  };
  layout.rootContainerIds.forEach(rootId => walk(rootId, ""));
  if (Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items).some(key => !items.has(key))
    || Object.keys(a.itemQuantities).some(key => !items.has(key))
    || Object.entries(a.packedItems).some(([key, packed]) => !items.has(key) || typeof packed !== "boolean")) fail();
  return { containers, items };
}

export function personalArchiveImportPlan({ currentPayload, sourcePayload, mode, layoutTargets = [], sourceActiveLayoutId = "", editMeta = {} }) {
  currentPayload = personalArchiveBusinessPayload(currentPayload); sourcePayload = personalArchiveBusinessPayload(sourcePayload);
  if (!["full", "replace", "copy"].includes(mode) || !Array.isArray(layoutTargets) || !plain(editMeta)
    || sourceActiveLayoutId !== "" && !id(sourceActiveLayoutId)
    || Object.keys(editMeta).some(key => !["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].includes(key) || typeof editMeta[key] !== "string")) fail();
  if (mode === "full") {
    if (layoutTargets.length || sourceActiveLayoutId && !sourcePayload.layouts[sourceActiveLayoutId]) fail();
    for (const layout of Object.values(sourcePayload.layouts)) layoutOwners(sourcePayload, layout);
    return { payload: clone(sourcePayload), activeLayoutId: sourceActiveLayoutId || Object.keys(sourcePayload.layouts)[0] || "",
      restoredLayoutIds: Object.keys(sourcePayload.layouts), createdOwners: {
        items: Object.keys(sourcePayload.items).filter(id => !currentPayload.items[id]),
        containers: Object.keys(sourcePayload.containers).filter(id => !currentPayload.containers[id]) } };
  }
  if (!layoutTargets.length) fail();
  const payload = clone(currentPayload), usedSources = new Set(), usedTargets = new Set(), createdOwners = { items: [], containers: [] };
  for (const target of layoutTargets) {
    if (!plain(target) || Object.keys(target).some(key => !["sourceId", "targetId", "name"].includes(key))
      || !id(target.sourceId) || !id(target.targetId) || !name(target.name) || usedSources.has(target.sourceId) || usedTargets.has(target.targetId)
      || currentPayload.items[target.targetId] || currentPayload.containers[target.targetId]) fail();
    usedSources.add(target.sourceId); usedTargets.add(target.targetId);
    const layout = sourcePayload.layouts[target.sourceId], existing = currentPayload.layouts[target.targetId];
    if (!layout || !name(layout.name) || mode === "copy" && existing || mode === "replace" && (target.name !== layout.name
      || existing && (!name(existing.name) || nameKey(existing.name) !== nameKey(layout.name)))) fail();
    const selected = layoutOwners(sourcePayload, layout);
    for (const field of ["items", "containers"]) for (const ownerId of selected[field]) {
      if (!Object.hasOwn(payload[field], ownerId)) {
        payload[field][ownerId] = { ...clone(sourcePayload[field][ownerId]), ...clone(editMeta) }; createdOwners[field].push(ownerId);
      }
    }
    const restored = { ...clone(layout), ...clone(editMeta), id: target.targetId, name: target.name };
    if (existing?.locked) {
      restored.locked = true;
      if (notes(existing.notes) && !notes(restored.notes)) restored.notes = notes(existing.notes);
    }
    payload.layouts[target.targetId] = restored;
  }
  for (const field of ["locations", "categories"]) {
    for (const value of sourcePayload[field]) if (!payload[field].includes(value)) payload[field].push(value);
  }
  const restoredLayoutIds = layoutTargets.map(target => target.targetId);
  return { payload, activeLayoutId: restoredLayoutIds.at(-1), restoredLayoutIds, createdOwners };
}
