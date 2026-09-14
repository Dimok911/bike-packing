import { canonicalListOperationJson as canonical } from "./list-operation-queue.js";
import { hasLegacyPersonalPhotos, isOrdinaryLegacyPersonalUpdate } from "./personal-confirmed-photos.js";

export const PERSONAL_LIST_OPERATION_PREPARATION_ENABLED = false;
export const PERSONAL_LIST_OPERATION_PREPARATION_CAPABILITY = "personalListOperationPreparationV1";
const environment = "bike-packing-experiment";
const plain = value => value && typeof value === "object" && !Array.isArray(value);
const clone = value => JSON.parse(canonical(value));
const blocked = id => Object.assign(new Error("Подтверждение сохранённого действия пока не получено. Исходный номер и данные сохранены на устройстве."),
  { code: "operation-preparation", isPersonalSaveBlocked: true, isOperationReceiptError: true, isAmbiguousMutation: true, uncertainWriteId: id });

export function isPersonalListOperationPreparation(expected) {
  const body = expected?.body, causal = body?.causal;
  return expected?.kind === "list.update" && isOrdinaryLegacyPersonalUpdate(body) && plain(body.payload)
    && (!Object.hasOwn(body, "fullReplace") || body.fullReplace === false)
    && Number.isSafeInteger(body.baseStateRevision) && body.baseStateRevision > 0
    && plain(causal) && Object.keys(causal).every(key => ["dependsOn", "reads"].includes(key))
    && Array.isArray(causal.dependsOn) && causal.dependsOn.length === 0 && Array.isArray(causal.reads) && causal.reads.length === 0;
}

export function validatePreparedPersonalListOperation(data, expected) {
  const operation = data?.operation, waiting = data?.waiting;
  return isPersonalListOperationPreparation(expected) && data?.ok === true && data.result === null
    && operation?.state === "waiting" && operation.id === expected.operationId && operation.environment === environment
    && operation.actorId === expected.actorId && operation.kind === expected.kind && operation.listId === expected.listId
    && operation.payloadDigest === expected.payloadDigest && plain(waiting)
    && Object.keys(waiting).length === 3 && waiting.code === "owner_update_prepared" && waiting.retrySameOperation === true
    && Array.isArray(waiting.operationIds) && waiting.operationIds.length === 0;
}

export function isUnknownPersonalListOperation(data, expected) {
  const operation = data?.operation;
  return data?.ok === true && operation?.state === "unknown" && operation.id === expected.operationId
    && (data.result === undefined || data.result === null)
    && ["actorId", "kind", "listId", "payloadDigest"].every(key => operation[key] === undefined || operation[key] === expected[key])
    && (operation.environment === undefined || operation.environment === environment);
}

// This endpoint reserves the exact original action without executing it. An
// unknown result alone never permits replay: a fresh GET must expose the actual
// durable preparation. No local journal/body/receipt is manufactured here.
export async function preparePersonalListOperationRetry({ entry, known, enabled = false, getContext, getEntry, read, request, assertContext }) {
  const expected = clone(entry.recovery), operationId = entry.id, initial = clone(getContext()), journal = canonical(getEntry(operationId));
  const assertCurrent = () => {
    const checked = assertContext();
    if (checked === false || checked?.then) throw blocked(operationId);
    const context = getContext(), current = getEntry(operationId);
    if (!enabled || initial.scope !== "personal" || initial.scopeKey !== `id:${expected.actorId}` || initial.actorId !== expected.actorId
      || initial.environment !== environment || initial.listId !== expected.listId || !initial.generation || context?.then
      || canonical(context) !== canonical(initial) || canonical(current) !== journal || current?.confirmed
      || current?.recovery?.type !== "list" || current.recovery.protocol !== "causal-v1" || current.recovery.cancellationOnly
      || current.id !== operationId || expected.operationId !== operationId || current.recovery.actorId !== expected.actorId
      || current.recovery.listId !== expected.listId || current.recovery.kind !== expected.kind
      || current.recovery.payloadDigest !== expected.payloadDigest || canonical(current.recovery.body) !== canonical(expected.body)
      || !isPersonalListOperationPreparation(expected)) throw blocked(operationId);
  };
  const beforeDispatch = async () => {
    assertCurrent(); const me = await read("/auth/me"); assertCurrent();
    if (String(me?.user?.id || "") !== expected.actorId) throw blocked(operationId);
    const capabilities = await read("/bike-packing/capabilities"); assertCurrent();
    const required = ["personalListCausalOperationsV1", PERSONAL_LIST_OPERATION_PREPARATION_CAPABILITY,
      ...(hasLegacyPersonalPhotos(expected.body.payload) ? ["personalLegacyPhotoPreservationV1"] : [])];
    if (!required.every(value => capabilities?.capabilities?.includes(value))) throw blocked(operationId);
  };
  assertCurrent();
  if (!isUnknownPersonalListOperation(known, expected) && !validatePreparedPersonalListOperation(known, expected)) throw blocked(operationId);
  await beforeDispatch(); assertCurrent();
  if (isUnknownPersonalListOperation(known, expected)) {
    // A lost prepare ACK is resolved only by the durable GET below. A denied
    // prepare cannot turn unknown into a replay permission either.
    let refusal = null;
    try { const response = await request(`/bike-packing/list-operations/${encodeURIComponent(operationId)}/prepare`, {
      operationId, expectedActorId: expected.actorId, environment, kind: expected.kind, listId: expected.listId, body: expected.body });
      refusal = personalListOperationAccessMessage(response); }
    catch { /* Fetch/ACK failure: inspect the same UUID, never replay blindly. */ }
    assertCurrent();
    known = await read(`/bike-packing/list-operations/${encodeURIComponent(operationId)}`); assertCurrent();
    if (refusal && isUnknownPersonalListOperation(known, expected)) throw Object.assign(blocked(operationId), { message: refusal });
  }
  return Object.freeze({ data: clone(known), assertCurrent, beforeDispatch });
}

export function personalListOperationAccessMessage(response) {
  return response?.status === 403 && response.data?.ok === false && response.data.code === "personal_owner_only"
    ? "Сервер не разрешил сохранение этого списка. Проверьте вход в аккаунт владельца. Изменения и исходное действие сохранены на устройстве; результат ещё требует подтверждения."
    : null;
}
