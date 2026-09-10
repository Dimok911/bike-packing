import { assertListOperationJsonValue, assertListOperationPayload } from "./list-operation-payload.js";

export const PERSONAL_SHARE_LINK_ENABLED = false;
export const PERSONAL_SHARE_LINK_CAPABILITY = "personalCausalShareLinksV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => Boolean(value && Object.getPrototypeOf(value) === Object.prototype);
const id = value => typeof value === "string" && value.length > 0 && value.length <= 191 && value === value.trim()
  && !["__proto__", "prototype", "constructor"].includes(value);
const uuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const text = (value, max) => typeof value === "string" && value.length <= max;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const fail = (code = "share-link-source") => { throw Object.assign(Error("Выбранная ссылка не подтверждена точным снимком. Исходные данные и выбор сохранены."), { code }); };
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;

export function personalShareLinkId(operationId, mode) {
  if (!uuid(operationId) || !["live", "snapshot"].includes(mode)) fail();
  return `shared-entity-${mode === "live" ? "link" : "snapshot"}-${operationId}`;
}

export function assertPersonalShareLinkDescriptor(value, operationId) {
  if (!exact(value, ["version", "id", "mode", "scope", "entityType", "entityId", "layoutId", "title", "description", "includeAuthor", "authorName"])
    || value.version !== 1 || value.id !== personalShareLinkId(operationId, value.mode)
    || !["list", "layout", "entity"].includes(value.scope)
    || !["", "item", "container"].includes(value.entityType)
    || (value.entityType ? !id(value.entityId) : value.entityId !== "")
    || (value.layoutId !== "" && !id(value.layoutId)) || value.scope === "layout" && !value.layoutId
    || value.scope === "entity" && !value.entityType || value.scope === "list" && value.entityType !== ""
    || !text(value.title, 255) || !text(value.description, 10000) || typeof value.includeAuthor !== "boolean"
    || !text(value.authorName, 255) || !value.includeAuthor && value.authorName !== "") fail("share-link-descriptor");
  return value;
}

function maps(payload) {
  if (!plain(payload) || !["items", "containers", "layouts"].every(key => plain(payload[key]))
    || !Array.isArray(payload.locations) || !Array.isArray(payload.categories)
    || Object.hasOwn(payload, "causalShareLink")) fail();
  for (const field of ["items", "containers", "layouts"]) for (const [key, value] of Object.entries(payload[field])) {
    if (!id(key) || !plain(value) || value.id !== key) fail();
  }
}

export function personalShareBusinessPayload(value) {
  assertListOperationJsonValue(value); maps(value);
  const payload = clone(value);
  for (const key of ["collapsedContainers", "itemDisplayMode", "showItemMeta", "showFilterContext", "collectionMode", "showOnlyUnpacked", "packedItems", "activeLayoutId"]) delete payload[key];
  for (const owner of Object.values(payload.items)) for (const key of ["containerId", "parentContainerId"]) delete owner[key];
  for (const owner of Object.values(payload.containers)) for (const key of ["parentId", "parentContainerId", "containerId", "itemIds", "childIds", "order"]) delete owner[key];
  return payload;
}

function layoutIds(payload, layout) {
  const a = layout?.arrangement;
  if (!plain(a) || !plain(a.containers) || !plain(a.items) || !Array.isArray(a.rootContainerIds)
    || !same(layout.rootContainerIds, a.rootContainerIds)) fail();
  const containers = new Set(Object.keys(a.containers)), items = new Set(Object.keys(a.items));
  if (!plain(a.packedItems) || a.itemQuantities !== undefined && !plain(a.itemQuantities)
    || Object.entries(a.packedItems).some(([key, packed]) => !items.has(key) || typeof packed !== "boolean")
    || Object.entries(a.itemQuantities || {}).some(([key, quantity]) => !items.has(key) || !Number.isSafeInteger(quantity) || quantity < 1)) fail();
  if (new Set(a.rootContainerIds).size !== a.rootContainerIds.length) fail();
  for (const key of containers) {
    const row = a.containers[key];
    if (!payload.containers[key] || !plain(row) || !Array.isArray(row.childIds) || !Array.isArray(row.itemIds)
      || !Array.isArray(row.order) || (row.parentId ? !containers.has(row.parentId) : !a.rootContainerIds.includes(key))
      || new Set(row.childIds).size !== row.childIds.length || new Set(row.itemIds).size !== row.itemIds.length
      || row.childIds.some(child => !containers.has(child) || a.containers[child].parentId !== key)
      || row.itemIds.some(item => !items.has(item) || a.items[item] !== key)
      || row.parentId && !a.containers[row.parentId].childIds.includes(key)) fail();
    const expected = [...row.childIds.map(child => `container:${child}`), ...row.itemIds.map(item => `item:${item}`)].sort();
    if (!same(row.order.map(entry => `${entry.type}:${entry.id}`).sort(), expected)) fail();
    const ancestors = new Set([key]); let parent = row.parentId;
    while (parent) { if (ancestors.has(parent)) fail(); ancestors.add(parent); parent = a.containers[parent]?.parentId; }
  }
  if (a.rootContainerIds.some(key => !containers.has(key) || a.containers[key].parentId)
    || [...items].some(key => !payload.items[key] || !containers.has(a.items[key]) || !a.containers[a.items[key]].itemIds.includes(key))) fail();
  return { containers, items };
}

function selectedPayload(payload, layout, containers, items, target) {
  const owners = [...containers].map(key => payload.containers[key]).concat([...items].map(key => payload.items[key]));
  const locations = new Set(owners.map(owner => owner.location).filter(Boolean));
  const categories = new Set(owners.flatMap(owner => [...(owner.categories || []), owner.category].filter(Boolean)));
  return { locations: payload.locations.filter(value => locations.has(value)), categories: payload.categories.filter(value => categories.has(value)),
    containers: Object.fromEntries([...containers].map(key => [key, clone(payload.containers[key])])),
    items: Object.fromEntries([...items].map(key => [key, clone(payload.items[key])])),
    layouts: { [layout.id]: clone(layout) }, ...(target.entityType ? { sharedEntityTarget: {
      type: target.entityType, id: target.entityId, scope: target.scope === "layout" ? "layout" : "entity" } } : {}) };
}

// A projection is a deterministic disclosure boundary. No repair, fallback to
// another layout, generated IDs, or mutable source reads occur here.
export function personalShareLinkProjection(payload, descriptor, operationId) {
  assertListOperationJsonValue({ payload, descriptor }); maps(payload);
  const chosen = assertPersonalShareLinkDescriptor(descriptor, operationId);
  if (chosen.layoutId && !payload.layouts[chosen.layoutId]) fail();
  if (chosen.scope === "list") { for (const layout of Object.values(payload.layouts)) layoutIds(payload, layout); return clone(payload); }
  const sourceLayout = chosen.layoutId ? payload.layouts[chosen.layoutId] : null;
  if (chosen.scope === "layout") {
    const selected = layoutIds(payload, sourceLayout);
    if (chosen.entityType && !selected[chosen.entityType === "item" ? "items" : "containers"].has(chosen.entityId)) fail();
    return selectedPayload(payload, sourceLayout, selected.containers, selected.items, chosen);
  }
  const collection = chosen.entityType === "item" ? "items" : "containers";
  if (!payload[collection][chosen.entityId]) fail();
  const layoutId = `share-layout-${operationId}`, wrapperId = `share-wrapper-${operationId}`;
  if (payload.layouts[layoutId] || payload.containers[wrapperId] || payload.items[wrapperId]) fail();
  const a = { rootContainerIds: [], containers: {}, items: {}, itemQuantities: {}, packedItems: {} };
  if (chosen.entityType === "item") {
    const source = payload.items[chosen.entityId], base = clone(payload);
    base.containers[wrapperId] = { id: wrapperId, name: source.name || chosen.title, weight: 0, photos: [] };
    a.rootContainerIds = [wrapperId]; a.containers[wrapperId] = { parentId: "", childIds: [], itemIds: [source.id], order: [{ type: "item", id: source.id }] };
    a.items[source.id] = wrapperId; a.itemQuantities[source.id] = 1;
    return selectedPayload(base, { id: layoutId, name: chosen.title, rootContainerIds: [wrapperId], arrangement: a }, new Set([wrapperId]), new Set([source.id]), chosen);
  }
  const containers = new Set(), items = new Set();
  if (sourceLayout) {
    const valid = layoutIds(payload, sourceLayout); if (!valid.containers.has(chosen.entityId)) fail();
    const visit = key => {
      if (containers.has(key)) fail(); containers.add(key);
      const row = sourceLayout.arrangement.containers[key]; a.containers[key] = clone(row);
      for (const item of row.itemIds) { items.add(item); a.items[item] = key;
        for (const field of ["itemQuantities", "packedItems"]) if (Object.hasOwn(sourceLayout.arrangement[field] || {}, item)) a[field][item] = clone(sourceLayout.arrangement[field][item]); }
      row.childIds.forEach(visit);
    };
    visit(chosen.entityId); a.containers[chosen.entityId].parentId = "";
  } else {
    // A catalog-only owner has no implicit tree. A placed bag requires its
    // explicitly selected layout, even when only its own entity is shared.
    if (Object.values(payload.layouts).some(layout => layout.arrangement?.containers?.[chosen.entityId])) fail();
    containers.add(chosen.entityId); a.containers[chosen.entityId] = { parentId: "", childIds: [], itemIds: [], order: [] };
  }
  a.rootContainerIds = [chosen.entityId];
  return selectedPayload(payload, { id: layoutId, name: chosen.title, rootContainerIds: [chosen.entityId], arrangement: a }, containers, items, chosen);
}

export function preparePersonalShareLink({ binding, snapshot, basePayload, baseStateRevision, selection }, {
  enabled = PERSONAL_SHARE_LINK_ENABLED, snapshotToPayload = value => value, createUuid = () => crypto.randomUUID() } = {}) {
  if (!enabled) fail("share-link-disabled");
  assertListOperationJsonValue({ binding, snapshot, basePayload, baseStateRevision, selection });
  if (!plain(binding) || binding.environment !== "bike-packing-experiment" || !id(binding.actorId) || !id(binding.listId)
    || !id(binding.scopeKey) || !Number.isSafeInteger(baseStateRevision) || baseStateRevision < 0
    || !same(snapshotToPayload(clone(snapshot)), basePayload) || !plain(selection)
    || Object.hasOwn(selection, "id") || Object.hasOwn(selection, "version")) fail();
  const operationId = createUuid(), descriptor = { version: 1, id: personalShareLinkId(operationId, selection.mode), ...clone(selection) };
  const projection = personalShareLinkProjection(basePayload, descriptor, operationId);
  const body = { payload: clone(basePayload), baseStateRevision, shareLink: descriptor };
  assertListOperationPayload({ ...binding, kind: "list.update", body });
  return { operationId, snapshot: clone(snapshot), body, projection };
}

export function assertPersonalShareLinkBody(body, operationId, { causal = false } = {}) {
  assertListOperationJsonValue(body);
  const keys = ["payload", "baseStateRevision", "shareLink", ...(causal ? ["causal"] : []),
    ...(Object.hasOwn(body || {}, "photoResults") ? ["photoResults"] : [])];
  if (!exact(body, keys) || !Number.isSafeInteger(body.baseStateRevision) || body.baseStateRevision < 0) fail();
  return personalShareLinkProjection(body.payload, body.shareLink, operationId);
}

export function personalSharePhotoInventory(payload) {
  const result = [], seen = new Set();
  for (const [field, entityType] of [["items", "item"], ["containers", "container"]]) for (const [entityId, owner] of Object.entries(payload[field])) {
    if (owner.photos !== undefined && !Array.isArray(owner.photos)) fail();
    for (const photo of owner.photos || []) {
      if (!plain(photo) || !id(photo.id) || photo.photoId !== photo.id || !uuid(photo.assetId) || !id(photo.listId)
        || photo.status !== "synced" || seen.has(photo.id)) fail();
      seen.add(photo.id); result.push({ entityType, entityId, photoId: photo.id, assetId: photo.assetId });
    }
  }
  return result.sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
}

export function verifyPersonalShareLinkResult(result, expected) {
  try {
    if (!expected?.body?.shareLink) return false;
    assertPersonalShareLinkBody(expected.body, expected.operationId, { causal: Object.hasOwn(expected.body, "causal") });
    const receipt = result?.payload?.sharedLink, revision = result?.payload?.stateRevision;
    const actual = personalShareBusinessPayload(result?.payload?.list?.payload), wanted = clone(expected.body.payload);
    if (expected.body.photoResults) for (const field of ["items", "containers"]) for (const [key, owner] of Object.entries(wanted[field])) {
      if (owner.photos) owner.photos = owner.photos.map((photo, index) => {
        const confirmed = actual[field]?.[key]?.photos?.[index];
        return photo.status === "pending" && photo.id === confirmed?.id && photo.assetId === confirmed?.assetId ? clone(confirmed) : photo;
      });
    }
    if (!same(wanted, actual)) return false;
    const photos = personalSharePhotoInventory(personalShareLinkProjection(actual, expected.body.shareLink, expected.operationId));
    if (!Array.isArray(receipt?.files) || receipt.files.length !== photos.length || receipt.files.some((file, index) =>
      !exact(file, ["entityType", "entityId", "photoId", "assetId", "fileHash", "thumbHash"])
      || !same(photos[index], { entityType: file.entityType, entityId: file.entityId, photoId: file.photoId, assetId: file.assetId })
      || !/^[a-f0-9]{64}$/.test(file.fileHash) || !/^[a-f0-9]{64}$/.test(file.thumbHash))) return false;
    return result.status === 200 && result.payload.ok === true && result.payload.list?.id === expected.listId
      && exact(receipt, ["version", "descriptor", "sourceListId", "sourceStateRevision", "files"])
      && receipt.version === 1 && receipt.sourceListId === expected.listId
      && Number.isSafeInteger(receipt.sourceStateRevision) && receipt.sourceStateRevision >= 1
      && Number.isSafeInteger(revision) && revision === receipt.sourceStateRevision + 1
      && same(receipt.descriptor, expected.body.shareLink);
  } catch { return false; }
}
