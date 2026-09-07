import { canonicalListOperationJson } from "./list-operation-queue.js";

// Preparing a preview is read-only. Executing it requires a separate rollout.
export const PERSONAL_LIST_MIGRATION_ENABLED = false;
export const PERSONAL_LIST_MIGRATION_CAPABILITY = "personalListInitialMigrationV1";
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const exactKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const photos = value => value && typeof value === "object" && Object.entries(value)
  .some(([key, child]) => key === "photos" && Array.isArray(child) && child.length > 0 || photos(child));
const sha = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalListOperationJson(value))))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");

export function personalListMigrationBody(body, { causal = false } = {}) {
  const manifest = body?.migration;
  if (!exactKeys(body, ["baseStateRevision", "payload", "migration", ...(causal ? ["causal"] : [])])
    || !Number.isSafeInteger(body.baseStateRevision) || body.baseStateRevision < 1
    || !plain(body.payload) || photos(body.payload)
    || !exactKeys(manifest, ["version", "legacyPayloadHash", "projectedPayloadHash"]) || manifest.version !== 1
    || ![manifest.legacyPayloadHash, manifest.projectedPayloadHash].every(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))
    || causal && canonicalListOperationJson(body.causal) !== canonicalListOperationJson({ dependsOn: [], reads: [] })) {
    throw Error("Не подтверждён точный снимок подготовки старого списка.");
  }
  return clone(body);
}

export function validatePersonalListMigrationResult(result, expected) {
  try {
    const body = personalListMigrationBody(expected.body, { causal: true });
    return result?.ok === true && result.list?.id === expected.listId
      && Number.isSafeInteger(result.list.stateRevision) && result.list.stateRevision > body.baseStateRevision
      && canonicalListOperationJson(result.migration) === canonicalListOperationJson(body.migration)
      && canonicalListOperationJson(result.list.payload) === canonicalListOperationJson(body.payload);
  } catch { return false; }
}

export async function assertPersonalListMigrationHash(body) {
  personalListMigrationBody(body, { causal: true });
  if (await sha(body.payload) !== body.migration.projectedPayloadHash) throw Error("Подготовленные данные изменились. Отправка остановлена.");
}

// One immutable candidate, confirmed once. No state adoption, local mirror or
// server write precedes the atomic snapshot+action capture in the personal outbox.
export async function preparePersonalListMigration({ outbox, getContext, getState, hasLocalChanges,
  readPreview, makeSnapshot, onCaptured, operationId = crypto.randomUUID() }) {
  if (typeof hasLocalChanges !== "function" || typeof onCaptured !== "function") throw Error("Не подключена проверка локальных изменений.");
  const initial = clone(getContext()), previous = clone(getState());
  const assertCurrent = () => {
    const current = getContext();
    if (!initial.actorId || !initial.listId || !initial.generation || initial.scope !== "personal"
      || initial.environment !== "bike-packing-experiment" || initial.scopeKey !== `id:${initial.actorId}`
      || Object.keys(initial).some(key => initial[key] !== current?.[key])
      || ["actorId", "listId", "scopeKey", "environment"].some(key => outbox.binding[key] !== initial[key])
      || canonicalListOperationJson(previous) !== canonicalListOperationJson(getState())) {
      throw Error("Аккаунт или локальные данные изменились. Повторите подготовку списка.");
    }
    if (hasLocalChanges() || outbox.recover() || outbox.hasPending()) throw Error("Сначала нужно разобраться с локальными изменениями. Они не будут заменены старым серверным списком.");
  };
  assertCurrent();
  if (photos(previous)) throw Error("Локальная версия содержит фотографии. Сначала требуется проверить её связь со старым списком.");
  const result = clone(await readPreview());
  assertCurrent();
  const body = personalListMigrationBody(result?.migration);
  if (result.ok !== true || ["actorId", "listId", "environment"].some(key => result[key] !== initial[key])
    || await sha(body.payload) !== body.migration.projectedPayloadHash) throw Error("Сервер не подтвердил подготовленный снимок списка.");
  const snapshot = clone(makeSnapshot(clone(body.payload), previous));
  if (!plain(snapshot) || photos(snapshot)) throw Error("Не удалось подготовить локальную версию списка.");
  assertCurrent();
  let used = false;
  return () => {
    if (used) return null;
    assertCurrent();
    used = true;
    const saved = outbox.capture({ snapshot, body, migration: true, operationId });
    onCaptured(saved);
    return saved;
  };
}
