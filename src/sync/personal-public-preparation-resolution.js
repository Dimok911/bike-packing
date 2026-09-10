import { PERSONAL_PUBLIC_IMPORT_ENABLED } from "./personal-public-import-protocol.js";
import { PERSONAL_PUBLIC_ENTITY_COPY_ENABLED } from "./personal-public-entity-plan.js";
import { PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED, assertPublicPreparationReceipt, assertPublicPreparationNativeSettlement } from "./personal-public-preparation-resolution-protocol.js";
import { personalArchiveJson } from "./personal-archive-import-protocol.js";

const same = (a, b) => personalArchiveJson(a) === personalArchiveJson(b);
const fail = () => { throw Object.assign(Error("Результат выбранной подготовки ещё не подтверждён. Исходные записи и файлы сохранены."),
  { code: "public-preparation-resolution", isPersonalSaveBlocked: true }); };

export function personalPublicRecoverablePreparations(entries, outbox, inventory) {
  const records = outbox.list(), receipts = outbox.photoRecoveryReferences().photoReceipts;
  return entries.filter(entry => !entry.retainedAlternative
    && !records.some(record => record.action.operationId === entry.selection.operationId)
    && !receipts.some(proof => proof.operation.id === entry.selection.operationId)
    && (!entry.completion || inventory.entries.some(value => value.operationId === entry.selection.operationId && value.state !== "settled-retained")));
}

// One explicit preparation at a time. Owner cancellation is an exact server
// fence, followed by every retained stage. No bytes, import POST, replacement
// ID, outbox rebase, or business snapshot adoption belongs to this controller.
export function resolvePersonalPublicPreparation(options) {
  return resolvePersonalRemotePreparation(options, { manifestKey: "publicImport", assertReceipt: assertPublicPreparationReceipt,
    assertNativeSettlement: assertPublicPreparationNativeSettlement });
}

export async function resolvePersonalRemotePreparation({ entry, selectionStore, outbox, store, queue, staging, getContext, cancel = false,
  enabled = PERSONAL_PUBLIC_PREPARATION_RESOLUTION_ENABLED, publicEnabled = PERSONAL_PUBLIC_IMPORT_ENABLED,
  publicEntityEnabled = PERSONAL_PUBLIC_ENTITY_COPY_ENABLED }, { manifestKey, assertReceipt, assertNativeSettlement }) {
  if (!entry?.selection || !selectionStore || !outbox || !store || cancel && (!enabled || !publicEnabled
    || entry.selection.version === 2 && !publicEntityEnabled)) fail();
  entry = structuredClone(entry);
  const initial = structuredClone(getContext()), binding = outbox.binding;
  const assertCurrent = () => {
    if (initial.scope !== "personal" || !initial.generation || !same(initial, getContext()) || outbox.hasPending()
      || !same(binding, store.binding) || !same(binding, selectionStore.binding) || !same(binding, entry.selection.binding)
      || Object.keys(binding).some(key => initial[key] !== binding[key])) fail();
  };
  assertCurrent();
  const original = (await selectionStore.entries()).find(value => value.selection.operationId === entry.selection.operationId); assertCurrent();
  if (!original || !same(original, entry) || entry.retainedAlternative) fail();
  const saved = await store.read(entry.selection.operationId); assertCurrent();
  if (saved && (!entry.action || !same(saved.action, entry.action))) fail();
  if (!entry.action) {
    if (!cancel) return { outcome: "not-prepared", fileRetained: true };
    await selectionStore.retainPreparation({ entry, assertCurrent }); assertCurrent();
    return { outcome: "retained", fileRetained: true };
  }
  if (!queue?.inspect) fail();
  const request = { path: `/bike-packing/lists/${encodeURIComponent(binding.listId)}/import`, method: "POST",
    operationId: entry.action.operationId, body: JSON.stringify(entry.action.body) };
  let proof = entry.completion;
  if (!proof) {
    try { proof = await queue.inspect(request); }
    catch (error) { assertCurrent(); if (!error.isOperationReceiptError) throw error; }
    assertCurrent();
  }
  if (!proof && cancel) {
    if (!queue.supportsCancellation?.(request.path, request.method) || !queue.cancelExact) fail();
    proof = await queue.cancelExact(request); assertCurrent();
  }
  if (!proof) return { outcome: "unknown", fileRetained: true };
  await assertReceipt(entry, proof); assertCurrent();
  await selectionStore.confirm({ operationId: entry.action.operationId, proof }); assertCurrent();
  entry.completion = proof;
  if (proof.operation.state === "committed") return { outcome: "committed", fileRetained: true };
  if (saved) {
    const stages = [];
    for (const part of saved.files) {
      let stage;
      try { stage = await (cancel ? staging.cancel : staging.inspect)(entry.action.operationId, part.stage.operationId); }
      catch (error) {
        assertCurrent();
        if (!error.isConfirmedAssetUnavailable || !error.stageReceipt) throw error;
        stage = error.stageReceipt;
      }
      assertCurrent(); stages.push(stage);
    }
    const settlement = assertNativeSettlement(entry, { version: 1, intentHash: saved.intentHash, stages });
    await selectionStore.confirmNativeSettlement({ operationId: entry.action.operationId, settlement }); assertCurrent();
  }
  return { outcome: "rejected", fileRetained: true, nativeMissing: !saved && entry.action.body[manifestKey].files.length > 0 };
}
