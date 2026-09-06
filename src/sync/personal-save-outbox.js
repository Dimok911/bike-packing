import { canonicalListOperationJson } from "./list-operation-queue.js";
import { encodePersonalSnapshot, decodePersonalSnapshot } from "./personal-snapshot-codec.js";
import { readStablePersonalEntries, readPersonalCheckpoints, publishPersonalCheckpoint,
  retireObservedPersonalCheckpoints } from "./personal-save-checkpoints.js";

// Separate rollout gate. Local capture is not permission to enable networking.
export const PERSONAL_SAVE_OUTBOX_ENABLED = false;

// The immutable action also owns the list ID. The active-list preference is
// only a mirror and may not have been written when the browser stopped.
export function recoverPersonalSaveListId({ storage, actorId, scopeKey }) {
  const prefix = "bike-packing-personal-save-v1:";
  const candidates = new Set();
  const checked = new Set();
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const encoded = key.slice(prefix.length).split(":")[0];
      const binding = JSON.parse(decodeURIComponent(encoded));
      if (binding.environment !== "bike-packing-experiment" || binding.actorId !== actorId || binding.scopeKey !== scopeKey) continue;
      if (checked.has(encoded)) continue;
      const outbox = createPersonalSaveOutbox({ storage, ...binding });
      if (encoded !== encodeURIComponent(JSON.stringify(outbox.binding))) throw Error("Invalid journal binding");
      checked.add(encoded);
      if (outbox.recover()) candidates.add(binding.listId);
    }
  } catch (error) {
    if (error.isPersonalSaveBlocked) throw error;
    throw blocked("storage", "Не удалось восстановить список из журнала. Создание нового списка остановлено.");
  }
  if (candidates.size > 1) throw blocked("selection", "Найдено несколько локальных списков. Автоматически выбирать или создавать список нельзя.");
  return [...candidates][0] || "";
}
const environment = "bike-packing-experiment";
const prefix = "bike-packing-personal-save-v1:";
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const blocked = (code, message) => Object.assign(new Error(message), {
  code, isPersonalSaveBlocked: true, isOperationReceiptError: true
});

// Each action has its own immutable storage key: two tabs cannot overwrite one
// another's intent. A concurrent fork is retained and blocked, never date-sorted.
export function createPersonalSaveOutbox({ storage, actorId, listId, scopeKey,
  environmentId = environment } = {}) {
  if (environmentId !== environment || !validId(actorId) || !validId(listId) || !validId(scopeKey)) {
    throw blocked("scope", "Не определён личный список для сохранения.");
  }
  const binding = { environment, actorId, listId, scopeKey };
  const keyPrefix = `${prefix}${encodeURIComponent(JSON.stringify(binding))}:`;
  const read = () => {
    try {
      const records = new Map(), applied = new Map();
      const entries = readStablePersonalEntries(storage, keyPrefix);
      const { anchor, checkpoints } = readPersonalCheckpoints(entries, keyPrefix);
      const retired = new Set(anchor?.retired || []);
      for (const [key, value] of entries) {
        if (checkpoints.has(key)) continue;
        const suffix = key.slice(keyPrefix.length);
        if (retired.has(suffix) || suffix.startsWith("applied:") && retired.has(suffix.slice(8).split(":")[0])) continue;
        let record = JSON.parse(value);
        if (key.startsWith(`${keyPrefix}applied:`)) {
          if (record?.version !== 1 || !uuid(record.operationId)
            || ![`${keyPrefix}applied:${record.operationId}`, `${keyPrefix}applied:${record.operationId}:${record.stateRevision}`].includes(key)
            || !Number.isSafeInteger(record.stateRevision) || record.stateRevision < 1) throw Error("Invalid local checkpoint");
          if (applied.has(record.operationId) && applied.get(record.operationId).stateRevision !== record.stateRevision) throw Error("Conflicting local confirmations");
          applied.set(record.operationId, record);
          continue;
        }
        if (record?.version === 2) record = { version: 1, action: record.action,
          snapshot: decodePersonalSnapshot(record.action?.body?.payload, record.snapshotPatch) };
        const action = record?.action;
        if (record?.version !== 1 || !action || !uuid(action.operationId)
          || key !== keyPrefix + action.operationId
          || Object.keys(binding).some(field => action[field] !== binding[field])
          || !["list.create", "list.update"].includes(action.kind)
          || !record.snapshot || typeof record.snapshot !== "object"
          || !action.body?.payload || action.body.causal?.reads?.length !== 0
          || !Array.isArray(action.body.causal?.dependsOn)
          || !Number.isSafeInteger(action.generation) || action.generation < 1) throw Error("Invalid record");
        records.set(action.operationId, record);
      }
      const parents = new Set();
      if (anchor && (records.get(anchor.operationId)?.action.generation !== anchor.generation
        || applied.get(anchor.operationId)?.stateRevision !== anchor.stateRevision)) throw Error("Anchor without confirmed action");
      for (const id of applied.keys()) if (!records.has(id)) throw Error("Checkpoint without action");
      for (const record of records.values()) {
        const action = record.action, parentId = action.previousLocalOperationId || action.body.causal.baseOperationId;
        if (anchor?.operationId === action.operationId) continue; // its predecessor chain was durably confirmed
        if (!parentId) {
          if (action.generation !== 1 || action.body.causal.dependsOn.length
            || (action.kind !== "list.create" && (!Number.isSafeInteger(action.body.baseStateRevision)
              || action.body.baseStateRevision < 1))) throw Error("Invalid root");
          continue;
        }
        const parent = records.get(parentId)?.action;
        if (action.previousLocalOperationId) {
          if (!parent || action.kind !== "list.update" || parent.generation + 1 !== action.generation
            || anchor?.operationId !== parentId || !anchor.baseline
            || action.body.baseStateRevision !== anchor.baseline.stateRevision
            || action.body.causal.baseOperationId || action.body.causal.dependsOn.length) throw Error("Invalid baseline successor");
          parents.add(parentId);
          continue;
        }
        if (!parent || action.kind !== "list.update" || parent.generation + 1 !== action.generation
          || canonicalListOperationJson(action.body.causal.dependsOn)
            !== canonicalListOperationJson([{ operationId: parentId, listId }])) throw Error("Missing or invalid predecessor");
        parents.add(parentId);
      }
      const heads = [...records.values()].filter(record => !parents.has(record.action.operationId));
      if (heads.length > 1) throw blocked("fork", "В двух вкладках сохранены разные изменения. Отправка приостановлена; обе версии сохранены.");
      return { records, applied, anchor, checkpoints, entries, head: heads[0] || null };
    } catch (error) {
      if (error.isPersonalSaveBlocked) throw error;
      throw blocked("storage", "Журнал сохранения недоступен или повреждён. Автоматическая отправка остановлена.");
    }
  };
  // The parent represents the version actually observed by this editor, not
  // whichever other tab happened to save while this editor was awaiting a lock.
  const observation = ({ head, anchor }) => canonicalListOperationJson({
    operationId: head?.action.operationId || null,
    baseline: anchor?.baseline
      ? { operationId: anchor.operationId, stateRevision: anchor.baseline.stateRevision, payload: anchor.baseline.payload } : null
  });
  let observed = observation(read());
  const assertObserved = () => {
    const result = read();
    if (observation(result) !== observed) {
      throw blocked("stale-tab", "Другая вкладка изменила список. Сначала загрузите её версию; текущая отправка остановлена.");
    }
    return result;
  };
  return {
    binding: clone(binding),
    recover() { return clone(read().head); },
    recoverSnapshot() {
      const { head, anchor } = read();
      if (head?.action.operationId === anchor?.operationId && anchor?.baseline) {
        return decodePersonalSnapshot(anchor.baseline.payload, anchor.baseline.snapshotPatch);
      }
      return clone(head?.snapshot || null);
    },
    baseline() { return clone(read().anchor?.baseline || null); },
    adoptRemoteBaseline({ snapshot, payload, stateRevision, meta = {} }) {
      const input = clone({ snapshot, payload, stateRevision, meta });
      const { records, applied, anchor, checkpoints, head } = assertObserved();
      if (!head) return false;
      const confirmedRevision = applied.get(head.action.operationId)?.stateRevision;
      if (!confirmedRevision || !Number.isSafeInteger(stateRevision)
        || stateRevision < Math.max(confirmedRevision, anchor?.baseline?.stateRevision || 0)) {
        throw blocked("baseline", "Нельзя заменить неподтверждённые действия или принять более старую серверную версию.");
      }
      const baseline = { payload: input.payload, stateRevision, meta: input.meta,
        snapshotPatch: encodePersonalSnapshot(input.payload, input.snapshot) };
      if (anchor?.baseline?.stateRevision === stateRevision
        && canonicalListOperationJson(anchor.baseline.payload) !== canonicalListOperationJson(baseline.payload)) {
        throw blocked("baseline", "Одна серверная версия содержит разные данные. Автоматическая замена остановлена.");
      }
      const next = { version: 1, operationId: head.action.operationId, generation: head.action.generation,
        stateRevision: confirmedRevision, baseline,
        retired: [...new Set([...(anchor?.retired || []), ...records.keys()])].filter(id => id !== head.action.operationId) };
      try { publishPersonalCheckpoint(storage, keyPrefix, next); }
      catch { throw blocked("quota", "Не хватило места для серверной версии. Текущая версия не заменена."); }
      retireObservedPersonalCheckpoints(storage, checkpoints, keyPrefix);
      observed = observation({ head, anchor: next });
      assertObserved();
      return true;
    },
    hasPending() {
      const { head, applied } = read();
      return Boolean(head && !applied.has(head.action.operationId));
    },
    // Called ONLY after latest-receipt freshness and durable UI/base writes.
    // This checkpoint is not a substitute for a server operation receipt.
    markApplied({ operationId, stateRevision }) {
      const { head, applied } = assertObserved();
      if (head?.action.operationId !== operationId || !Number.isSafeInteger(stateRevision) || stateRevision < 1) {
        throw blocked("checkpoint", "Подтверждение не соответствует текущему сохранению.");
      }
      if (applied.has(operationId)) {
        if (applied.get(operationId).stateRevision !== stateRevision) throw blocked("checkpoint", "Операция уже подтверждена с другой серверной версией.");
        return;
      }
      try {
        // Revision-qualified keys cannot overwrite a different confirmation
        // racing from another tab. Identical retries write identical bytes.
        storage.setItem(`${keyPrefix}applied:${operationId}:${stateRevision}`, JSON.stringify({ version: 1, operationId, stateRevision }));
      } catch {
        throw blocked("storage", "Подтверждение получено, но не сохранено на устройстве. Повтор будет сверен с сервером.");
      }
      assertObserved();
    },
    compact() {
      const { records, applied, anchor, checkpoints, entries, head } = assertObserved();
      if (!head || !applied.has(head.action.operationId)) return { removed: 0, pending: true };
      const operationId = head.action.operationId;
      const retired = [...new Set([...(anchor?.retired || []), ...records.keys()])].filter(id => id !== operationId);
      const nextAnchor = { version: 1, operationId, generation: head.action.generation,
        stateRevision: applied.get(operationId).stateRevision, retired,
        ...(anchor?.operationId === operationId && anchor.baseline ? { baseline: anchor.baseline } : {}) };
      // Commit the exact retirement set BEFORE deleting anything. An interrupted
      // cleanup is recoverable and may only delete these immutable old keys.
      try { publishPersonalCheckpoint(storage, keyPrefix, nextAnchor); }
      catch { return { removed: 0, pending: true }; }
      let removed = 0;
      const retirementSet = new Set(retired);
      const cleanupKeys = [...entries.keys()].filter(key => {
        const suffix = key.slice(keyPrefix.length);
        return retirementSet.has(suffix) || suffix.startsWith("applied:") && retirementSet.has(suffix.slice(8).split(":")[0]);
      });
      for (const key of cleanupKeys) {
        try {
          if (storage.getItem(key) !== null) { storage.removeItem(key); removed++; }
        } catch { /* The durable retirement set remains authoritative. */ }
      }
      // Keep retired IDs as ordering evidence for late suspended writers. Only
      // large payloads and observed, fully carried certificates are discarded.
      retireObservedPersonalCheckpoints(storage, checkpoints, keyPrefix);
      observed = observation({ head, anchor: nextAnchor });
      assertObserved();
      return { removed, pending: [...cleanupKeys, ...checkpoints.keys()].some(key => key !== `${keyPrefix}anchor` && storage.getItem(key) !== null) };
    },
    list() { return clone([...read().records.values()]); },
    capture({ snapshot, body, create = false, operationId = crypto.randomUUID() }) {
      const input = clone({ snapshot, body });
      const { head, records, anchor } = assertObserved();
      if (!uuid(operationId) || !input.snapshot || typeof input.snapshot !== "object"
        || !input.body?.payload || input.body.causal !== undefined || records.has(operationId)
        || anchor?.retired.includes(operationId) || storage.getItem(keyPrefix + operationId) !== null) {
        throw blocked("input", "Не удалось зарегистрировать действие сохранения.");
      }
      // UI-only changes don't create another business operation. The ordinary
      // local mirror may still persist those UI preferences.
      const baseline = anchor?.operationId === head?.action.operationId ? anchor?.baseline : null;
      if (head && canonicalListOperationJson(baseline?.payload || head.action.body.payload) === canonicalListOperationJson(input.body.payload)) return clone(head);
      if (create && head) throw blocked("create", "Повторное создание списка запрещено.");
      if (!head && !create && (!Number.isSafeInteger(input.body.baseStateRevision) || input.body.baseStateRevision < 1)) {
        throw blocked("revision", "Перед первым сохранением нужна подтверждённая версия списка.");
      }
      const causal = { dependsOn: [], reads: [] };
      if (baseline) {
        if (input.body.baseStateRevision !== baseline.stateRevision) throw blocked("baseline", "Локальные данные относятся к другой серверной версии. Сохранение остановлено.");
      } else if (head) {
        causal.baseOperationId = head.action.operationId;
        causal.dependsOn.push({ operationId: head.action.operationId, listId });
      }
      const action = { ...binding, operationId, generation: (head?.action.generation || 0) + 1,
        ...(baseline ? { previousLocalOperationId: head.action.operationId } : {}),
        kind: create ? "list.create" : "list.update", body: { ...input.body, ...(create ? { id: listId } : {}), causal } };
      const record = { version: 1, snapshot: input.snapshot, action };
      try {
        // The recoverable local data AND operation are one atomic setItem.
        // No await, network, mirror update, or older-record deletion precedes it.
        storage.setItem(keyPrefix + operationId, JSON.stringify({ version: 2, action,
          snapshotPatch: encodePersonalSnapshot(action.body.payload, record.snapshot) }));
      } catch {
        throw blocked("quota", "Не хватает места для надёжного сохранения. Изменение не отправлено; не закрывайте вкладку.");
      }
      observed = observation({ head: record, anchor });
      assertObserved(); // Detect a racing writer if it has already completed.
      return clone(record);
    },
    async drain({ queue, getContext, onConfirmed = () => {} }) {
      const { records, head } = assertObserved();
      if (!head) return null;
      const initial = clone(getContext());
      const assertContext = () => {
        const current = getContext();
        if (!initial || Object.keys(binding).some(field => current?.[field] !== binding[field])
          || current?.generation !== initial.generation || current?.scope !== "personal") {
          throw blocked("context", "Аккаунт или локальная версия изменились. Старый ответ не применён.");
        }
        if (assertObserved().head?.action.operationId !== head.action.operationId) {
          throw blocked("context", "Сохранено новое локальное действие. Предыдущий ответ не применён.");
        }
      };
      assertContext();
      const chain = [];
      for (let record = head; record; record = records.get(record.action.body.causal.baseOperationId)) chain.push(record);
      let result;
      for (const record of chain.reverse()) {
        assertContext();
        const action = record.action;
        // Receipt-only settlement allows a historical predecessor to finish
        // without installing its payload as current UI state.
        result = await queue.run({ operationId: action.operationId,
          path: action.kind === "list.create" ? "/bike-packing/lists" : `/bike-packing/lists/${encodeURIComponent(listId)}`,
          method: action.kind === "list.create" ? "POST" : "PUT", body: JSON.stringify(action.body), receiptOnly: true });
        assertContext();
      }
      // Re-read the last receipt with the queue's server-freshness guard before
      // allowing the UI to mark this exact local generation synchronized.
      const last = head.action;
      result = await queue.run({ operationId: last.operationId,
        path: last.kind === "list.create" ? "/bike-packing/lists" : `/bike-packing/lists/${encodeURIComponent(listId)}`,
        method: last.kind === "list.create" ? "POST" : "PUT", body: JSON.stringify(last.body) });
      assertContext();
      onConfirmed(result, clone(head));
      return result;
    }
  };
}
