import { createEmptyLayoutArrangement } from "../state/layout-arrangement.js";
import { createLayoutCopyRecordFromSource } from "../state/layout-manage.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { getLayoutContainerIdSet, getLayoutItemIdSet } from "../state/layout-ops.js";
import { readOnlyLayoutDictionaries, ensureLayoutDictionaries } from "../state/dictionaries.js";
import { preservesConfirmedPersonalPhotos } from "./personal-confirmed-photos.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

export const PERSONAL_PHOTO_LAYOUT_COPY_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const privateRecord = value => plain(value) && !["adminDemo", "adminSharedSourceId", "publicCatalogLayoutId", "sharedSourceId"].some(key => value[key]);
const fail = () => { throw Object.assign(Error("Не подтверждён полный состав исходной личной укладки. Создание остановлено."), { code: "layout-copy-source" }); };

export function personalLayoutCopyIntent(value) {
  if (!plain(value) || value.type !== "layout-copy" || value.version !== 1 || !id(value.targetLayoutId)
    || typeof value.sourceLayoutId !== "string" || value.sourceLayoutId && !id(value.sourceLayoutId)
    || value.sourceLayoutId === value.targetLayoutId
    || Object.keys(value).some(key => !["type", "version", "sourceLayoutId", "targetLayoutId"].includes(key))) fail();
  return clone(value);
}

function checkSource(snapshot, layout) {
  if (!privateRecord(layout) || !id(layout.id) || !ids(layout.rootContainerIds) || !plain(layout.arrangement)) fail();
  const a = layout.arrangement, containers = new Set(), items = new Set();
  if (!ids(a.rootContainerIds) || !same(a.rootContainerIds, layout.rootContainerIds)
    || ![a.containers, a.items, a.itemQuantities, a.packedItems].every(plain)) fail();
  const walk = (containerId, parentId) => {
    const placement = a.containers[containerId], owner = snapshot.containers[containerId];
    if (containers.has(containerId) || !privateRecord(owner) || owner.id !== containerId || !plain(placement)
      || placement.parentId !== parentId || !ids(placement.childIds) || !ids(placement.itemIds) || !Array.isArray(placement.order)) fail();
    containers.add(containerId);
    const order = new Set();
    for (const entry of placement.order) {
      if (!plain(entry) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? placement.itemIds : placement.childIds).includes(entry.id)
        || order.has(`${entry.type}:${entry.id}`)) fail();
      order.add(`${entry.type}:${entry.id}`);
    }
    for (const itemId of placement.itemIds) {
      const item = snapshot.items[itemId];
      if (items.has(itemId) || !privateRecord(item) || item.id !== itemId || a.items[itemId] !== containerId
        || !Number.isSafeInteger(a.itemQuantities[itemId]) || a.itemQuantities[itemId] < 1) fail();
      items.add(itemId);
    }
    for (const childId of placement.childIds) walk(childId, containerId);
  };
  for (const rootId of layout.rootContainerIds) walk(rootId, "");
  if (Object.keys(a.containers).some(id => !containers.has(id)) || Object.keys(a.items).some(id => !items.has(id))
    || Object.keys(a.itemQuantities).some(id => !items.has(id))
    || Object.entries(a.packedItems).some(([id, packed]) => !items.has(id) || typeof packed !== "boolean")) fail();
  const checked = clone(snapshot), normalized = checked.layouts[layout.id];
  normalizeLayoutArrangement(normalized, checked);
  if (!same(checked, snapshot)) fail();
  return { containers: [...containers], items: [...items] };
}

// A private layout copy duplicates placement, not its catalog owners. Freeze
// the complete state and the single new layout ID before any await/confirmation.
// The ordinary record factory defines the existing name/dictionary/meta policy.
export function preparePersonalLayoutCopy(state, { sourceLayoutId = "", targetLayoutId, requestedName, listId, activate = true }, {
  changedAt = "", currentCreateMeta = () => ({}), uniqueLayoutName = value => value,
  photoEnabled = PERSONAL_PHOTO_LAYOUT_COPY_ENABLED, dictionaryDefaults = { locations: state.locations || [], categories: state.categories || [] }
} = {}) {
  const intent = personalLayoutCopyIntent({ type: "layout-copy", version: 1, sourceLayoutId, targetLayoutId }), snapshot = clone(state);
  if (!plain(snapshot.items) || !plain(snapshot.containers) || !plain(snapshot.layouts) || typeof requestedName !== "string" || !requestedName.trim()
    || ["items", "containers", "layouts"].some(field => Object.hasOwn(snapshot[field], targetLayoutId))) fail();
  const source = sourceLayoutId ? snapshot.layouts[sourceLayoutId] : { rootContainerIds: [], arrangement: createEmptyLayoutArrangement() };
  const selected = sourceLayoutId ? checkSource(snapshot, source) : { containers: [], items: [] };
  if (selected.containers.some(id => snapshot.containers[id].photos?.length) || selected.items.some(id => snapshot.items[id].photos?.length)) {
    if (!photoEnabled) fail();
  }
  if (!preservesConfirmedPersonalPhotos(snapshot, snapshot, listId)) fail();
  const dictionaryOptions = { sourceState: snapshot, defaults: clone(dictionaryDefaults), getLayoutContainerIdSet, getLayoutItemIdSet };
  const dictionaries = layout => readOnlyLayoutDictionaries(layout, dictionaryOptions);
  const record = createLayoutCopyRecordFromSource({ id: targetLayoutId, requestedName: requestedName.trim(), sourceLayout: source,
    state: snapshot, changedAt, currentCreateMeta, uniqueLayoutName, canUsePrivateState: () => true,
    ensureLayoutDictionaries: dictionaries, ensurePrivateDictionaries: () => dictionaries({}) });
  if (!record || record.id !== targetLayoutId || !privateRecord(record)) fail();
  snapshot.layouts[targetLayoutId] = record;
  ensureLayoutDictionaries(record, dictionaryOptions);
  if (activate) { snapshot.activeLayoutId = targetLayoutId; snapshot.packedItems = clone(record.arrangement.packedItems); }
  return { snapshot, intent, layoutId: targetLayoutId, source: sourceLayoutId ? clone(source) : null };
}
