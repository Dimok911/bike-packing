import { canonicalListOperationJson as canonical } from "./list-operation-queue.js";

const plain = value => value && typeof value === "object" && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value > 0;
const stopped = reason => Object.assign(new Error(reason === "changed"
  ? "Список изменился во время проверки. Повторите синхронизацию; местные изменения сохранены."
  : "Не удалось подтвердить владельца и версию списка. Сверка остановлена; местные изменения сохранены."),
{ code: "recovery-state", reason, isPersonalSaveBlocked: true, isOperationReceiptError: true });

// /state contains assembled payload/integrity metadata but no owner identity.
// Both endpoints assemble rows using separate reads. Bracket the state read
// with server-owned metadata at the same monotonic causal revision; a later
// concurrent commit must still lose the ordinary numeric CAS at dispatch.
export async function readPersonalOwnedRecoveryState({ listId, actorId, read, assertCurrent = () => {} }) {
  const current = () => {
    try {
      const result = assertCurrent();
      if (result === false || result?.then) {
        if (result?.then) Promise.resolve(result).catch(() => {});
        throw stopped("context");
      }
    } catch (cause) { throw Object.assign(stopped("context"), { cause }); }
  };
  const get = async path => {
    current();
    let data;
    try { data = await read(path); }
    catch (cause) { current(); throw Object.assign(stopped("read"), { cause }); }
    current();
    return data;
  };
  if (typeof listId !== "string" || !listId || typeof actorId !== "string" || !actorId || typeof read !== "function") {
    throw stopped("context");
  }
  const detail = data => {
    const value = data?.list;
    if (data?.ok !== true || !plain(value) || value.id !== listId || value.ownerId !== actorId
      || value.deleted === true || !revision(value.stateRevision)) throw stopped("identity");
    return value;
  };
  const path = `/bike-packing/lists/${encodeURIComponent(listId)}`;
  const before = detail(await get(path));
  const state = await get(`${path}/state`);
  if (state?.ok !== true || state.listId !== listId || !plain(state.record)
    || !revision(state.stateRevision) || state.record.stateRevision !== state.stateRevision
    || state.stateRevision !== before.stateRevision || !plain(state.payload) || !plain(state.state)
    || !plain(state.record.payload)) throw stopped("state");
  try {
    if (canonical(state.payload) !== canonical(state.state) || canonical(state.payload) !== canonical(state.record.payload)) {
      throw stopped("state");
    }
  } catch (cause) { throw Object.assign(stopped("state"), { cause }); }
  const after = detail(await get(path));
  if (!["id", "ownerId", "stateRevision", "role", "sourceType", "visibility", "updatedAt", "deleted"]
    .every(key => before[key] === after[key])) throw stopped("changed");
  current();
  // Identity comes only from the matching authenticated server reads. Keep
  // the middle response's payload and integrity fields; never use a detail
  // payload that may have been assembled after its metadata was captured.
  return { ...state, record: { ...state.record, id: after.id, ownerId: after.ownerId,
    role: after.role, sourceType: after.sourceType, visibility: after.visibility } };
}
