import { duplicateContainerSnapshotRecords, placeDuplicatedContainerSnapshotInLayoutState } from "../state/container-ops.js";
import { linkExistingContainerTreeToLayoutState } from "../public/copy-public-layout-target.js";
import { normalizeLayoutArrangement } from "../state/layout-normalize.js";
import { isItemUnavailableForPacking } from "../state/layout-locks.js";

const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const privateRecord = record => plain(record) && !record.adminDemo && !record.adminSharedSourceId && !record.publicCatalogLayoutId
  && !record._publicCopySourceId && !record.sharedSourceId;
const arrayOfIds = ids => Array.isArray(ids) && ids.every(validId) && new Set(ids).size === ids.length;

export function personalContainerTreeIntent(value) {
  if (value?.type !== "container-tree" || value.version !== 1 || !["copy", "link"].includes(value.mode)
    || !validId(value.rootId) || !validId(value.targetLayoutId) || typeof value.sourceLayoutId !== "string"
    || value.sourceLayoutId && !validId(value.sourceLayoutId) || typeof value.targetParentId !== "string"
    || value.targetParentId && !validId(value.targetParentId)
    || value.targetIndex !== null && (!Number.isSafeInteger(value.targetIndex) || value.targetIndex < 0)
    || !Array.isArray(value.containers) || !value.containers.length || !Array.isArray(value.items)) throw Error("Не подтверждён состав копирования сумки.");
  const targets = new Set();
  for (const rows of [value.containers, value.items]) {
    const sources = new Set();
    for (const row of rows) {
      if (!validId(row?.sourceId) || !validId(row.targetId) || sources.has(row.sourceId) || targets.has(row.targetId)
        || (value.mode === "link" ? row.sourceId !== row.targetId : row.sourceId === row.targetId)) throw Error("Неоднозначные номера копируемых записей.");
      sources.add(row.sourceId); targets.add(row.targetId);
    }
  }
  if (!value.containers.some(row => row.sourceId === value.rootId)) throw Error("Не найдена исходная сумка.");
  return clone(value);
}

function validateSource(state, source, hasPhotos) {
  if (!validId(source?.rootId) || !plain(source.containers) || !plain(source.items)) throw Error("Не определён снимок исходной сумки.");
  const containers = new Set(), items = new Set();
  const walk = (id, parent = null) => {
    const record = source.containers[id];
    if (containers.has(id) || !privateRecord(record) || record.id !== id || !privateRecord(state.containers?.[id])
      || !arrayOfIds(record.childIds) || !arrayOfIds(record.itemIds) || parent && record.parentId !== parent) throw Error("В исходной сумке есть повторные или повреждённые связи.");
    if (hasPhotos(record)) throw Error("Копирование сумки с фотографиями ждёт файлового адаптера.");
    containers.add(id);
    const order = record.order;
    if (!Array.isArray(order) || order.some(row => !["item", "container"].includes(row?.type)
      || !(row.type === "item" ? record.itemIds : record.childIds).includes(row.id))
      || new Set(order.map(row => `${row.type}:${row.id}`)).size !== order.length) throw Error("Не подтверждён порядок содержимого сумки.");
    for (const itemId of record.itemIds) {
      const item = source.items[itemId];
      if (items.has(itemId) || !privateRecord(item) || item.id !== itemId || !privateRecord(state.items?.[itemId])
        || item.containerId !== id || isItemUnavailableForPacking(item)) throw Error("Вещь отсутствует, недоступна или связана с другой сумкой.");
      if (hasPhotos(item)) throw Error("Копирование вещей с фотографиями ждёт файлового адаптера.");
      items.add(itemId);
    }
    for (const child of record.childIds) walk(child, id);
  };
  walk(source.rootId);
  if (containers.size !== Object.keys(source.containers).length || items.size !== Object.keys(source.items).length) throw Error("В снимке есть записи вне выбранной ветки.");
}

// Both possible results are detached from the live editor before any await or
// confirmation. Only a same-list private snapshot is supported here. Files,
// public origins and 'missing only' need their own explicitly frozen adapters.
export async function preparePersonalContainerTreeCopy(state, request, {
  changedAt = "", currentEditMeta = () => ({}), markEdited = () => {},
  normalizeContainerColor = value => value, copyContainerName = name => `${name} копия`,
  hasPhotos = record => Boolean(record.photos?.length),
  createId = kind => `${kind}-${crypto.randomUUID()}`
} = {}) {
  const frozen = clone(state), source = clone(request.sourceSnapshot), targetLayoutId = request.targetLayoutId;
  const sourceLayoutId = request.sourceLayoutId || "", targetParentId = request.targetParentId || "", targetIndex = request.targetIndex ?? null;
  const layout = frozen.layouts?.[targetLayoutId];
  if (!validId(targetLayoutId) || !privateRecord(layout) || layout.locked || !plain(layout.arrangement)
    || !plain(layout.arrangement.containers) || !plain(layout.arrangement.items) || !Array.isArray(layout.arrangement.rootContainerIds)
    || sourceLayoutId && !privateRecord(frozen.layouts?.[sourceLayoutId])
    || targetParentId && (!validId(targetParentId) || !privateRecord(frozen.containers?.[targetParentId]) || !layout.arrangement.containers[targetParentId])
    || targetIndex !== null && (!Number.isSafeInteger(targetIndex) || targetIndex < 0)) throw Error("Целевая укладка или место копирования изменились.");
  validateSource(frozen, source, hasPhotos);
  const mapping = { containers: [], items: [] }, assigned = new Set();
  for (const [type, records] of [["container", source.containers], ["item", source.items]]) {
    for (const id of Object.keys(records)) {
      const targetId = createId(type, id);
      if (!validId(targetId) || assigned.has(targetId) || ["containers", "items", "layouts"].some(key => Object.hasOwn(frozen[key] || {}, targetId))) throw Error("Номер копии уже занят. Копирование остановлено.");
      assigned.add(targetId); mapping[type === "container" ? "containers" : "items"].push({ sourceId: id, targetId });
    }
  }
  const common = { type: "container-tree", version: 1, rootId: source.rootId, sourceLayoutId, targetLayoutId, targetParentId, targetIndex };
  const intent = personalContainerTreeIntent({ ...common, mode: "copy", ...mapping });
  const snapshot = clone(frozen);
  const copied = await duplicateContainerSnapshotRecords(source, { targetState: snapshot, changedAt,
    cloneEntity: clone, copyContainerName: name => copyContainerName(name, clone(layout), clone(frozen.containers)),
    currentEditMeta, normalizeContainerColor, targetParentId: targetParentId || null,
    idForRecord: (type, sourceId) => mapping[type === "container" ? "containers" : "items"].find(row => row.sourceId === sourceId)?.targetId,
    copyPhotos: async record => { if (hasPhotos(record)) throw Error("Файлы не подтверждены."); return []; }
  });
  if (!placeDuplicatedContainerSnapshotInLayoutState(snapshot, targetLayoutId, copied.rootId, {
    ...copied, changedAt, targetParentId, targetIndex, normalizeLayoutArrangement,
    touchContainer: id => markEdited(snapshot.containers[id], changedAt), touchLayout: id => markEdited(snapshot.layouts[id], changedAt)
  })) throw Error("Не удалось подготовить размещение копии.");
  let link = null;
  const hasDuplicates = Object.keys(source.containers).some(id => layout.arrangement.containers[id] || layout.rootContainerIds?.includes(id))
    || Object.keys(source.items).some(id => layout.arrangement.items[id]);
  if (!hasDuplicates) {
    const linked = clone(frozen); linked.collapsedContainers ||= {};
    if (!linkExistingContainerTreeToLayoutState(linked, source, targetLayoutId, targetParentId, {
      changedAt, targetIndex, normalizeLayoutArrangement, targetContainerIds: Object.keys(layout.arrangement.containers),
      touchLayout: id => markEdited(linked.layouts[id], changedAt)
    })) throw Error("Не удалось подготовить связь с выбранной укладкой.");
    link = { snapshot: linked, rootId: source.rootId, intent: personalContainerTreeIntent({ ...common, mode: "link",
      containers: Object.keys(source.containers).map(id => ({ sourceId: id, targetId: id })),
      items: Object.keys(source.items).map(id => ({ sourceId: id, targetId: id })) }) };
  }
  return { copy: { snapshot, rootId: copied.rootId, intent }, link };
}
