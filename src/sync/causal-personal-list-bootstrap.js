import { canonicalListOperationJson } from "./list-operation-queue.js";
import { createPersonalSaveOutbox, recoverPersonalSaveListId } from "./personal-save-outbox.js";

const environment = "bike-packing-experiment";
const paused = message => Object.assign(new Error(message), { isPersonalSaveBlocked: true, isOperationReceiptError: true });

// Concurrent first-time creation on different devices targets the same object.
// The server's transactional head lock permits only one create for that ID.
export async function initialPersonalListId(actorId) {
  const bytes = new TextEncoder().encode(JSON.stringify([environment, "initial-personal-list-v1", actorId]));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `personal-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

// Registers a creation; dispatch belongs to the ordinary outbox scheduler.
// There is deliberately no POST, fallback, or implicit rebase in this resolver.
export async function ensureCausalPersonalListId({ storage, getContext, getCurrentListId,
  snapshot, body, fetchLists, chooseDefaultList, recordId, onExisting, onRegistered,
  locks = globalThis.navigator?.locks }) {
  const input = JSON.parse(JSON.stringify({ snapshot, body })); // before any await
  const initial = { ...getContext() };
  const assertContext = () => {
    const current = getContext();
    if (initial.environment !== environment || !initial.actorId || initial.scopeKey !== `id:${initial.actorId}`
      || initial.scope !== "personal" || !initial.generation
      || ["environment", "actorId", "scopeKey", "scope", "generation"].some(key => current?.[key] !== initial[key])) {
      throw paused("Аккаунт или локальная версия изменились. Создание списка приостановлено.");
    }
  };
  assertContext();
  const currentId = getCurrentListId();
  if (currentId) return currentId;
  if (!locks?.request) throw paused("Блокировка между вкладками недоступна. Новый список не создан.");
  const recoverId = () => recoverPersonalSaveListId({ storage, actorId: initial.actorId, scopeKey: initial.scopeKey });
  const observedId = recoverId();
  return locks.request(`bike-packing-personal-bootstrap-v1:${initial.actorId}`, async () => {
    assertContext();
    const recoveredId = recoverId();
    if (recoveredId !== observedId || getCurrentListId()) {
      throw paused("Другая вкладка уже выбрала или создала список. Сначала загрузите её сохранённую версию.");
    }
    if (recoveredId) {
      const outbox = createPersonalSaveOutbox({ storage, actorId: initial.actorId, scopeKey: initial.scopeKey, listId: recoveredId });
      if (canonicalListOperationJson(outbox.recover().action.body.payload) !== canonicalListOperationJson(input.body.payload)) {
        throw paused("Найдено незавершённое сохранение. Сначала восстановите его локальную версию.");
      }
      onRegistered(recoveredId);
      return recoveredId;
    }
    const lists = await fetchLists();
    assertContext();
    if (!Array.isArray(lists)) throw paused("Сервер не подтвердил список личных данных. Новое создание остановлено.");
    const existing = chooseDefaultList(lists);
    if (existing) {
      if (!recordId(existing)) throw paused("Сервер вернул список без номера. Создание остановлено.");
      onExisting(existing);
      // A list summary is not an editor baseline. Loading it must happen before
      // capturing a new action, not silently overwriting it with a local draft.
      throw paused("Найден существующий личный список. Сначала загрузите его с сервера; локальная версия не отправлена.");
    }
    const listId = await initialPersonalListId(initial.actorId);
    assertContext();
    if (recoverId() || getCurrentListId()) throw paused("Список изменился во время подготовки. Создание остановлено.");
    const outbox = createPersonalSaveOutbox({ storage, actorId: initial.actorId, scopeKey: initial.scopeKey, listId });
    outbox.capture({ ...input, create: true }); // snapshot + UUID + ID: one durable write
    onRegistered(listId); // preference is a recoverable mirror, never the authority
    return listId;
  });
}
