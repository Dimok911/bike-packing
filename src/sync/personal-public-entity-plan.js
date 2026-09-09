import { personalImportOwnersPlan, personalGuestBusinessPayload } from "./personal-import-owners-plan.js";
import { personalGuestSourceLayout } from "./personal-guest-import-source.js";
import { assertListOperationJsonValue } from "./list-operation-payload.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { planPublicCopyMissingItems, summarizePublicCopyDuplicates } from "../public/copy-duplicates.js";
import { hasPrivateSyncBlockedPublicOrigin } from "../public/copy-public-to-private.js";

export const PERSONAL_PUBLIC_ENTITY_COPY_ENABLED = false;
export const PERSONAL_PUBLIC_ENTITY_COPY_CAPABILITY = "personalCausalPublicEntitiesV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exact = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = values => Array.isArray(values) && values.every(id) && new Set(values).size === values.length;
const sameIds = (a, b) => ids(a) && ids(b) && a.length === b.length && a.every((value, index) => value === b[index]);
const fail = () => { throw Object.assign(Error("Состав копии или выбранное место изменились. Исходный шаблон сохранён."), { code: "public-entity-copy" }); };

// Validate the complete source/destination layout before selecting its subtree.
// A malformed arrangement must never be repaired from display owner mirrors.
function arrangementFor(payload, layout, { source = false } = {}) {
  const a = layout?.arrangement;
  if (!plain(layout) || !id(layout.id) || !plain(a) || !sameIds(layout.rootContainerIds, a.rootContainerIds)
    || ![a.containers, a.items ?? {}, a.itemQuantities ?? {}, a.packedItems ?? {}].every(plain)) fail();
  if (!source && ![a.items, a.itemQuantities, a.packedItems].every(plain)) fail();
  const containers = new Set(), items = new Set(), quantities = {};
  const walk = (containerId, parentId) => {
    const row = a.containers[containerId];
    if (containers.has(containerId) || !plain(row) || (row.parentId ?? "") !== parentId
      || payload.containers?.[containerId]?.id !== containerId || !ids(row.childIds) || !ids(row.itemIds) || !Array.isArray(row.order)) fail();
    containers.add(containerId);
    const ordered = new Set();
    for (const entry of row.order) {
      if (!exact(entry, ["type", "id"]) || !["item", "container"].includes(entry.type)
        || !(entry.type === "item" ? row.itemIds : row.childIds).includes(entry.id) || ordered.has(`${entry.type}:${entry.id}`)) fail();
      ordered.add(`${entry.type}:${entry.id}`);
    }
    if (ordered.size !== row.itemIds.length + row.childIds.length) fail();
    for (const itemId of row.itemIds) {
      const quantity = a.itemQuantities?.[itemId] ?? (source ? 1 : undefined);
      if (items.has(itemId) || payload.items?.[itemId]?.id !== itemId || (a.items?.[itemId] ?? (source ? containerId : null)) !== containerId
        || !Number.isSafeInteger(quantity) || quantity < 1) fail();
      items.add(itemId); quantities[itemId] = quantity;
    }
    row.childIds.forEach(childId => walk(childId, containerId));
  };
  a.rootContainerIds.forEach(rootId => walk(rootId, ""));
  if (Object.keys(a.containers).some(key => !containers.has(key)) || Object.keys(a.items || {}).some(key => !items.has(key))
    || Object.keys(a.itemQuantities || {}).some(key => !items.has(key))
    || Object.entries(a.packedItems || {}).some(([key, value]) => !items.has(key) || typeof value !== "boolean")) fail();
  return { arrangement: a, containers, items, quantities };
}

export function personalPublicEntityGraph(sourcePayload, copy) {
  assertListOperationJsonValue({ sourcePayload, copy });
  if (!exact(copy, ["version", "mode", "sourceLayoutId", "entries", "destination"]) || copy.version !== 1 || copy.mode !== "independent"
    || !id(copy.sourceLayoutId) || !Array.isArray(copy.entries) || !copy.entries.length || copy.entries.length > 100
    || !exact(copy.destination, ["layoutId", "containerId", "index"]) || !id(copy.destination.layoutId)
    || copy.destination.containerId !== "" && !id(copy.destination.containerId)
    || copy.destination.index !== null && (!Number.isSafeInteger(copy.destination.index) || copy.destination.index < 0)) fail();
  const layout = personalGuestSourceLayout(sourcePayload, copy.sourceLayoutId), graph = arrangementFor(sourcePayload, layout, { source: true });
  const selected = { item: new Set(), container: new Set() }, quantities = {};
  const add = (entityType, sourceId) => {
    const owner = sourcePayload[entityType === "item" ? "items" : "containers"]?.[sourceId];
    if (!id(sourceId) || owner?.id !== sourceId || selected[entityType].has(sourceId)) fail();
    selected[entityType].add(sourceId);
    if (entityType === "item") {
      const quantity = graph.quantities[sourceId] ?? owner.quantity ?? 1;
      if (!Number.isSafeInteger(quantity) || quantity < 1) fail(); quantities[sourceId] = quantity;
    }
  };
  const walk = (sourceId, contents) => {
    if (contents && !graph.containers.has(sourceId)) fail();
    add("container", sourceId);
    if (contents) for (const entry of graph.arrangement.containers[sourceId].order) {
      if (entry.type === "item") add("item", entry.id); else walk(entry.id, true);
    }
  };
  for (const entry of copy.entries) {
    if (!exact(entry, ["entityType", "sourceId", "includeContents"]) || !["item", "container"].includes(entry.entityType)
      || typeof entry.includeContents !== "boolean" || entry.entityType === "item" && entry.includeContents !== false) fail();
    if (entry.entityType === "item") add("item", entry.sourceId); else walk(entry.sourceId, entry.includeContents);
  }
  const selectedOwners = ["container", "item"].flatMap(entityType => [...selected[entityType]].map(sourceId => ({ entityType, sourceId, sourceLayoutId: layout.id })));
  return { layout, selectedOwners, quantities };
}

// Preserve the established "Missing only" policy: add missing things into
// matching existing bags. Never replace an edited bag/item or invent a bag.
// Placement mirrors are built solely from the chosen canonical layouts.
export function personalPublicMissingPreview({ currentPayload, sourcePayload, sourceLayoutId, sourceId, targetLayoutId }) {
  const independent = { version: 1, mode: "independent", sourceLayoutId,
    entries: [{ entityType: "container", sourceId, includeContents: true }],
    destination: { layoutId: targetLayoutId, containerId: "", index: null } };
  const graph = personalPublicEntityGraph(sourcePayload, independent), base = personalGuestBusinessPayload(currentPayload), target = base.layouts[targetLayoutId];
  if (!target || target.locked) fail();
  const current = arrangementFor(base, target), sourceSnapshot = { rootId: sourceId, containers: {}, items: {} };
  for (const row of graph.selectedOwners) {
    if (row.entityType === "container") {
      const placement = graph.layout.arrangement.containers[row.sourceId];
      sourceSnapshot.containers[row.sourceId] = { ...clone(sourcePayload.containers[row.sourceId]), parentId: placement.parentId,
        childIds: clone(placement.childIds), itemIds: clone(placement.itemIds), order: clone(placement.order) };
    }
    else sourceSnapshot.items[row.sourceId] = { ...clone(sourcePayload.items[row.sourceId]), quantity: graph.quantities[row.sourceId] };
  }
  const items = Object.fromEntries([...current.items].map(id => [id, { ...clone(base.items[id]), quantity: current.quantities[id] }]));
  const options = { sourceSnapshot, targetContainerIds: [...current.containers], targetItemIds: [...current.items],
    containers: base.containers, items, hasPrivateSyncBlockedPublicOrigin };
  const missing = planPublicCopyMissingItems(options), duplicates = summarizePublicCopyDuplicates(options);
  return { ...missing, duplicates, sourceSnapshot, graph,
    copy: { ...independent, version: 2, mode: "missing", missingItems: clone(missing.missingItems) } };
}

export function personalPublicEntitySelectionGraph(sourcePayload, copy, currentPayload) {
  if (copy?.version === 1) return personalPublicEntityGraph(sourcePayload, copy);
  if (!exact(copy, ["version", "mode", "sourceLayoutId", "entries", "destination", "missingItems"])
    || copy.version !== 2 || copy.mode !== "missing" || !Array.isArray(copy.entries) || copy.entries.length !== 1
    || !exact(copy.entries[0], ["entityType", "sourceId", "includeContents"]) || copy.entries[0].entityType !== "container"
    || copy.entries[0].includeContents !== true || !Array.isArray(copy.missingItems) || !copy.missingItems.length) fail();
  const preview = personalPublicMissingPreview({ currentPayload, sourcePayload, sourceLayoutId: copy.sourceLayoutId,
    sourceId: copy.entries[0].sourceId, targetLayoutId: copy.destination?.layoutId });
  if (personalArchiveJson(preview.copy) !== personalArchiveJson(copy)) fail();
  const selected = new Set(copy.missingItems.map(entry => entry.sourceItemId));
  return { ...preview.graph, selectedOwners: preview.graph.selectedOwners.filter(row => row.entityType === "item" && selected.has(row.sourceId)) };
}

// One deterministic final state, retaining the original complete public source.
// No clocks, new IDs, network calls, or writes to existing private owners.
export function personalPublicEntityPlan({ currentPayload, sourcePayload, copy, ownerTargets, photoTargets, editMeta = {}, listId, operationId }, files = []) {
  const base = personalGuestBusinessPayload(currentPayload), graph = personalPublicEntitySelectionGraph(sourcePayload, copy, base);
  const destination = copy.destination, target = base.layouts[destination.layoutId];
  if (!target || target.locked || !Array.isArray(ownerTargets) || ownerTargets.some(owner => owner.reuse !== false)) fail();
  const current = arrangementFor(base, target);
  if (destination.containerId ? !current.containers.has(destination.containerId) : copy.entries.some(entry => entry.entityType === "item")) fail();
  const compiled = personalImportOwnersPlan({ currentPayload: base, sourcePayload, selectedOwners: graph.selectedOwners,
    ownerTargets, photoTargets, editMeta, listId, operationId }, files);
  const layout = clone(target), a = layout.arrangement, maps = { item: new Map(), container: new Map() };
  for (const owner of ownerTargets) maps[owner.entityType].set(owner.sourceId, owner.targetId);
  const addItem = (sourceId, parentId) => {
    const itemId = maps.item.get(sourceId); if (!itemId || !parentId) fail();
    a.items[itemId] = parentId; a.itemQuantities[itemId] = graph.quantities[sourceId];
    delete a.packedItems[itemId]; return itemId;
  };
  const addContainer = (sourceId, parentId, contents) => {
    const containerId = maps.container.get(sourceId), sourceRow = graph.layout.arrangement.containers[sourceId]
      || (!contents ? { childIds: [], itemIds: [], order: [] } : null);
    if (!containerId || !sourceRow) fail();
    const row = { ...clone(sourceRow), parentId, childIds: [], itemIds: [], order: [] };
    if (contents) {
      row.itemIds = sourceRow.itemIds.map(id => addItem(id, containerId));
      row.childIds = sourceRow.childIds.map(id => addContainer(id, containerId, true));
      row.order = sourceRow.order.map(entry => ({ type: entry.type, id: maps[entry.type].get(entry.id) }));
    }
    a.containers[containerId] = row; return containerId;
  };
  const inserted = copy.mode === "missing" ? [] : copy.entries.map(entry => ({ type: entry.entityType, id: entry.entityType === "item"
    ? addItem(entry.sourceId, destination.containerId) : addContainer(entry.sourceId, destination.containerId, entry.includeContents) }));
  if (copy.mode === "missing") {
    for (const entry of copy.missingItems) {
      const row = a.containers[entry.targetContainerId], itemId = addItem(entry.sourceItemId, entry.targetContainerId);
      row.itemIds.push(itemId); row.order.push({ type: "item", id: itemId });
    }
  } else if (destination.containerId) {
    const row = a.containers[destination.containerId];
    for (const entry of inserted) row[entry.type === "item" ? "itemIds" : "childIds"].push(entry.id);
    if (destination.index !== null && destination.index > row.order.length) fail();
    row.order.splice(destination.index ?? row.order.length, 0, ...inserted);
  } else {
    if (destination.index !== null && destination.index > a.rootContainerIds.length) fail();
    a.rootContainerIds.splice(destination.index ?? a.rootContainerIds.length, 0, ...inserted.map(entry => entry.id));
    layout.rootContainerIds = [...a.rootContainerIds];
  }
  for (const key of ["updatedAt", "updatedByDeviceId", "updatedByDeviceName"]) if (Object.hasOwn(editMeta, key)) layout[key] = editMeta[key];
  compiled.payload.layouts[layout.id] = layout;
  // Add only dictionaries used by this selection, preserving existing order.
  for (const row of graph.selectedOwners) {
    const owner = sourcePayload[row.entityType === "item" ? "items" : "containers"][row.sourceId];
    for (const [field, values] of [["locations", [owner.location]], ["categories", owner.categories?.length ? owner.categories : [owner.category]]]) {
      for (const value of values) if (typeof value === "string" && value.trim()) {
        if (!compiled.payload[field].includes(value)) compiled.payload[field].push(value);
        if (Array.isArray(layout[field]) && !layout[field].includes(value)) layout[field].push(value);
      }
    }
  }
  arrangementFor(compiled.payload, layout);
  return { ...compiled, deletions: [], removedLayoutIds: [], importedLayoutIds: [], activeLayoutId: layout.id };
}
