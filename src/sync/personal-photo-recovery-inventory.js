import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFile, assertPersonalPhotoRecord } from "./personal-photo-outbox-record.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const paused = (code, cause) => Object.assign(new Error("Файлы и очередь требуют проверки. Ничего не удалено и не отправлено."),
  { code, cause, isPersonalPhotoRecoveryBlocked: true });

async function exactCachedPhotoReceipt(proof, file, binding) {
  const op = proof?.operation, action = file.action;
  if (proof?.historicalOnly !== true || op?.id !== action.operationId || !["photos.mutate", "list.import"].includes(op.kind) || action.kind !== op.kind
    || action.listId !== binding.listId || Object.keys(binding).filter(key => key !== "scopeKey").some(key => op[key] !== binding[key])
    || !["committed", "rejected"].includes(op.state) || !Number.isInteger(proof.resultStatus)
    || (op.state === "committed" ? !(proof.resultStatus >= 200 && proof.resultStatus < 300) || !Number.isSafeInteger(proof.stateRevision) || proof.stateRevision < 1
      : ![400, 403, 404, 409, 413, 422].includes(proof.resultStatus))) return false;
  const expected = canonicalListOperationJson({ environment: binding.environment, actorId: binding.actorId,
    kind: action.kind, listId: binding.listId, body: action.body });
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(expected)))]
    .map(value => value.toString(16).padStart(2, "0")).join("");
  return op.payloadDigest === digest;
}

// Read-only startup/recovery primitive. Presence in IndexedDB is not dispatch
// authority, and even a retired UUID is not itself a remote terminal receipt.
export async function inspectPersonalPhotoRecovery({ outbox, store, getContext }) {
  const initial = { ...getContext?.() }, binding = outbox?.binding;
  const assertContext = () => {
    const current = getContext?.();
    if (!binding || !same(store?.binding, binding) || binding.environment !== "bike-packing-experiment"
      || binding.scopeKey !== `id:${binding.actorId}` || !initial.generation || current?.generation !== initial.generation
      || initial.scope !== "personal" || current?.scope !== "personal"
      || Object.keys(binding).some(key => initial[key] !== binding[key] || current?.[key] !== binding[key])) throw paused("photo-recovery-context");
  };
  assertContext();
  const references = outbox.photoRecoveryReferences();
  if (!same(references.binding, binding)) throw paused("photo-recovery-context");
  const ids = await store.ids(); assertContext();
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length) throw paused("photo-recovery-index");
  const byId = new Map(references.records.map(record => [record.action.operationId, record]));
  const receipts = new Map((references.photoReceipts || []).map(proof => [proof.operation.id, proof]));
  const retired = new Set(references.retiredOperationIds), entries = [];
  for (const operationId of ids) {
    let file;
    try { file = await store.read(operationId); }
    catch (error) { assertContext(); entries.push({ operationId, state: "corrupt-file", reason: error.code || "unreadable", dispatchAllowed: false }); continue; }
    assertContext();
    if (!file || !same(file.binding, binding) || file.action.operationId !== operationId) {
      entries.push({ operationId, state: "corrupt-file", reason: "binding-or-record", dispatchAllowed: false }); continue;
    }
    const record = byId.get(operationId);
    let state = retired.has(operationId) ? "retired-needs-proof" : "unlinked";
    if (record) {
      try { assertPersonalPhotoFile(record, file, binding); state = "linked"; }
      catch { state = "link-mismatch"; }
    }
    const proof = receipts.get(operationId);
    if (proof && ["linked", "retired-needs-proof"].includes(state)) {
      state = await exactCachedPhotoReceipt(proof, file, binding) ? "settled-retained" : "receipt-mismatch";
      assertContext();
    }
    const parts = file.files || [file], first = parts[0].stage;
    entries.push({ operationId, stageOperationId: first.operationId, intentHash: file.intentHash,
      ...(file.files ? { batch: true, stageOperationIds: parts.map(part => part.stage.operationId), photoCount: parts.length } : {}),
      ...(state === "settled-retained" ? { ownerOutcome: proof.operation.state, exactReceiptCached: true } : {}),
      state, dispatchAllowed: false, entityType: first.entityType, entityId: first.entityId, photoId: first.photoId });
  }
  for (const [operationId, record] of byId) {
    if ((["form", "copy-batch"].includes(record.action.body.action) || record.action.kind === "list.import") && record.photoState.fileIntentHash === null) {
      if (ids.includes(operationId)) continue; // Already classified as link-mismatch; never discard unexpected bytes.
      let state = "linked";
      try { assertPersonalPhotoRecord(record); } catch { state = "link-mismatch"; }
      const proof = receipts.get(operationId);
      if (proof && state === "linked") {
        state = await exactCachedPhotoReceipt(proof, record, binding) ? "settled-retained" : "receipt-mismatch";
        assertContext();
      }
      entries.push({ operationId, fileless: true, photoCount: record.action.kind === "list.import" ? 0 : record.action.body.changes.length,
        entityType: record.action.body.entityType, entityId: record.action.body.entityId,
        ...(state === "settled-retained" ? { ownerOutcome: proof.operation.state, exactReceiptCached: true } : {}), state, dispatchAllowed: false });
      continue;
    }
    if (!ids.includes(operationId)) entries.push({ operationId, stageOperationId: record.action.body.assetId,
      ...(record.photoState.fileInventoryVersion === 2 ? { batch: true,
        stageOperationIds: (record.action.kind === "list.import" ? (record.action.body.guestImport || record.action.body.archiveImport).files : record.action.body.changes).map(change => change.assetId) } : {}), state: "missing-file", dispatchAllowed: false });
  }
  const afterIds = await store.ids(); assertContext();
  // Sorting compares SETS for a stable scan; it never orders user actions.
  if (!same([...ids].sort(), [...afterIds].sort()) || !same(references, outbox.photoRecoveryReferences())) throw paused("photo-recovery-changed");
  return { version: 1, binding, readOnly: true, entries,
    needsRecovery: entries.some(entry => !["linked", "settled-retained"].includes(entry.state)), automaticDispatchAllowed: false };
}
