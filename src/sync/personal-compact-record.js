import { validPersonalItemRename } from "./personal-item-rename.js";
import { encodePersonalSnapshot, decodePersonalSnapshot } from "./personal-snapshot-codec.js";
import { personalBusinessPayloadMatchesConfirmed } from "./personal-confirmed-business-equality.js";

// Storage and delivery have separate gates. The reader remains available with
// the writer OFF so a rollback cannot hide already saved device actions.
export const PERSONAL_COMPACT_CAPTURE_ENABLED = false;
export const PERSONAL_COMPACT_DELIVERY_ENABLED = false;
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const revision = value => Number.isSafeInteger(value) && value > 0;
const uuid = value => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value || "");
const fail = () => { throw Error("Invalid compact personal record"); };

export function compactPersonalPayload(record) {
  return record?.compactState?.payload ?? record?.photoState?.payload ?? record?.action?.body?.payload;
}

export function applyPersonalItemRename(payload, body) {
  if (!plain(payload) || !validPersonalItemRename(body)) fail();
  const item = payload.items?.[body.itemId];
  if (!plain(item) || item.id !== body.itemId || item.name !== body.expectedName) fail();
  const result = clone(payload);
  result.items[body.itemId].name = body.name;
  if (body.itemMeta) Object.assign(result.items[body.itemId], body.itemMeta);
  return result;
}

export function encodeCompactPersonalRecord({ action, source, sourcePayload, snapshot }) {
  const payload = applyPersonalItemRename(sourcePayload, action.body);
  if (action.kind !== "item.rename" || !plain(snapshot)) fail();
  // A command cannot conceal a second business mutation in its local snapshot.
  // Callers supply their normal UI snapshot separately from this payload.
  const snapshotPatch = encodePersonalSnapshot(payload, snapshot);
  return { version: 4, action: clone(action), source: clone(source), snapshotPatch };
}

// resolve() reads the SAME scoped immutable chain, never the mutable UI mirror
// or current server state. A checkpoint may retain the exact source before
// retiring an ancestor. The compact action itself is never rewritten.
export function decodeCompactPersonalRecord(raw, resolve, checkpoint = null) {
  if (!plain(raw) || raw.version !== 4 || Object.keys(raw).some(key =>
    !["version", "action", "source", "snapshotPatch"].includes(key))) fail();
  const action = raw.action, source = raw.source;
  if (action?.kind !== "item.rename" || !uuid(action.operationId) || !validPersonalItemRename(action.body)
    || !plain(source) || !Array.isArray(raw.snapshotPatch)) fail();
  const hasReference = Object.hasOwn(source, "operationId");
  if (Object.keys(source).some(key => ![hasReference ? "operationId" : "payload", "stateRevision"].includes(key))
    || Object.hasOwn(source, "stateRevision") && (!revision(source.stateRevision)
      || source.stateRevision !== action.body.baseStateRevision)) fail();
  let payload;
  if (hasReference) {
    if (!uuid(source.operationId) || source.operationId === action.operationId
      || source.operationId !== (action.previousLocalOperationId || action.body.causal?.baseOperationId)) fail();
    if (checkpoint?.operationId === action.operationId && checkpoint.compactSource) {
      const retained = checkpoint.compactSource;
      if (retained.operationId !== source.operationId || retained.stateRevision !== source.stateRevision
        || !plain(retained.payload)) fail();
      payload = retained.payload;
    } else {
      const parent = resolve(source.operationId);
      if (!parent || parent.action.generation + 1 !== action.generation
        || ["environment", "actorId", "scopeKey", "listId"].some(key => parent.action[key] !== action[key])) fail();
      payload = compactPersonalPayload(parent);
    }
  } else {
    if (!plain(source.payload) || !revision(source.stateRevision)) fail();
    payload = source.payload;
  }
  const projected = applyPersonalItemRename(payload, action.body);
  return { version: 1, action: clone(action), snapshot: decodePersonalSnapshot(projected, raw.snapshotPatch),
    compactState: { version: 1, payload: projected,
      ...(hasReference ? { source: { ...clone(source), payload: clone(payload) } } : {}) },
    ...(source.stateRevision ? { mergeBase: { payload: clone(payload), stateRevision: source.stateRevision } } : {}) };
}

export function retainCompactPersonalSource(checkpoint, record) {
  if (record?.compactState?.source) checkpoint.compactSource = clone(record.compactState.source);
  return checkpoint;
}

// Detect one rename in the business representation produced by the existing
// form. Unrelated edits and file changes fall back to the existing full action.
export function personalCompactRenameCandidate({ base, payload, listId, stateRevision }) {
  if (!plain(base?.items) || !plain(payload?.items) || !revision(stateRevision)) return null;
  const changed = Object.keys(payload.items).filter(id => base.items[id] && base.items[id].name !== payload.items[id].name);
  if (changed.length !== 1) return null;
  const itemId = changed[0], item = payload.items[itemId];
  const itemMeta = Object.fromEntries(["updatedAt", "updatedByDeviceId", "updatedByDeviceName"].filter(key => Object.hasOwn(item, key)).map(key => [key, item[key]]));
  const body = { version: 1, itemId, expectedName: base.items[itemId].name, name: item.name, baseStateRevision: stateRevision,
    ...(Object.keys(itemMeta).length ? { itemMeta } : {}) };
  if (!validPersonalItemRename(body)) return null;
  const projected = applyPersonalItemRename(base, body);
  return personalBusinessPayloadMatchesConfirmed({ confirmedPayload: projected, candidatePayload: payload, listId, allowLegacy: true })
    ? { itemId, name: body.name, ...(body.itemMeta ? { itemMeta: body.itemMeta } : {}) } : null;
}
