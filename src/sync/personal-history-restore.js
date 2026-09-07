import { canonicalListOperationJson } from "./list-operation-queue.js";

const clone = value => JSON.parse(JSON.stringify(value));
const hashPattern = /^[a-f0-9]{64}$/;
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);
const photos = value => value && typeof value === "object" && Object.entries(value)
  .some(([key, child]) => key === "photos" && Array.isArray(child) && child.length > 0 || photos(child));
const sha = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalListOperationJson(value))))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

export function personalHistoryRestoreManifest(value) {
  if (value?.version !== 1 || !Number.isSafeInteger(value.historyId) || value.historyId < 1
    || !Number.isSafeInteger(value.targetStateRevision) || value.targetStateRevision < 1
    || typeof value.historyPayloadHash !== "string" || !hashPattern.test(value.historyPayloadHash)
    || typeof value.payloadHash !== "string" || !hashPattern.test(value.payloadHash)
    || !Array.isArray(value.layoutIds) || !value.layoutIds.every(validId) || new Set(value.layoutIds).size !== value.layoutIds.length) {
    throw Error("Не подтверждена точная версия восстановления.");
  }
  return clone(value);
}

// Preparation precedes the confirmation dialog. It reads a fixed server
// candidate, never restores locally while waiting or rereads history on retry.
export async function preparePersonalHistoryRestore({ historyId, layoutIds = [], outbox, getContext, getState,
  getRevision, readPreview, makeSnapshot, onCaptured, operationId = crypto.randomUUID() }) {
  const initial = clone(getContext()), previous = clone(getState()), revision = getRevision();
  const assertCurrent = () => {
    const current = getContext();
    if (initial.scope !== "personal" || initial.environment !== "bike-packing-experiment"
      || initial.scopeKey !== `id:${initial.actorId}` || !validId(initial.listId)
      || Object.keys(initial).some(key => initial[key] !== current?.[key]) || getRevision() !== revision
      || ["actorId", "listId", "scopeKey", "environment"].some(key => outbox.binding[key] !== initial[key])) {
      throw Error("Аккаунт или версия списка изменились. Повторите выбор восстановления.");
    }
    if (outbox.hasPending()) throw Error("Сначала подтвердите сохранённые изменения кнопкой синхронизации, затем повторите восстановление.");
  };
  assertCurrent();
  if (!Number.isSafeInteger(historyId) || historyId < 1 || !Array.isArray(layoutIds)
    || !layoutIds.every(validId) || new Set(layoutIds).size !== layoutIds.length) throw Error("Не определена выбранная запись истории.");
  if (photos(previous)) throw Error("Восстановление с фотографиями ждёт подключения файловых действий.");
  const selected = clone(layoutIds), result = clone(await readPreview(historyId, selected));
  assertCurrent();
  const body = result?.restore, manifest = personalHistoryRestoreManifest(body?.historyRestore);
  if (result.ok !== true || ["actorId", "listId", "environment"].some(key => result[key] !== initial[key])
    || body.baseStateRevision !== revision || manifest.targetStateRevision !== revision
    || manifest.historyId !== historyId || canonicalListOperationJson(manifest.layoutIds) !== canonicalListOperationJson(selected)
    || !body.payload || body.causal !== undefined || body.force || body.forceOverwrite || photos(body.payload)
    || await sha(body.payload) !== manifest.payloadHash) throw Error("Подготовленная версия не совпадает с выбранным восстановлением.");
  const snapshot = clone(makeSnapshot(clone(body.payload), previous));
  if (!snapshot || photos(snapshot)) throw Error("Не удалось подготовить локальную версию восстановления.");
  assertCurrent();
  let used = false;
  return () => {
    if (used) return null;
    assertCurrent();
    used = true;
    const record = outbox.capture({ snapshot, body, restore: true, operationId });
    // The exact state and action already survive a crash before UI adoption.
    onCaptured(record);
    return record;
  };
}
