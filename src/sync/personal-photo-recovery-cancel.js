import { PERSONAL_PHOTO_ACTIONS_ENABLED } from "./personal-photo-action-store.js";
import { PERSONAL_PHOTO_OUTBOX_ENABLED } from "./personal-photo-outbox-record.js";
import { PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED } from "./personal-photo-publication-protocol.js";
import { createPersonalPhotoStaging, PERSONAL_PHOTO_STAGING_ENABLED, PERSONAL_PHOTO_CANCELLATION_ENABLED } from "./personal-photo-staging.js";
import { createListOperationQueue, LIST_OPERATION_QUEUE_ENABLED } from "./list-operation-queue.js";
import { validPersonalPhotoCancellation } from "./personal-photo-cancellation.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { checkPersonalPhotoRecoveryResult } from "./personal-photo-recovery-check.js";

export const personalPhotoRecoveryCancellationEnabled = () => PERSONAL_PHOTO_ACTIONS_ENABLED && PERSONAL_PHOTO_OUTBOX_ENABLED
  && PERSONAL_PHOTO_PUBLICATION_QUEUE_ENABLED && PERSONAL_PHOTO_STAGING_ENABLED && PERSONAL_PHOTO_CANCELLATION_ENABLED && LIST_OPERATION_QUEUE_ENABLED;
export const personalPhotoRecoveryCancellationHead = record => record?.action?.kind === "photos.mutate" && record.action.body?.action === "attach"
  || validPersonalPhotoCancellation(record);

// Explicitly stopping an upload and keeping the current server version are
// separate decisions. This controller never sends file bytes. The original
// stage/owner IDs stay fixed; only an explicit keep-current choice may create
// a new list CAS action, whose own outcome must be confirmed too.
export async function cancelPersonalPhotoRecovery({ outbox, store, transport, getContext, readRemote, makeSnapshot, makeBaselineMeta,
  chooseCurrent, fetchImpl, locks = globalThis.navigator?.locks, enabled = personalPhotoRecoveryCancellationEnabled() }) {
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
    if (!personalPhotoRecoveryCancellationHead(head)) throw Error("Это составное действие требует отдельного восстановления. Исходные данные сохранены.");
    const queue = createListOperationQueue({ transport, getContext, fetchImpl, locks, enabled: true, photoEnabled: true });
    const photoStaging = createPersonalPhotoStaging({ store, transport, getContext, fetchImpl, locks, enabled: true, cancellationEnabled: true });
    if (head.action.kind === "photos.mutate") {
      const cancelled = await outbox.cancelPhotoUpload({ queue, getContext, photoStore: store, photoStaging }); assertContext();
      if (cancelled.alreadyPublished) return checkPersonalPhotoRecoveryResult(common);
    }
    let reconciled;
    try {
      reconciled = await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta,
        resolveRejectedPhoto: async details => { assertContext(); const choice = await chooseCurrent(details); assertContext(); return choice; } });
    } catch (error) {
      // A decision saved before reload still owns its exact ID/body. Its first
      // dispatch or waiting-receipt resume belongs to the existing queue, not
      // a new keep-current decision or a replacement photo upload.
      if (!validPersonalPhotoCancellation(head) || !error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
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
