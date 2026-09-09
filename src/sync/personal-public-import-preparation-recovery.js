import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_IMPORT_ENABLED } from "./personal-public-import-protocol.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";
import { preparePersonalPublicImport } from "./personal-public-import.js";
import { recoverPersonalPublicImportLink } from "./personal-public-import-link-recovery.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Подготовленная копия требует проверки. Исходный выбор, фотографии и номера копий сохранены."),
  { code: "public-preparation-recovery", isPersonalSaveBlocked: true }); };

// A selection-only record is a pending action too. Its absence from the native
// file inventory must not let another save silently overtake its frozen target.
export function personalPublicPendingPreparations(entries, outbox) {
  const records = outbox.list(), receipts = outbox.photoRecoveryReferences().photoReceipts;
  return entries.filter(entry => !entry.completion
    && !records.some(record => record.action.operationId === entry.selection.operationId)
    && !receipts.some(proof => proof.operation.id === entry.selection.operationId));
}

// Explicit continuation only. Read the immutable journal, use retained native
// bytes when present, otherwise fetch the original selected file URLs. A saved
// action can never be replaced by a newly downloaded version of a photo.
export async function recoverPersonalPublicImportPreparation({ entry, selectionStore, outbox, store, getContext, makeSnapshot, loadFile,
  enabled = PERSONAL_PUBLIC_IMPORT_ENABLED, publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED }) {
  if (!enabled || !entry?.selection || entry.selection.version === 2 && !publicEntityEnabled || entry.completion
    || !selectionStore || !outbox || !store || typeof makeSnapshot !== "function") fail();
  entry = structuredClone(entry);
  const initial = structuredClone(getContext()), binding = outbox.binding, { selection } = entry;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || !initial.generation || !same(initial, getContext())
      || !same(binding, store.binding) || !same(binding, selectionStore.binding) || !same(binding, selection.binding)
      || Object.keys(binding).some(key => initial[key] !== binding[key]) || outbox.hasPending()) fail();
    const base = outbox.confirmedBase();
    if (base && (base.stateRevision !== selection.baseStateRevision || !same(base.payload, selection.basePayload))) fail();
  };
  assertCurrent();
  const pending = personalPublicPendingPreparations(await selectionStore.entries(), outbox); assertCurrent();
  if (pending.length !== 1 || !same(pending[0], entry)) fail();
  const saved = await store.read(selection.operationId); assertCurrent();
  if (saved && (!entry.action || !same(saved.action, entry.action))) fail();
  if (entry.action && (saved || entry.action.body.publicImport.files.length === 0)) {
    return recoverPersonalPublicImportLink({ entry, outbox, store, getContext, makeSnapshot, enabled, publicEntityEnabled });
  }
  if (!outbox.confirmedBase()) {
    if (outbox.recover()) fail();
    outbox.adoptRemoteBaseline({ snapshot: selection.basePayload, payload: selection.basePayload, stateRevision: selection.baseStateRevision });
  }
  const commit = await preparePersonalPublicImport({ selection, selectionStore, outbox, store,
    getContext,
    getState: () => structuredClone(selection.basePayload), getRevision: () => selection.baseStateRevision,
    makeSnapshot(...args) { assertCurrent(); return makeSnapshot(...args); },
    async loadFile(input) { assertCurrent(); const file = await loadFile(input); assertCurrent(); return file; },
    onCaptured() {}, enabled, publicEntityEnabled });
  assertCurrent(); return commit();
}
