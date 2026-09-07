import { createListOperationQueue } from "./list-operation-queue.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";

// Explicit read-only recovery: not the upload dispatcher or cancellation
// controller. Exact committed receipts + a fresh scoped state may be cached
// atomically. The caller keeps the editing latch until a normal reload.
export async function checkPersonalPhotoRecoveryResult({ outbox, store, transport, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, fetchImpl, locks }) {
  const inspect = () => inspectPersonalPhotoRecovery({ outbox, store, getContext });
  const initial = await inspect();
  if (initial.entries.some(entry => !["linked", "settled-retained"].includes(entry.state))) {
    throw Error("Файлы и очередь требуют отдельной проверки. Данные сохранены; повторная отправка не выполнялась.");
  }
  if (initial.entries.every(entry => entry.state === "settled-retained")) return { verified: true, fileRetained: true, reloadRequired: true };
  const queue = createListOperationQueue({ transport, getContext, fetchImpl, locks, readOnly: true });
  await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta, adoptCommittedOnly: true });
  const final = await inspect();
  if (final.entries.some(entry => entry.state !== "settled-retained")) throw Error("Не все фотодействия подтверждены. Локальные файлы сохранены.");
  return { verified: true, fileRetained: true, reloadRequired: true };
}
