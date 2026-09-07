import { addItemToLayoutArrangement, ensureLayoutContainerPlacement, getItemContainerIdInLayout } from "../state/layout-ops.js";
import { makeItemCopyName, makeContainerCopyName } from "../state/names.js";

const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);

export function personalCopyIntent(value) {
  if (value?.type !== "copy" || value.version !== 1 || !Array.isArray(value.entries) || !value.entries.length
    || typeof value.keepPlacement !== "boolean" || typeof value.layoutId !== "string"
    || value.layoutId && !validId(value.layoutId) || value.keepPlacement && !value.layoutId) throw Error("Неизвестное действие копирования.");
  const sources = new Set(), targets = new Set();
  const entries = value.entries.map(entry => {
    if (!["item", "container"].includes(entry?.type) || !validId(entry.sourceId) || !validId(entry.targetId)
      || entry.sourceId === entry.targetId || sources.has(`${entry.type}:${entry.sourceId}`) || targets.has(entry.targetId)
      || value.keepPlacement && entry.type !== "item") throw Error("Неоднозначный состав копирования.");
    sources.add(`${entry.type}:${entry.sourceId}`); targets.add(entry.targetId);
    return { type: entry.type, sourceId: entry.sourceId, targetId: entry.targetId };
  });
  return { type: "copy", version: 1, entries, keepPlacement: value.keepPlacement, layoutId: value.layoutId };
}

// Same-list, DB-only copy. Capture the source and every generated target ID
// together before confirmation/network. No photo helper or live state mutation.
export function preparePersonalCopyBatch(state, value, { changedAt = "", currentEditMeta = () => ({}),
  normalizeContainerColor = value => value, markEdited = () => {}, hasPhotos = record => Boolean(record.photos?.length) } = {}) {
  const intent = personalCopyIntent(value), snapshot = clone(state);
  if (intent.keepPlacement && !snapshot.layouts?.[intent.layoutId]) throw Error("Укладка для копирования изменилась.");
  for (const entry of intent.entries) {
    const source = snapshot[entry.type === "item" ? "items" : "containers"]?.[entry.sourceId];
    if (!source || entry.type === "container" && source.parentId) throw Error("Источник копирования изменился. Выберите записи заново.");
    if (["items", "containers", "layouts"].some(type => Object.hasOwn(snapshot[type] || {}, entry.targetId))) {
      throw Error("ID копии уже занят. Копирование остановлено.");
    }
    if (hasPhotos(source)) throw Error("Копирование записей с фото пока недоступно в проверочном режиме очереди. Источник оставлен без изменений.");
  }
  for (const entry of intent.entries) {
    const source = snapshot[entry.type === "item" ? "items" : "containers"][entry.sourceId];
    if (entry.type === "item") {
      snapshot.items[entry.targetId] = { ...clone(source), id: entry.targetId,
        name: makeItemCopyName(source.name, snapshot.items), containerId: "", photos: [], createdAt: changedAt, ...currentEditMeta(changedAt) };
      const layout = snapshot.layouts?.[intent.layoutId];
      const containerId = intent.keepPlacement ? getItemContainerIdInLayout(snapshot, layout, entry.sourceId) : "";
      if (containerId) {
        const placement = ensureLayoutContainerPlacement(snapshot, layout, containerId);
        const orderIndex = (placement.order || []).findIndex(row => row.type === "item" && row.id === entry.sourceId);
        addItemToLayoutArrangement(snapshot, layout, entry.targetId, containerId, orderIndex >= 0 ? orderIndex + 1 : null);
        markEdited(layout, changedAt);
      }
      delete snapshot.packedItems?.[entry.targetId];
    } else {
      snapshot.containers[entry.targetId] = { ...clone(source), id: entry.targetId,
        name: makeContainerCopyName(source.name, snapshot.containers), parentId: null, childIds: [], itemIds: [], order: [],
        color: normalizeContainerColor(source.color), photos: [], createdAt: changedAt, ...currentEditMeta(changedAt) };
    }
  }
  return { snapshot, intent };
}
