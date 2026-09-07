import { PERSONAL_PHOTO_FORM_ENABLED } from "./personal-photo-form-protocol.js";
import { inspectPersonalPhotoRecovery } from "./personal-photo-recovery-inventory.js";
import { canonicalListOperationJson } from "./list-operation-queue.js";

const blocked = () => Object.assign(new Error("Сохранение формы с фото пока не подтверждено. Поля, файлы и исходная очередь сохранены."),
  { code: "photo-form-drain", isPersonalSaveBlocked: true });

// Writer/recovery continuation for an ALREADY linked immutable form. It does
// not capture current UI state, create a new action, rebase a conflict, delete
// bytes or install a historical receipt's payload. All once-only staging and
// route barriers remain owned by the established staging client and queue.
export async function drainPersonalPhotoForm({ outbox, store, staging, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, onAdopted, enabled = PERSONAL_PHOTO_FORM_ENABLED }) {
  if (!enabled || !outbox || !store || !staging || !queue || typeof onAdopted !== "function") throw blocked();
  const head = outbox.recover(), initial = { ...getContext?.() }, binding = outbox.binding;
  if (head?.action.kind !== "photos.mutate" || head.action.body.action !== "form" || !outbox.hasPending()) throw blocked();
  const assertCurrent = () => {
    const context = getContext?.();
    if (!initial.generation || initial.scope !== "personal" || !binding || binding.environment !== "bike-packing-experiment"
      || binding.scopeKey !== `id:${binding.actorId}` || Object.keys(binding).some(key => initial[key] !== binding[key])
      || canonicalListOperationJson(context) !== canonicalListOperationJson(initial)
      || outbox.recover()?.action.operationId !== head.action.operationId) throw blocked();
  };
  assertCurrent();
  const inventory = await inspectPersonalPhotoRecovery({ outbox, store, getContext }); assertCurrent();
  if (!inventory.entries.some(entry => entry.operationId === head.action.operationId && entry.state === "linked")
    || inventory.entries.some(entry => entry.state !== "settled-retained"
      && (entry.state !== "linked" || entry.operationId !== head.action.operationId))) throw blocked();
  let proof;
  try {
    proof = await queue.inspect({ path: `/bike-packing/lists/${encodeURIComponent(binding.listId)}/photos/mutate`,
      method: "POST", operationId: head.action.operationId, body: JSON.stringify(head.action.body) });
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
}
