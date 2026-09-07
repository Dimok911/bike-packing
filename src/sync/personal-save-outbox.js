import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertListOperationPayload } from "./list-operation-payload.js";
import { encodePersonalSnapshot, decodePersonalSnapshot } from "./personal-snapshot-codec.js";
import { planPersonalPayloadReconciliation, planPersonalLocalPayloadReconciliation } from "./personal-save-reconciliation.js";
import { retainedPersonalDeletionIntent } from "./personal-deletion-intent.js";
import { personalHistoryRestoreManifest } from "./personal-history-restore.js";
import { containsPersonalPhotos, validPersonalRestoreCancellation } from "./personal-restore-cancellation.js";
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
const updateKind = kind => ["list.update", "list.restore"].includes(kind);
const operationRequest = action => ({ operationId: action.operationId,
  path: action.kind === "list.create" ? "/bike-packing/lists" : `/bike-packing/lists/${encodeURIComponent(action.listId)}${action.kind === "list.restore" ? "/restore" : ""}`,
  method: action.kind === "list.update" ? "PUT" : "POST", body: JSON.stringify(action.body) });
const prefix = "bike-packing-personal-save-v1:";
const clone = value => JSON.parse(JSON.stringify(value));
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const revisionConflict = proof => proof?.operation.state === "rejected" && proof.resultStatus === 409
  && ["conflict", "stale_state_revision"].includes(proof.rejectionCode);
const revisionConflictChain = (action, records, outcomes) => {
  const visited = new Set();
  while (action && !visited.has(action.operationId)) {
    visited.add(action.operationId);
    const proof = outcomes.find(value => value.operation.id === action.operationId);
    if (revisionConflict(proof)) return true;
    if (proof?.operation.state !== "rejected" || proof.resultStatus !== 409 || proof.rejectionCode !== "dependency_rejected") return false;
    action = records.get(action.body.causal.baseOperationId)?.action;
  }
  return false;
};
const blocked = (code, message) => Object.assign(new Error(message), {
  code, isPersonalSaveBlocked: true, isOperationReceiptError: true
});
const preflight = (action, snapshot) => {
  try { assertListOperationPayload(action); }
  catch (error) {
    if (!error.isOperationPreflightError) throw error;
    throw Object.assign(blocked(error.code, error.message), { unconfirmedMemoryDraft: snapshot,
      payloadBytes: error.payloadBytes, maxPayloadBytes: error.maxPayloadBytes });
  }
};

// Each action has its own immutable storage key: two tabs cannot overwrite one
// another's intent. A concurrent fork is retained and blocked, never date-sorted.
export function createPersonalSaveOutbox({ storage, actorId, listId, scopeKey,
  environmentId = environment } = {}) {
  if (environmentId !== environment || !validId(actorId) || !validId(listId) || !validId(scopeKey)) {
    throw blocked("scope", "Не определён личный список для сохранения.");
  }
  const binding = { environment, actorId, listId, scopeKey };
  const keyPrefix = `${prefix}${encodeURIComponent(JSON.stringify(binding))}:`;
  let initialMergeBase = null;
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
          snapshot: decodePersonalSnapshot(record.action?.body?.payload, record.snapshotPatch),
          ...(record.mergeBase ? { mergeBase: record.mergeBase } : {}),
          ...(record.localReconciliation ? { localReconciliation: record.localReconciliation } : {}),
          ...(record.reconciliation ? { reconciliation: record.reconciliation } : {}) };
        const action = record?.action;
        if (record?.version !== 1 || !action || !uuid(action.operationId)
          || key !== keyPrefix + action.operationId
          || Object.keys(binding).some(field => action[field] !== binding[field])
          || action.kind !== "list.create" && !updateKind(action.kind)
          || !record.snapshot || typeof record.snapshot !== "object"
          || !action.body?.payload || action.body.causal?.reads?.length !== 0
          || !Array.isArray(action.body.causal?.dependsOn)
          || !Number.isSafeInteger(action.generation) || action.generation < 1) throw Error("Invalid record");
        if (record.mergeBase && (!record.mergeBase.payload || !Number.isSafeInteger(record.mergeBase.stateRevision)
          || record.mergeBase.stateRevision < 1 || !updateKind(action.kind))) throw Error("Invalid merge base");
        if (action.kind === "list.restore") personalHistoryRestoreManifest(action.body.historyRestore);
        if (record.reconciliation && !action.previousLocalOperationId) throw Error("Reconciliation without predecessor");
        if (record.localReconciliation && (record.localReconciliation.version !== 1
          || !uuid(record.localReconciliation.targetOperationId)
          || record.localReconciliation.targetOperationId !== (action.previousLocalOperationId || action.body.causal.baseOperationId)
          || record.localReconciliation.sourceOperationId !== null && !uuid(record.localReconciliation.sourceOperationId))) {
          throw Error("Invalid local draft reconciliation");
        }
        records.set(action.operationId, record);
      }
      const parents = new Set();
      if (anchor?.confirmation) {
        const action = records.get(anchor.operationId)?.action;
        if (!action || !validHistoricalProof(anchor.confirmation, action)
          || applied.has(anchor.operationId) && applied.get(anchor.operationId).stateRevision !== anchor.stateRevision) throw Error("Invalid settled baseline confirmation");
        if (!applied.has(anchor.operationId)) applied.set(anchor.operationId, {
          version: 1, operationId: anchor.operationId, stateRevision: anchor.stateRevision, inline: true
        });
      }
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
          if (record.reconciliation) {
            const settled = record.reconciliation.settled;
            const ancestors = [...records.values()].filter(entry => entry.action.generation < action.generation)
              .sort((a, b) => a.action.generation - b.action.generation);
            if (!parent || parent.generation + 1 !== action.generation || action.kind !== "list.update"
              || action.body.causal.baseOperationId || action.body.causal.dependsOn.length
              || record.reconciliation.version !== 1 || !record.mergeBase
              || record.mergeBase.stateRevision !== action.body.baseStateRevision
              || !Array.isArray(settled) || settled.length !== ancestors.length || !settled.length
              || settled.some((proof, index) => !validHistoricalProof(proof, ancestors[index].action))
              || settled.at(-1).operation.id !== parentId
              || (record.reconciliation.decision ? !validPersonalRestoreCancellation(record) : !revisionConflictChain(parent, records, settled))) throw Error("Invalid reconciled successor");
            parents.add(parentId);
            continue;
          }
          if (!parent || !updateKind(action.kind) || parent.generation + 1 !== action.generation
            || anchor?.operationId !== parentId || !anchor.baseline
            || action.body.baseStateRevision !== anchor.baseline.stateRevision
            || action.body.causal.baseOperationId || action.body.causal.dependsOn.length) throw Error("Invalid baseline successor");
          parents.add(parentId);
          continue;
        }
        if (!parent || !updateKind(action.kind) || parent.generation + 1 !== action.generation
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
  const firstObserved = read();
  const editorPayload = ({ head, anchor }) => head && anchor?.operationId === head.action.operationId && anchor.baseline
    ? anchor.baseline.payload : head?.action.body.payload || null;
  let observed = observation(firstObserved), observedPayload = clone(editorPayload(firstObserved)), staleCapture = null;
  const observe = value => { observed = observation(value); observedPayload = clone(editorPayload(value)); };
  const assertObserved = () => {
    const result = read();
    if (observation(result) !== observed) {
      throw blocked("stale-tab", "Другая вкладка изменила список. Сначала загрузите её версию; текущая отправка остановлена.");
    }
    return result;
  };
  const guardEditor = (getContext, head) => {
    const initial = clone(getContext());
    const valid = value => value?.scope === "personal" && Object.keys(binding).every(key => value?.[key] === binding[key]);
    const assertCurrent = () => {
      const current = getContext();
      if (!valid(initial) || !valid(current) || current.generation !== initial.generation
        || assertObserved().head?.action.operationId !== head?.action.operationId) {
        throw blocked("context", "Локальная версия изменилась. Сверка прежней очереди остановлена.");
      }
    };
    assertCurrent();
    return assertCurrent;
  };
  function validHistoricalProof(proof, action) { return proof?.historicalOnly === true
    && proof.operation?.id === action.operationId && proof.operation.kind === action.kind
    && Object.keys(binding).filter(key => key !== "scopeKey").every(key => proof.operation[key] === binding[key])
    && /^[0-9a-f]{64}$/.test(proof.operation.payloadDigest)
    && (proof.operation.state === "committed" ? proof.resultStatus >= 200 && proof.resultStatus < 300
      : proof.operation.state === "rejected" && [400, 403, 404, 409, 413, 422].includes(proof.resultStatus)); }
  const settle = async ({ queue, getContext }, terminalizeRejectedDependencies = false) => {
    const { records, head } = assertObserved();
    const assertCurrent = guardEditor(getContext, head), outcomes = [];
    for (const { action } of [...records.values()].sort((a, b) => a.action.generation - b.action.generation)) {
      assertCurrent();
      const input = operationRequest(action);
      let proof;
      try { proof = await queue.inspect(input); }
      catch (error) {
        assertCurrent();
        const parentId = action.body.causal.baseOperationId, parent = records.get(parentId)?.action;
        const parentProof = outcomes.find(value => value.operation.id === parentId);
        if (!terminalizeRejectedDependencies || !error.isOperationReceiptError || typeof queue.settleRejectedDependency !== "function"
          || !parent || parentProof?.operation.state !== "rejected") throw error;
        proof = await queue.settleRejectedDependency({ ...input, predecessor: operationRequest(parent) });
      }
      assertCurrent();
      if (!validHistoricalProof(proof, action)) {
        throw blocked("receipt", "Не удалось подтвердить точные действия очереди.");
      }
      outcomes.push(clone(proof));
    }
    return { historicalOnly: true, headOperationId: head?.action.operationId || null, outcomes };
  };
  const inspect = options => settle(options); // Public inspection is always GET-only.
  return {
    binding: clone(binding),
    supportsCommittedBaseline: true,
    supportsConflictChoices: true,
    canReconcileStaleCapture: () => Boolean(staleCapture?.base),
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
      if (!head) {
        if (!Number.isSafeInteger(stateRevision) || stateRevision < 1 || !input.payload) throw blocked("baseline", "Не подтверждена исходная серверная версия.");
        // No local operation exists yet. Remember the exact server base seen by
        // this editor; its first mutation persists this base atomically with the
        // new action. A mutable shared mirror is not consulted during rebase.
        initialMergeBase = { payload: input.payload, stateRevision };
        return false;
      }
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
        ...(applied.get(head.action.operationId)?.inline ? { confirmation: anchor.confirmation } : {}),
        retired: [...new Set([...(anchor?.retired || []), ...records.keys()])].filter(id => id !== head.action.operationId) };
      try { publishPersonalCheckpoint(storage, keyPrefix, next); }
      catch { throw blocked("quota", "Не хватило места для серверной версии. Текущая версия не заменена."); }
      retireObservedPersonalCheckpoints(storage, checkpoints, keyPrefix);
      observe({ head, anchor: next });
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
      if (applied.get(operationId).inline) {
        // The atomic baseline already confirms this head. Before converting it
        // to an ordinary checkpoint, durably materialize its conventional marker.
        // A crash/quota here leaves the original atomic certificate authoritative.
        const stateRevision = applied.get(operationId).stateRevision;
        try { storage.setItem(`${keyPrefix}applied:${operationId}:${stateRevision}`, JSON.stringify({ version: 1, operationId, stateRevision })); }
        catch { return { removed: 0, pending: true }; }
        assertObserved();
      }
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
      observe({ head, anchor: nextAnchor });
      assertObserved();
      return { removed, pending: [...cleanupKeys, ...checkpoints.keys()].some(key => key !== `${keyPrefix}anchor` && storage.getItem(key) !== null) };
    },
    list() { return clone([...read().records.values()]); },
    capture({ snapshot, body, create = false, restore = false, operationId = crypto.randomUUID(), localReconciliation = null }) {
      const input = clone({ snapshot, body });
      let current;
      try { current = assertObserved(); }
      catch (error) {
        // Only a pre-publication stale-editor failure has a resumable memory
        // draft. Quota, corrupt journals and actual stored forks are separate.
        if (error.code === "stale-tab" && !staleCapture && !restore) staleCapture = {
          input, base: clone(observedPayload || initialMergeBase?.payload || null),
          sourceOperationId: JSON.parse(observed).operationId
        };
        throw error;
      }
      const { head, records, anchor, applied } = current;
      if (restore) {
        const manifest = personalHistoryRestoreManifest(input.body?.historyRestore);
        const confirmedRevision = anchor?.baseline?.stateRevision || applied.get(head?.action.operationId)?.stateRevision || initialMergeBase?.stateRevision || input.body.baseStateRevision;
        if (create || localReconciliation || head && !applied.has(head.action.operationId)
          || input.body.baseStateRevision !== manifest.targetStateRevision || confirmedRevision !== manifest.targetStateRevision) {
          throw blocked("restore-base", "Восстановление требует подтверждённой текущей версии списка.");
        }
      } else if (input.body?.historyRestore) throw blocked("input", "Для восстановления нужна отдельная операция.");
      if (!uuid(operationId) || !input.snapshot || typeof input.snapshot !== "object"
        || !input.body?.payload || input.body.causal !== undefined || records.has(operationId)
        || anchor?.retired.includes(operationId) || storage.getItem(keyPrefix + operationId) !== null) {
        throw blocked("input", "Не удалось зарегистрировать действие сохранения.");
      }
      // UI-only changes don't create another business operation. The ordinary
      // local mirror may still persist those UI preferences.
      const baseline = anchor?.operationId === head?.action.operationId ? anchor?.baseline : null;
      if (head && !restore && !localReconciliation && canonicalListOperationJson(baseline?.payload || head.action.body.payload) === canonicalListOperationJson(input.body.payload)) return clone(head);
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
        kind: create ? "list.create" : restore ? "list.restore" : "list.update", body: { ...input.body, ...(create ? { id: listId } : {}), causal } };
      if (localReconciliation && (localReconciliation.version !== 1 || !head
        || localReconciliation.targetOperationId !== head.action.operationId
        || localReconciliation.sourceOperationId !== null && !uuid(localReconciliation.sourceOperationId))) {
        throw blocked("input", "Не подтверждена связь восстановленного черновика с очередью.");
      }
      const mergeBase = create ? null : baseline ? { payload: baseline.payload, stateRevision: baseline.stateRevision }
        : head && applied.has(head.action.operationId) ? { payload: head.action.body.payload, stateRevision: applied.get(head.action.operationId).stateRevision }
          : !head && initialMergeBase?.stateRevision === input.body.baseStateRevision ? initialMergeBase : null;
      const record = { version: 1, snapshot: input.snapshot, action, ...(mergeBase ? { mergeBase: clone(mergeBase) } : {}),
        ...(localReconciliation ? { localReconciliation: clone(localReconciliation) } : {}) };
      preflight(action, input.snapshot);
      try {
        // The recoverable local data AND operation are one atomic setItem.
        // No await, network, mirror update, or older-record deletion precedes it.
        storage.setItem(keyPrefix + operationId, JSON.stringify({ version: 2, action,
          ...(mergeBase ? { mergeBase } : {}),
          ...(localReconciliation ? { localReconciliation } : {}),
          snapshotPatch: encodePersonalSnapshot(action.body.payload, record.snapshot) }));
      } catch {
        throw blocked("quota", "Не хватает места для надёжного сохранения. Изменение не отправлено; не закрывайте вкладку.");
      }
      observe({ head: record, anchor });
      assertObserved(); // Detect a racing writer if it has already completed.
      return clone(record);
    },
    async reconcileStaleCapture({ getContext, makeSnapshot = payload => payload, resolveConflicts } = {}) {
      if (!staleCapture?.base) throw blocked("recovery-base", "Не сохранилась исходная версия черновика. Автоматическое восстановление недоступно.");
      const draft = clone(staleCapture), current = read(), initial = clone(getContext());
      const currentObservation = observation(current), target = current.head;
      const assertCurrent = () => {
        const context = getContext();
        if (initial?.scope !== "personal" || context?.scope !== "personal"
          || Object.keys(binding).some(key => initial?.[key] !== binding[key] || context?.[key] !== binding[key])
          || initial.generation !== context.generation || currentObservation !== observation(read())) {
          throw blocked("context", "Версия другой вкладки или редактор изменились. Повторите сравнение.");
        }
      };
      assertCurrent();
      if (!target || draft.sourceOperationId && !current.records.has(draft.sourceOperationId)
        && !current.anchor?.retired.includes(draft.sourceOperationId)) {
        throw blocked("recovery-base", "Исходное действие черновика не связано с текущей очередью.");
      }
      const remote = clone(editorPayload(current));
      let plan = planPersonalLocalPayloadReconciliation({ base: draft.base, local: draft.input.body.payload, remote });
      if (!plan.blocked && plan.conflicts?.length && typeof resolveConflicts === "function") {
        const choices = await resolveConflicts(clone(plan.conflicts), { localComparison: true });
        assertCurrent();
        if (choices === "cancel" || choices == null) throw blocked("reconciliation-cancelled", "Сравнение отложено. Черновик и очередь сохранены.");
        plan = planPersonalLocalPayloadReconciliation({ base: draft.base, local: draft.input.body.payload, remote, choices });
      }
      if (plan.blocked || plan.conflicts?.length) throw blocked("reconciliation-conflict", "Эти версии требуют выбора или проверки структуры. Черновик сохранён.");
      const payload = clone(plan.payload), snapshot = clone(makeSnapshot(clone(payload), clone(draft.input.snapshot)));
      assertCurrent();
      // Continue the existing local chain; never bypass/retire its unknown
      // operations or claim that this local comparison is a server receipt.
      const latest = createPersonalSaveOutbox({ storage, actorId, listId, scopeKey });
      const baseline = current.anchor?.operationId === target.action.operationId ? current.anchor.baseline : null;
      const body = { ...draft.input.body, payload,
        baseStateRevision: baseline?.stateRevision || target.action.body.baseStateRevision,
        force: false, forceOverwrite: false, fullReplace: false };
      delete body.causal;
      delete body.userCopy; // A comparison is a new action, not another execution of the old copy manifest.
      delete body.userDictionary;
      delete body.userPlacement;
      delete body.historyRestore;
      if (body.userDeletion) {
        body.userDeletion = retainedPersonalDeletionIntent(body.userDeletion, payload);
        if (!body.userDeletion) delete body.userDeletion;
      }
      try {
        return latest.capture({ snapshot, body, localReconciliation: {
          version: 1, sourceOperationId: draft.sourceOperationId, targetOperationId: target.action.operationId
        } });
      } catch (error) {
        // Publication may have succeeded just before another writer/crash was
        // detected. Never offer a fresh-ID recovery attempt in this old editor.
        throw Object.assign(error, { draftPublicationAttempted: true });
      }
    },
    inspect,
    async reconcile({ queue, getContext, readRemote, makeSnapshot = payload => payload, makeBaselineMeta = () => ({}), resolveConflicts, resolveRejectedRestore,
      operationId = crypto.randomUUID() }) {
      const { head, records, applied, anchor } = assertObserved();
      if (!head || applied.has(head.action.operationId)) throw blocked("reconciliation", "Нет отклонённого действия для сверки.");
      const assertCurrent = guardEditor(getContext, head);
      const settled = await settle({ queue, getContext }, true);
      assertCurrent();
      // Unknown/waiting never reach this point. Other business rejections and
      // an already committed-but-stale head need their own recovery decisions.
      const headProof = settled.outcomes.at(-1), alreadyCommitted = headProof?.operation.state === "committed";
      const rejectedRestore = !alreadyCommitted && [...settled.outcomes].reverse().find(proof => proof.operation.kind === "list.restore" && proof.operation.state === "rejected");
      if (rejectedRestore && typeof resolveRejectedRestore !== "function") {
        throw blocked("restore-reconciliation", "Восстановление не применено. Его нельзя автоматически перенести на другую версию списка; требуется новый выбор из истории.");
      }
      if (!alreadyCommitted && !rejectedRestore && !revisionConflictChain(head.action, records, settled.outcomes)) throw blocked("reconciliation", "Сервер не подтвердил конфликт версии этого действия.");
      let base = null;
      // Use the newest actual base of THIS intent chain. In particular, a
      // previously committed edit is not replayed over a later remote edit.
      for (let record = head; record; record = records.get(record.action.body.causal.baseOperationId)) {
        const proof = settled.outcomes.find(entry => entry.operation.id === record.action.operationId);
        if (proof?.operation.state === "committed") {
          base = { payload: record.action.body.payload, stateRevision: proof.stateRevision }; break;
        }
        if (record.mergeBase) { base = record.mergeBase; break; }
      }
      if (!base && !alreadyCommitted && !rejectedRestore) throw blocked("reconciliation", "Не сохранена общая исходная версия. Автоматическое объединение остановлено.");
      const remote = clone(await readRemote());
      assertCurrent();
      if (remote?.id !== listId || remote.ownerId !== actorId || remote.deleted === true
        || !Number.isSafeInteger(remote.stateRevision) || remote.stateRevision < 1
        || settled.outcomes.some(proof => Number.isSafeInteger(proof.stateRevision) && remote.stateRevision < proof.stateRevision)) {
        throw blocked("reconciliation", "Текущая серверная версия или её владелец не подтверждены.");
      }
      if (alreadyCommitted) {
        if (!Number.isSafeInteger(headProof.stateRevision) || headProof.stateRevision < 1
          || remote.stateRevision < Math.max(headProof.stateRevision, anchor?.baseline?.stateRevision || 0)
          || settled.outcomes.some(proof => {
            const action = records.get(proof.operation.id)?.action, parent = action?.body.causal.baseOperationId;
            const parentProof = settled.outcomes.find(value => value.operation.id === parent);
            return proof.operation.state === "committed" && parentProof && parentProof.operation.state !== "committed";
          })) throw blocked("receipt", "Подтверждения очереди противоречат друг другу.");
        const snapshot = clone(makeSnapshot(clone(remote.payload), clone(head.snapshot)));
        const meta = clone(makeBaselineMeta(clone(remote)));
        assertCurrent();
        const baseline = { payload: remote.payload, stateRevision: remote.stateRevision, meta,
          snapshotPatch: encodePersonalSnapshot(remote.payload, snapshot) };
        const checkpoint = { version: 1, operationId: head.action.operationId, generation: head.action.generation,
          stateRevision: headProof.stateRevision, confirmation: headProof, baseline,
          retired: [...new Set([...(anchor?.retired || []), ...records.keys()])].filter(id => id !== head.action.operationId) };
        // ONE atomic record closes the old outcome and owns the new remote
        // snapshot. Writing an applied marker first could recover stale UI data
        // after a crash; this does neither a business write nor intent replay.
        try { publishPersonalCheckpoint(storage, keyPrefix, checkpoint); }
        catch { throw blocked("quota", "Не хватило места для подтверждения и актуальной версии. Локальные данные сохранены."); }
        observe({ head, anchor: checkpoint });
        assertObserved();
        return { adoptedBaseline: true, snapshot, baseline: clone(baseline), historicalConfirmation: clone(headProof),
          serverRecord: remote, action: clone(head.action) };
      }
      let plan, decision = null;
      if (rejectedRestore) {
        if (containsPersonalPhotos(remote.payload) || [...records.values()].some(record => containsPersonalPhotos(record.snapshot) || containsPersonalPhotos(record.action.body.payload))) {
          throw blocked("restore-files", "Сверка восстановления с фото ждёт файлового адаптера. Обе версии сохранены.");
        }
        const restoreRecord = records.get(rejectedRestore.operation.id);
        const choice = await resolveRejectedRestore({ restoreOperationId: rejectedRestore.operation.id,
          historyId: restoreRecord.action.body.historyRestore.historyId, stateRevision: remote.stateRevision,
          discardedOperationCount: settled.outcomes.filter(proof => proof.operation.state === "rejected").length });
        assertCurrent();
        if (choice !== "keep-server") throw blocked("reconciliation-cancelled", "Выбор отложен. Восстановление и последующие локальные изменения сохранены, сервер не перезаписан.");
        decision = { version: 1, type: "keep-server-after-rejected-restore", restoreOperationId: rejectedRestore.operation.id, stateRevision: remote.stateRevision };
        plan = { payload: remote.payload, conflicts: [] };
      } else plan = planPersonalPayloadReconciliation({ base, local: head.action.body.payload, remote });
      if (!plan.blocked && plan.conflicts?.length && typeof resolveConflicts === "function") {
        // The dialog gets copies, never mutable authority over the frozen
        // comparison or journal. A changed editor/account invalidates a choice.
        const choices = await resolveConflicts(clone(plan.conflicts), { stateRevision: remote.stateRevision });
        assertCurrent();
        if (choices === "cancel" || choices == null) throw blocked("reconciliation-cancelled", "Выбор отложен. Обе версии сохранены; сервер не перезаписан.");
        plan = planPersonalPayloadReconciliation({ base, local: head.action.body.payload, remote, choices });
      }
      if (plan.blocked || plan.conflicts?.length) {
        throw Object.assign(blocked("reconciliation-conflict", plan.conflicts?.length
          ? "Одни и те же данные изменены по-разному. Локальная версия сохранена, серверная не перезаписана."
          : "Эти изменения требуют отдельной проверки. Автоматическое объединение остановлено."), { conflicts: plan.conflicts || [], reason: plan.blocked });
      }
      const payload = clone(plan.payload), snapshot = clone(makeSnapshot(clone(payload), clone(head.snapshot)));
      assertCurrent();
      if (!uuid(operationId) || storage.getItem(keyPrefix + operationId) !== null || anchor?.retired.includes(operationId)
        || !snapshot || typeof snapshot !== "object") throw blocked("input", "Не удалось зарегистрировать объединённое действие.");
      const action = { ...head.action, operationId, generation: head.action.generation + 1,
        previousLocalOperationId: head.action.operationId, kind: "list.update",
        body: { ...head.action.body, payload, baseStateRevision: remote.stateRevision,
          stateRevision: remote.stateRevision, baseServerUpdatedAt: remote.updatedAt || null,
          force: false, forceOverwrite: false, fullReplace: false,
          causal: { dependsOn: [], reads: [] } } };
      // No force/delete override from a previous full save is inherited.
      delete action.body.userDeletion;
      delete action.body.userCopy;
      delete action.body.userDictionary;
      delete action.body.userPlacement;
      delete action.body.historyRestore;
      const mergeBase = { payload: remote.payload, stateRevision: remote.stateRevision };
      const reconciliation = { version: 1, settled: settled.outcomes, ...(decision ? { decision } : {}) };
      const record = { version: 1, action, snapshot, mergeBase, reconciliation };
      preflight(action, snapshot);
      try {
        storage.setItem(keyPrefix + operationId, JSON.stringify({ version: 2, action, mergeBase, reconciliation,
          snapshotPatch: encodePersonalSnapshot(payload, snapshot) }));
      } catch { throw Object.assign(blocked("quota", "Не хватает места для объединённого действия. Прежние версии сохранены."), { unconfirmedMemoryDraft: snapshot }); }
      observe({ head: record, anchor });
      assertObserved();
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
      const root = chain.at(-1);
      if (root.reconciliation) {
        // A local checkpoint is not a replacement for exact server evidence.
        // Recheck the old terminal operations after a crash/reload too. No old
        // rejected operation is dispatched again, and no historical UI applies.
        for (const proof of root.reconciliation.settled) {
          const prior = records.get(proof.operation.id);
          if (!prior) {
            // Only compaction of this already applied reconciliation can have
            // retired those exact ancestors. Its own receipt still needs GET.
            const current = assertObserved();
            if (current.anchor?.operationId === root.action.operationId && current.applied.has(root.action.operationId)
              && current.anchor.retired.includes(proof.operation.id)) continue;
            throw blocked("receipt", "Не найдены исходные действия объединения.");
          }
          const actual = await queue.inspect(operationRequest(prior.action));
          assertContext();
          if (canonicalListOperationJson(actual) !== canonicalListOperationJson(proof)) throw blocked("receipt", "Подтверждение исходного действия изменилось.");
        }
      }
      let result;
      for (const record of chain.reverse()) {
        assertContext();
        const action = record.action;
        // Receipt-only settlement allows a historical predecessor to finish
        // without installing its payload as current UI state.
        result = await queue.run({ ...operationRequest(action), receiptOnly: true });
        assertContext();
      }
      // Re-read the last receipt with the queue's server-freshness guard before
      // allowing the UI to mark this exact local generation synchronized.
      const last = head.action;
      result = await queue.run(operationRequest(last));
      assertContext();
      onConfirmed(result, clone(head));
      return result;
    }
  };
}
