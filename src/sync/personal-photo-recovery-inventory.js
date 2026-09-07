import { canonicalListOperationJson } from "./list-operation-queue.js";
import { assertPersonalPhotoFile } from "./personal-photo-outbox-record.js";

const same = (a, b) => canonicalListOperationJson(a) === canonicalListOperationJson(b);
const paused = (code, cause) => Object.assign(new Error("Файлы и очередь требуют проверки. Ничего не удалено и не отправлено."),
  { code, cause, isPersonalPhotoRecoveryBlocked: true });

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
    entries.push({ operationId, stageOperationId: file.stage.operationId, intentHash: file.intentHash,
      state, dispatchAllowed: false, entityType: file.stage.entityType, entityId: file.stage.entityId, photoId: file.stage.photoId });
  }
  for (const [operationId, record] of byId) {
    if (!ids.includes(operationId)) entries.push({ operationId, stageOperationId: record.action.body.assetId, state: "missing-file", dispatchAllowed: false });
  }
  const afterIds = await store.ids(); assertContext();
  // Sorting compares SETS for a stable scan; it never orders user actions.
  if (!same([...ids].sort(), [...afterIds].sort()) || !same(references, outbox.photoRecoveryReferences())) throw paused("photo-recovery-changed");
  return { version: 1, binding, readOnly: true, entries,
    needsRecovery: entries.some(entry => entry.state !== "linked"), automaticDispatchAllowed: false };
}
