import { PERSONAL_PENDING_GUEST_UPDATE_ENABLED, personalPendingGuestUpdateSource } from "./personal-pending-guest-update.js";
import { PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED } from "./personal-archive-photo-protocol.js";
import { PERSONAL_GUEST_IMPORT_ENABLED } from "./personal-guest-import-protocol.js";
import { PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED, personalPendingArchiveUpdateSource } from "./personal-pending-archive-update.js";
import { validPersonalRestoreCancellation } from "./personal-restore-cancellation.js";
import { PERSONAL_PHOTO_ACTIONS_ENABLED } from "./personal-photo-action-store.js";
import { PERSONAL_PHOTO_OUTBOX_ENABLED } from "./personal-photo-outbox-record.js";
import { PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED } from "./personal-photo-publication-protocol.js";
import { createPersonalPhotoStaging, PERSONAL_PHOTO_STAGING_ENABLED, PERSONAL_PHOTO_CANCELLATION_ENABLED } from "./personal-photo-staging.js";
import { createListOperationQueue, LIST_OPERATION_QUEUE_ENABLED, LIST_OPERATION_CANCELLATION_ENABLED } from "./list-operation-queue.js";
import { validPersonalPhotoCancellation } from "./personal-photo-cancellation.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { checkPersonalPhotoRecoveryResult } from "./personal-photo-recovery-check.js";
import { PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED } from "./personal-photo-batch-cancellation.js";
import { PERSONAL_PHOTO_FORM_ENABLED, PERSONAL_PHOTO_EDIT_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { PERSONAL_PHOTO_COPY_FORM_ENABLED } from "./personal-photo-copy-source.js";
import { PERSONAL_PHOTO_COPY_BATCH_ENABLED } from "./personal-photo-copy-batch-protocol.js";
import { PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED, personalPendingPhotoCopyDeletionForm } from "./personal-pending-photo-copy-deletion.js";
import { PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED, personalPendingPhotoOwnerDeletionForm } from "./personal-pending-photo-owner-deletion.js";

export const personalPhotoRecoveryCancellationEnabled = () => PERSONAL_PHOTO_ACTIONS_ENABLED && PERSONAL_PHOTO_OUTBOX_ENABLED
  && PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED && PERSONAL_PHOTO_STAGING_ENABLED && PERSONAL_PHOTO_CANCELLATION_ENABLED && LIST_OPERATION_QUEUE_ENABLED;
const pendingCopyForCancellation = (record, records, copyBatchEnabled, pendingCopyBatchDeletionEnabled) => {
  const form = personalPendingPhotoCopyDeletionForm({ records, operationId: record?.action.operationId, listId: record?.action.listId });
  return form && (form.action.body.action !== "copy-batch" || copyBatchEnabled && pendingCopyBatchDeletionEnabled) ? form : null;
};
export const personalPhotoRecoveryCancellationHead = (record, { batchEnabled = PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED,
  formEnabled = PERSONAL_PHOTO_FORM_ENABLED, editEnabled = PERSONAL_PHOTO_EDIT_FORM_ENABLED, copyEnabled = PERSONAL_PHOTO_COPY_FORM_ENABLED,
  copyBatchEnabled = PERSONAL_PHOTO_COPY_BATCH_ENABLED, archiveEnabled = PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED,
  guestEnabled = PERSONAL_GUEST_IMPORT_ENABLED,
  pendingArchiveUpdateEnabled = PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED,
  pendingGuestUpdateEnabled = PERSONAL_PENDING_GUEST_UPDATE_ENABLED,
  pendingCopyBatchDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED,
  pendingOwnerDeletionEnabled = PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED,
  pendingCopyDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED, records = [] } = {}) =>
  record?.action?.kind === "photos.mutate" && (record.action.body?.action !== "form" || formEnabled)
    && (record.action.body?.action === "attach" || batchEnabled && (record.photoState?.fileInventoryVersion === 2
      || copyBatchEnabled && copyEnabled && formEnabled && record.action.body?.action === "copy-batch" && record.photoState?.fileIntentHash === null
      || (record.action.body?.copySource ? copyEnabled : editEnabled) && record.action.body?.action === "form" && record.photoState?.fileIntentHash === null))
  || record?.action?.kind === "list.import" && (guestEnabled && record.action.body.guestImport?.version === 1
    || archiveEnabled && record.action.body.archiveImport?.version === 2)
    && batchEnabled && (record.photoState?.fileInventoryVersion === 2 || record.photoState?.fileIntentHash === null)
  || (archiveEnabled || guestEnabled) && record?.reconciliation?.decision?.type === "keep-server-after-rejected-import" && validPersonalRestoreCancellation(record)
  || validPersonalPhotoCancellation(record)
  || pendingGuestUpdateEnabled && guestEnabled && batchEnabled && Boolean(personalPendingGuestUpdateSource({ records,
    operationId: record?.action.operationId, listId: record?.action.listId }))
  || pendingArchiveUpdateEnabled && archiveEnabled && batchEnabled && Boolean(personalPendingArchiveUpdateSource({ records,
    operationId: record?.action.operationId, listId: record?.action.listId }))
  || pendingOwnerDeletionEnabled && batchEnabled && formEnabled && Boolean(personalPendingPhotoOwnerDeletionForm({ records,
    operationId: record?.action.operationId, listId: record?.action.listId }))
  || pendingCopyDeletionEnabled && copyEnabled && batchEnabled && formEnabled
    && Boolean(pendingCopyForCancellation(record, records, copyBatchEnabled, pendingCopyBatchDeletionEnabled));

// Explicitly stopping an upload and keeping the current server version are
// separate decisions. This controller never sends file bytes. The original
// stage/owner IDs stay fixed; only an explicit keep-current choice may create
// a new list CAS action, whose own outcome must be confirmed too.
export async function cancelPersonalPhotoRecovery({ outbox, store, transport, getContext, readRemote, makeSnapshot, makeBaselineMeta,
  chooseCurrent, fetchImpl, locks = globalThis.navigator?.locks, enabled = personalPhotoRecoveryCancellationEnabled(),
  operationCancellationEnabled = LIST_OPERATION_CANCELLATION_ENABLED,
  batchEnabled = PERSONAL_PHOTO_BATCH_CANCELLATION_ENABLED, formEnabled = PERSONAL_PHOTO_FORM_ENABLED,
  editEnabled = PERSONAL_PHOTO_EDIT_FORM_ENABLED, copyEnabled = PERSONAL_PHOTO_COPY_FORM_ENABLED,
  copyBatchEnabled = PERSONAL_PHOTO_COPY_BATCH_ENABLED, archiveEnabled = PERSONAL_ARCHIVE_PHOTO_IMPORT_ENABLED,
  guestEnabled = PERSONAL_GUEST_IMPORT_ENABLED,
  pendingArchiveUpdateEnabled = PERSONAL_PENDING_ARCHIVE_UPDATE_ENABLED,
  pendingGuestUpdateEnabled = PERSONAL_PENDING_GUEST_UPDATE_ENABLED,
  pendingCopyBatchDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED,
  pendingOwnerDeletionEnabled = PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED,
  pendingCopyDeletionEnabled = PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED }) {
  if (!enabled || !locks?.request || typeof chooseCurrent !== "function") throw Error("Явная отмена фотодействий ещё не включена.");
  const binding = outbox.binding, initial = { ...getContext() };
  const assertContext = () => {
    const current = getContext();
    if (initial.scope !== "personal" || current.scope !== "personal" || initial.generation !== current.generation
      || Object.keys(binding).some(key => initial[key] !== binding[key] || current[key] !== binding[key])) throw Error("Редактор изменился. Отмена остановлена; данные сохранены.");
  };
  assertContext();
  return locks.request(`bike-packing-photo-recovery-decision:${JSON.stringify(binding)}`, async () => {
    assertContext();
    const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertContext();
    if (inventory.entries.some(entry => !["linked", "settled-retained"].includes(entry.state))) throw Error("Файл не связан с точным действием очереди. Автоматическая отмена недоступна.");
    const common = { outbox, store, transport, getContext, readRemote, makeSnapshot, makeBaselineMeta, fetchImpl, locks };
    if (inventory.entries.every(entry => entry.state === "settled-retained")) return checkPersonalPhotoRecoveryResult(common);
    const head = outbox.recover();
    const pendingForm = pendingOwnerDeletionEnabled && personalPendingPhotoOwnerDeletionForm({ records: outbox.list(),
      operationId: head?.action.operationId, listId: binding.listId })
      || pendingCopyDeletionEnabled && copyEnabled && pendingCopyForCancellation(head, outbox.list(), copyBatchEnabled, pendingCopyBatchDeletionEnabled)
      || pendingGuestUpdateEnabled && guestEnabled && personalPendingGuestUpdateSource({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId })
      || pendingArchiveUpdateEnabled && archiveEnabled && personalPendingArchiveUpdateSource({ records: outbox.list(), operationId: head?.action.operationId, listId: binding.listId });
    if (!personalPhotoRecoveryCancellationHead(head, { batchEnabled, formEnabled, editEnabled, copyEnabled, copyBatchEnabled, archiveEnabled, guestEnabled, pendingArchiveUpdateEnabled, pendingGuestUpdateEnabled, pendingOwnerDeletionEnabled, pendingCopyDeletionEnabled, pendingCopyBatchDeletionEnabled,
      records: outbox.list() })) throw Error("Это составное действие требует отдельного восстановления. Исходные данные сохранены.");
    const queue = createListOperationQueue({ transport, getContext, fetchImpl, locks, enabled: true, photoEnabled: true,
      photoFormEnabled: formEnabled, photoCopyEnabled: copyEnabled, photoCopyBatchEnabled: copyBatchEnabled, pendingPhotoCopyDeletionEnabled: pendingCopyDeletionEnabled,
      pendingPhotoCopyBatchDeletionEnabled: pendingCopyBatchDeletionEnabled,
      archiveImportEnabled: archiveEnabled, archivePhotoImportEnabled: archiveEnabled,
      guestImportEnabled: guestEnabled,
      pendingArchiveUpdateEnabled, pendingGuestUpdateEnabled,
      cancellationEnabled: operationCancellationEnabled });
    const photoStaging = createPersonalPhotoStaging({ store, transport, getContext, fetchImpl, locks, enabled: true, cancellationEnabled: true, batchEnabled, formEnabled, archiveEnabled, guestEnabled });
    if (head.photoState || pendingForm) {
      const cancelled = await outbox.cancelPhotoUpload({ queue, getContext, photoStore: store, photoStaging }); assertContext();
      if (cancelled.alreadyPublished) return checkPersonalPhotoRecoveryResult(common);
    }
    let reconciled;
    try {
      reconciled = await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta,
        resolveRejectedPhoto: async details => { assertContext(); const choice = await chooseCurrent(details); assertContext(); return choice; },
        resolveRejectedRestore: async details => { assertContext(); const choice = await chooseCurrent({ ...details, photoOperationId: details.restoreOperationId }); assertContext(); return choice; } });
    } catch (error) {
      // A decision saved before reload still owns its exact ID/body. Its first
      // dispatch or waiting-receipt resume belongs to the existing queue, not
      // a new keep-current decision or a replacement photo upload.
      if (!(validPersonalPhotoCancellation(head) || (archiveEnabled || guestEnabled) && validPersonalRestoreCancellation(head)) || !error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
    }
    assertContext();
    if (!reconciled?.adoptedBaseline) {
      try { await outbox.drain({ queue, getContext, photoStore: store, photoStaging }); }
      catch (error) {
        // The final receipt may be committed but superseded by a newer server
        // state. GET-only recovery decides; unknown/rejected never unlocks.
        if (!error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
      }
      assertContext();
    }
    return checkPersonalPhotoRecoveryResult(common);
  });
}
