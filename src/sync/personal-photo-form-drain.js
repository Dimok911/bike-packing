import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";
import { PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, personalPendingPhotoOwnerDeletionForm } from "./personal-pending-photo-owner-deletion.js";
import { PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, personalPendingPhotoCopyDeletionForm } from "./personal-pending-photo-copy-deletion.js";

const blocked = () => Object.assign(new Error("Сохранение формы с фото пока не подтверждено. Поля, файлы и исходная очередь сохранены."),
  { code: "photo-form-drain", isPersonalSaveBlocked: true });

// Writer/recovery continuation for an ALREADY linked immutable form. It does
// not capture current UI state, create a new action, rebase a conflict, delete
// bytes or install a historical receipt's payload. All once-only staging and
// route barriers remain owned by the established staging client and queue.
export async function drainPersonalPhotoForm({ outbox, store, staging, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, onAdopted, enabled = PERSONAL_PHOTO_FORM_ENABLED,
  pendingOwnerDeletionEnabled = PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED,
  pendingCopyDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED }) {
  if (!enabled || !outbox || !store || !staging || !queue || typeof onAdopted !== "function") throw blocked();
  const head = outbox.recover(), initial = { ...getContext?.() }, binding = outbox.binding;
  const form = head?.action.kind === "photos.mutate" && head.action.body.action === "form" ? head
    : pendingOwnerDeletionEnabled && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId })
      || pendingCopyDeletionEnabled && personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId });
  if (!form || !outbox.hasPending()) throw blocked();
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
    if (!inventory.entries.some(entry => entry.operationId === form.action.operationId && ["linked", "settled-retained"].includes(entry.state))
      || inventory.entries.some(entry => entry.state !== "settled-retained"
        && (entry.state !== "linked" || entry.operationId !== form.action.operationId))) throw blocked();
    let proof;
    try {
      proof = await queue.inspect({ path: `/bike-packing/lists/${encodeURIComponent(binding.listId)}${head.action.kind === "photos.mutate" ? "/photos/mutate" : ""}`,
        method: head.action.kind === "photos.mutate" ? "POST" : "PUT", operationId: head.action.operationId, body: JSON.stringify(head.action.body) });
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
    const result = onAdopted(record);
    if (result?.then) throw blocked();
    return { adopted: true, fileRetained: true, operationId: head.action.operationId };
  } catch (error) {
    const context = getContext?.(), latest = outbox.recover();
    // A user may durably delete this owner while a file/receipt read is in
    // flight. That old worker must stop without blocking the new exact chain.
    // It never adopts the old form or retries it under a fresh identifier.
    const continuation = form.action.body.copySource
      ? pendingCopyDeletionEnabled && personalPendingPhotoCopyDeletionForm({ records: outbox.list(), operationId: latest?.action.operationId, listId: binding.listId })
      : pendingOwnerDeletionEnabled && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(), operationId: latest?.action.operationId, listId: binding.listId });
    if (["context", "photo-form-drain", "photo-recovery-changed"].includes(error.code)
      && context?.scope === "personal" && Object.keys(binding).every(key => context[key] === binding[key])
      && latest?.action.operationId !== head.action.operationId
      && continuation?.action.operationId === form.action.operationId) {
      throw Object.assign(Error("Сохранено удаление владельца. Продолжение использует новую подтверждённую локальную цепочку."), { code: "photo-form-superseded" });
    }
    throw error;
  }
}
