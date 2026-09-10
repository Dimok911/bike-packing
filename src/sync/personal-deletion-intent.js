import { deleteItemFromState } from "../state/item-ops.js";
import { deleteRootContainerFromState } from "../state/container-ops.js";
import { removeItemFromLayoutArrangement, touchLayoutsReferencingItemInState } from "../state/layout-ops.js";
import { reducePersonalPlacementReference } from "./personal-placement-mutation.js";
import { validPersonalRestoreCancellation } from "./personal-restore-cancellation.js";
import { validPersonalShareCancellation } from "./personal-share-cancellation.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

export function personalDeletionIntent(value) {
  if (value?.type === "batch") {
    if (!Array.isArray(value.operations) || !value.operations.length) throw Error("Пустое действие удаления.");
    const seen = new Set();
    const operations = value.operations.map(entry => {
      if (entry?.type === "batch") throw Error("Вложенное действие удаления запрещено.");
      const operation = personalDeletionIntent(entry), key = JSON.stringify(operation);
      if (seen.has(key)) throw Error("Повтор записи в действии удаления.");
      seen.add(key); return operation;
    });
    return { type: "batch", operations };
  }
  if (!["item", "container", "layout"].includes(value?.type) || typeof value.id !== "string" || !value.id
    || value.id !== value.id.trim() || value.id.length > 191
    || ["__proto__", "prototype", "constructor"].includes(value.id)) throw Error("Неизвестное действие удаления.");
  return { type: value.type, id: value.id };
}

const entries = intent => intent.type === "batch" ? intent.operations : [intent];
const field = intent => ({ item: "items", container: "containers", layout: "layouts" })[intent.type];

// A later explicit comparison can retain some deleted records. Only the
// deletions still present in the NEW snapshot belong to its NEW action.
export function retainedPersonalDeletionIntent(value, payload) {
  const intent = personalDeletionIntent(value);
  const remaining = entries(intent).filter(entry => !Object.hasOwn(payload[field(entry)] || {}, entry.id));
  if (!remaining.length) return null;
  return intent.type === "batch" ? { type: "batch", operations: remaining } : remaining[0];
}

// Work only on a private candidate. A missing/invalid/photo-owning target
// aborts the whole preparation, without touching live state, cache or network.
export function preparePersonalDeletionBatch(state, value, { changedAt = "", markEdited = () => {}, hasPhotos = () => false } = {}) {
  const intent = personalDeletionIntent(value), operations = entries(intent);
  if (operations.some(entry => entry.type === "layout")) throw Error("Для удаления укладки нужен отдельный подготовленный снимок.");
  for (const entry of operations) {
    const record = state?.[field(entry)]?.[entry.id];
    if (!record || entry.type === "container" && record.parentId && record.nestable !== true) {
      throw Error("Состав выбранных записей изменился. Выберите их заново.");
    }
  }
  const candidate = JSON.parse(JSON.stringify(state));
  const beforeDelete = record => {
    if (hasPhotos(record)) throw Error("Удаление записей с фото пока недоступно в проверочном режиме очереди. Данные и фото оставлены без изменений.");
  };
  for (const entry of operations) {
    if (entry.type === "item") deleteItemFromState(candidate, entry.id, {
      changedAt, markEdited, beforeDeleteItem: beforeDelete, removeItemFromLayoutArrangement,
      touchLayoutsReferencingItem: id => touchLayoutsReferencingItemInState(candidate, id, { changedAt, markEdited })
    });
    else deleteRootContainerFromState(candidate, entry.id, { changedAt, markEdited, beforeDeleteContainer: beforeDelete });
  }
  for (const entry of operations) {
    if (Object.hasOwn(candidate[field(entry)], entry.id)) throw Error("Выбранная запись не удалена из снимка.");
  }
  return { snapshot: candidate, intent };
}

// Reduce only the comparison baseline, never live state. This is not a general
// force save: unrelated losses must still pass the ordinary regression guard.
export function personalDeletionReference(base, records, { confirmedBoundary = null } = {}) {
  if (!base) return null;
  let reference = JSON.parse(JSON.stringify(base));
  let declared = false;
  const byId = new Map(records.map(record => [record.action?.operationId, record]));
  let boundaryGeneration = 0;
  if (confirmedBoundary) {
    const record = byId.get(confirmedBoundary.operationId);
    if (!record || record.action.listId !== confirmedBoundary.listId || !Number.isSafeInteger(confirmedBoundary.stateRevision)
      || confirmedBoundary.stateRevision < 1 || canonicalListOperationJson(base) !== canonicalListOperationJson(confirmedBoundary.payload)) {
      throw Error("Не подтверждена текущая исходная версия списка.");
    }
    boundaryGeneration = record.action.generation;
  }
  for (const record of [...records].filter(record => !boundaryGeneration || record.action.generation > boundaryGeneration)
    .sort((a, b) => (a.action?.generation || 0) - (b.action?.generation || 0))) {
    if (record.reconciliation?.decision) {
      if (!validPersonalRestoreCancellation(record) && !validPersonalShareCancellation(record, byId)) throw Error("Не подтверждён отказ от отклонённого действия.");
      reference = JSON.parse(JSON.stringify(record.snapshot)); declared = true;
    }
    if (["list.restore", "list.import"].includes(record.action?.kind)) {
      // A prepared restore is an explicit replacement, not permission for
      // unrelated losses in a later save. The server still validates its hash,
      // history provenance and numeric target revision inside the transaction.
      reference = JSON.parse(JSON.stringify(record.snapshot));
      declared = true;
    }
    if (record.action?.body?.userPlacement) {
      reducePersonalPlacementReference(reference, record.action.body.userPlacement, record.action.body.payload);
      declared = true;
    }
    const value = record.action?.body?.userDeletion;
    if (!value) continue;
    const intent = personalDeletionIntent(value);
    for (const entry of entries(intent)) {
      const entities = record.action.body.payload?.[field(entry)];
      if (!entities || Object.hasOwn(entities, entry.id)) throw Error("Снимок не соответствует заявленному удалению.");
      declared = true;
      if (entry.type === "item") deleteItemFromState(reference, entry.id, { removeItemFromLayoutArrangement });
      else if (entry.type === "container") deleteRootContainerFromState(reference, entry.id);
      else delete reference.layouts?.[entry.id];
    }
  }
  return declared ? reference : null;
}

export function preservesUndeletedEntities(current, reference) {
  const includes = (actual, expected) => Object.keys(expected || {}).every(id => Object.prototype.hasOwnProperty.call(actual || {}, id));
  if (!["items", "containers", "layouts"].every(type => includes(current?.[type], reference?.[type]))) return false;
  return Object.entries(reference.layouts || {}).every(([id, layout]) =>
    ["items", "containers"].every(type => includes(current.layouts[id]?.arrangement?.[type], layout.arrangement?.[type])));
}
