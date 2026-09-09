import { PERSONAL_PENDING_GUEST_UPDATE_ENABLED, personalPendingGuestUpdateSource } from "./personal-pending-guest-update.js";
import { PERSONAL_PENDING_FORM_UPDATE_ENABLED, personalPendingFormUpdateSource } from "./personal-pending-form-update.js";
import { PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED } from "./personal-archive-photo-protocol.js";
import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
import { PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED, personalPendingArchiveUpdateSource } from "./personal-pending-archive-update.js";
import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED } from "./personal-photo-form-owner-result.js";
import { personalPendingPhotoFormChain } from "./personal-pending-photo-form-chain.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, personalPendingPhotoOwnerDeletionForm } from "./personal-pending-photo-owner-deletion.js";
import { PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED, personalPendingPhotoCopyDeletionForm } from "./personal-pending-photo-copy-deletion.js";

const blocked = () => Object.assign(new Error("Сохранение формы с фото пока не подтверждено. Поля, файлы и исходная очередь сохранены."),
  { code: "photo-form-drain", isPersonalSaveBlocked: true });

// Writer/recovery continuation for an ALREADY linked immutable form. It does
// not capture current UI state, create a new action, rebase a conflict, delete
// bytes or install a historical receipt's payload. All once-only staging and
// route barriers remain owned by the established staging client and queue.
export async function drainPersonalPhotoForm({ outbox, store, staging, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, onAdopted, beforeAdopted = async () => {}, enabled = PERSONAL_PHOTO_FORM_ENABLED,
  archiveEnabled = PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED,
  guestEnabled = PERSONAL_GUEST_IMPORT_ENABLED,
  pendingArchiveUpdateEnabled = PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED,
  pendingGuestUpdateEnabled = PERSONAL_PENDING_GUEST_UPDATE_ENABLED,
  pendingFormUpdateEnabled = PERSONAL_PENDING_FORM_UPDATE_ENABLED,
  formOwnerResultEnabled = PERSONAL_PHOTO_FORM_OWNER_RESULT_ENABLED,
  pendingOwnerDeletionEnabled = PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED,
  pendingCopyDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED,
  pendingCopyBatchDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED }) {
  if (!enabled || !outbox || !store || !staging || !queue || typeof onAdopted !== "function") throw blocked();
  const head = outbox.recover(), initial = { ...getContext?.() }, binding = outbox.binding;
  const pendingImport = operationId => guestEnabled && pendingGuestUpdateEnabled && personalPendingGuestUpdateSource({ records: outbox.list(), operationId, listId: binding.listId })
    || archiveEnabled && pendingArchiveUpdateEnabled && personalPendingArchiveUpdateSource({ records: outbox.list(), operationId, listId: binding.listId });
  const pendingForm = operationId => pendingFormUpdateEnabled && personalPendingFormUpdateSource({ records: outbox.list(), operationId, listId: binding.listId });
  const form = head?.action.kind === "list.import" && (guestEnabled && head.action.body.guestImport?.version === 1
    || archiveEnabled && head.action.body.archiveImport?.version === 2) ? head : head?.action.kind === "photos.mutate" && ["form", "copy-batch"].includes(head.action.body.action) ? head
    : pendingForm(head?.action.operationId) || pendingImport(head?.action.operationId)
      || pendingOwnerDeletionEnabled && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId })
      || pendingCopyDeletionEnabled && personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId });
  if (!form || !outbox.hasPending()) throw blocked();
  const fileChain = formOwnerResultEnabled ? personalPendingPhotoFormChain({ records: outbox.list(), operationId: head.action.operationId, listId: binding.listId }) : null;
  const expectedForms = fileChain?.forms || [form];
  if (form.action.body.action === "copy-batch" && head.action.operationId !== form.action.operationId && !pendingCopyBatchDeletionEnabled) throw blocked();
  try {
    const assertCurrent = () => {
      const context = getContext?.();
      if (!initial.generation || initial.scope !== "personal" || !binding || binding.environment !== "bike-packing-experiment"
        || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).some(key => initial[key] !== binding[key])
        || canonicalListOperationJson(context) !== canonicalListOperationJson(initial)
        || outbox.recover()?.action.operationId !== head.action.operationId) throw blocked();
    };
    assertCurrent();
    const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
    if (expectedForms.some(form => !inventory.entries.some(entry => entry.operationId === form.action.operationId && ["linked", "settled-retained"].includes(entry.state)))
      || inventory.entries.some(entry => entry.state !== "settled-retained"
        && (entry.state !== "linked" || !expectedForms.some(form => entry.operationId === form.action.operationId)))) throw blocked();
    let proof;
    try {
      proof = await queue.inspect({ path: `/bike-packing/lists/${encodeURIComponent(binding.listId)}${head.action.kind === "list.import" ? "/import" : head.action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
        method: ["photos.mutate", "list.import"].includes(head.action.kind) ? "POST" : "PUT", operationId: head.action.operationId, body: JSON.stringify(head.action.body) });
    } catch (error) { assertCurrent(); if (!error.isOperationReceiptError) throw error; }
    assertCurrent();
    if (proof?.operation.state === "rejected") throw blocked(); // Separate explicit cancellation/choice, never automatic keep-current.
    if (proof?.operation.state !== "committed") {
      try { await outbox.drain({ queue, getContext, photoStore: store, photoStaging: staging }); }
      catch (error) {
        assertCurrent();
        // A lost/stale owner ACK can still be recovered by exact read-only
        // reconciliation below. A file/storage failure cannot advance the owner.
        if (!error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
      }
      assertCurrent();
    }
    const record = await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta, adoptCommittedOnly: true });
    assertCurrent();
    if (record?.adoptedBaseline !== true) throw blocked();
    const final = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
    if (final.entries.some(entry => entry.state !== "settled-retained")) throw blocked();
    await beforeAdopted(record); assertCurrent();
    const result = onAdopted(record);
    if (result?.then) throw blocked();
    return { adopted: true, fileRetained: true, operationId: head.action.operationId };
  } catch (error) {
    const context = getContext?.(), latest = outbox.recover();
    // A user may durably delete this owner while a file/receipt read is in
    // flight. That old worker must stop without blocking the new exact chain.
    // It never adopts the old form or retries it under a fresh identifier.
    const nextFileChain = formOwnerResultEnabled ? personalPendingPhotoFormChain({ records: outbox.list(), operationId: latest?.action.operationId, listId: binding.listId }) : null;
    const continuation = nextFileChain?.forms.some(entry => entry.action.operationId === form.action.operationId) ? form
      : form.action.kind === "list.import"
      ? pendingImport(latest?.action.operationId)
      : form.action.body.copySource || form.action.body.action === "copy-batch" && pendingCopyBatchDeletionEnabled
      ? pendingCopyDeletionEnabled && personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: latest?.action.operationId, listId: binding.listId })
      : pendingForm(latest?.action.operationId) || pendingOwnerDeletionEnabled && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(), operationId: latest?.action.operationId, listId: binding.listId });
    if (["context", "stale-tab", "photo-form-drain", "photo-recovery-changed"].includes(error.code)
      && context?.scope === "personal" && Object.keys(binding).every(key => context[key] === binding[key])
      && latest?.action.operationId !== head.action.operationId
      && continuation?.action.operationId === form.action.operationId) {
      throw Object.assign(Error("Сохранено следующее действие. Продолжение использует новую подтверждённую локальную цепочку."), { code: "photo-form-superseded" });
    }
    throw error;
  }
}
