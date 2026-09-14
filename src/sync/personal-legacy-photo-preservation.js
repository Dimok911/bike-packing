import { canonicalListOperationJson } from "./list-operation-queue.js";
import { hasLegacyPersonalPhotos, isOrdinaryLegacyPersonalUpdate, preservesConfirmedPersonalPhotoChain } from "./personal-confirmed-photos.js";

export { hasLegacyPersonalPhotos, isPreservedLegacyPersonalPhoto, isOrdinaryLegacyPersonalUpdate } from "./personal-confirmed-photos.js";
export const PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED = false;
export const PERSONAL_LEGACY_PHOTO_PRESERVATION_CAPABILITY = "personalLegacyPhotoPreservationV1";
const environment = "bike-packing-experiment";
const contextKeys = ["environment", "actorId", "scope", "scopeKey", "listId", "generation"];
const blocked = () => Object.assign(new Error("Старые фотографии ещё не сверены с сервером. Изменения сохранены на устройстве, отправка приостановлена."),
  { code: "legacy-photo-preservation", isPersonalSaveBlocked: true });
const revision = value => Number.isSafeInteger(value) && value > 0;
const digest = async value => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalListOperationJson(value))))]
  .map(byte => byte.toString(16).padStart(2, "0")).join("");
function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

// This helper only reads. In particular the missing first merge base is never
// filled from the browser mirror or written into a persisted action. A current
// server payload at exactly that action's revision is an ephemeral comparison
// base. An authenticated receipt may instead establish a historical boundary;
// it cannot apply its old business snapshot or authorize a replacement action.
export async function preparePersonalLegacyPhotoPreservation({ records, operationId, listId, getContext, getRecords = () => records,
  readRemote, inspectExact, enabled = PERSONAL_LEGACY_PHOTO_PRESERVATION_ENABLED, capabilities = [],
  confirmedBoundary = null, allowOwnerDeletion = false }) {
  const snapshot = freeze(structuredClone(records));
  if (!Array.isArray(snapshot) || !snapshot.length) throw blocked();
  const byId = new Map(snapshot.map(record => [record?.action?.operationId, record]));
  if (byId.has(undefined) || byId.size !== snapshot.length || !byId.has(operationId)) throw blocked();
  const active = [], seen = new Set();
  for (let record = byId.get(operationId); record;) {
    const action = record.action;
    if (seen.has(action.operationId) || action.listId !== listId) throw blocked();
    active.push(record); seen.add(action.operationId);
    if (action.operationId === confirmedBoundary?.operationId) break;
    const parentId = action.body?.causal?.baseOperationId;
    if (parentId && !byId.has(parentId)) throw blocked();
    record = parentId ? byId.get(parentId) : null;
  }
  if (![...active.flatMap(record => [record.mergeBase?.payload, record.action.body?.payload]), confirmedBoundary?.payload]
    .some(hasLegacyPersonalPhotos)) return null;
  const available = Array.isArray(capabilities) ? capabilities : capabilities?.capabilities;
  if (!enabled || !available?.includes(PERSONAL_LEGACY_PHOTO_PRESERVATION_CAPABILITY)) throw blocked();
  const observedContext = getContext();
  const initialContext = Object.fromEntries(contextKeys.map(key => [key, observedContext?.[key]]));
  if (initialContext.environment !== environment || !initialContext.actorId || !initialContext.generation
    || initialContext.scope !== "personal" || initialContext.scopeKey !== `id:${initialContext.actorId}`
    || initialContext.listId !== listId) throw blocked();
  if (active.some(({ action }) => action.kind !== "list.update" || !isOrdinaryLegacyPersonalUpdate(action.body)
    || ["environment", "actorId", "scopeKey"].some(key => Object.hasOwn(action, key) && action[key] !== initialContext[key]))) throw blocked();
  const recordsJson = canonicalListOperationJson(snapshot), contextJson = canonicalListOperationJson(initialContext);
  let stale = false;
  const current = () => {
    try {
      const live = getContext();
      stale ||= canonicalListOperationJson(Object.fromEntries(contextKeys.map(key => [key, live?.[key]]))) !== contextJson
        || canonicalListOperationJson(getRecords()) !== recordsJson;
    } catch { stale = true; }
    return !stale;
  };
  const assertCurrent = () => { if (!current()) throw blocked(); };
  assertCurrent();
  let boundary = confirmedBoundary ? freeze(structuredClone(confirmedBoundary)) : null, initialBase = null, historicalBoundary = null;
  const root = active.at(-1), action = root.action;
  if (!root.mergeBase && action.operationId !== boundary?.operationId) {
    if (action.body.causal?.baseOperationId || !revision(action.body.baseStateRevision) || typeof readRemote !== "function") throw blocked();
    const remote = await readRemote({ listId, baseStateRevision: action.body.baseStateRevision });
    assertCurrent();
    if (!revision(remote?.stateRevision) || !remote.payload) throw blocked();
    if (remote.stateRevision === action.body.baseStateRevision) {
      initialBase = freeze({ operationId: action.operationId, listId, stateRevision: remote.stateRevision, payload: structuredClone(remote.payload) });
    } else {
      if (remote.stateRevision < action.body.baseStateRevision || typeof inspectExact !== "function") throw blocked();
      const proof = await inspectExact(action);
      assertCurrent();
      const expectedDigest = await digest({ environment, actorId: initialContext.actorId, kind: action.kind, listId, body: action.body });
      assertCurrent();
      const op = proof?.operation;
      if (proof?.historicalOnly !== true || op?.id !== action.operationId || op.environment !== environment
        || op.actorId !== initialContext.actorId || op.kind !== "list.update" || op.listId !== listId || op.state !== "committed"
        || op.payloadDigest !== expectedDigest || !Number.isInteger(proof.resultStatus) || proof.resultStatus < 200 || proof.resultStatus >= 300
        || !revision(proof.stateRevision) || proof.stateRevision <= action.body.baseStateRevision || proof.stateRevision > remote.stateRevision) throw blocked();
      historicalBoundary = freeze({ operationId: action.operationId, listId, stateRevision: proof.stateRevision, payload: structuredClone(action.body.payload) });
    }
  }
  const check = () => current() && preservesConfirmedPersonalPhotoChain({ records: snapshot, operationId, listId,
    allowLegacy: true, allowOwnerDeletion, confirmedBoundary: boundary, initialBase, historicalBoundary });
  if (!check()) throw blocked();
  return Object.freeze({ check });
}
