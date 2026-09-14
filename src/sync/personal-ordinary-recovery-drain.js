import { canonicalListOperationJson as canonical } from "./list-operation-queue.js";

const paused = message => Object.assign(new Error(message), { isOperationReceiptError: true, code: "ordinary-recovery-pending" });

// The outbox owns the durable choice, exact cancellations, archive and new CAS
// action. This adapter only connects that protocol to an explicit UI decision.
export async function drainPersonalSaveWithOrdinaryRecovery({ enabled = false, outbox, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, chooseServer, onReconciled, drain }) {
  const resume = async () => {
    if (!enabled) throw paused("Выбор серверной версии сохранён. Завершение восстановления пока недоступно; старые действия не отправлены.");
    const initial = canonical(getContext());
    const result = await outbox.recoverOrdinaryWithServer({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta });
    // The outbox publishes a successor during this await. Preserve its durable
    // result, but never apply it after the original editor/account has changed.
    if (canonical(getContext()) !== initial) {
      throw paused("Аккаунт или местные изменения изменились. Выбор версии остановлен, данные сохранены.");
    }
    const applied = onReconciled(result);
    if (applied && typeof applied.then === "function") {
      Promise.resolve(applied).catch(() => {});
      throw Error("Recovery UI application must be synchronous");
    }
    return drain();
  };
  if (outbox.ordinaryRecoveryState?.().pending) return resume();
  try { return await drain(); }
  catch (error) {
    if (!enabled || !error.isOperationReceiptError || ["reconciliation-cancelled", "context", "recovery-state"].includes(error.code)
      || !outbox.ordinaryRecoveryState?.().eligible) throw error;
    const initial = canonical(getContext()), initialRecords = canonical(outbox.list());
    const assertCurrent = () => {
      if (canonical(getContext()) !== initial || canonical(outbox.list()) !== initialRecords) {
        throw paused("Аккаунт или местные изменения изменились. Выбор версии остановлен, данные сохранены.");
      }
    };
    let remote;
    try { remote = await readRemote(); }
    catch { assertCurrent(); throw error; }
    assertCurrent();
    const context = getContext(), records = outbox.list();
    const bases = records.map(record => record.action.body.baseStateRevision);
    if (remote?.id !== context.listId || remote.ownerId !== context.actorId || remote.deleted === true
      || !Number.isSafeInteger(remote.stateRevision) || !bases.length
      || bases.some(value => !Number.isSafeInteger(value) || value < 1)
      || remote.stateRevision <= Math.min(...bases)) throw error;
    if (typeof chooseServer !== "function") {
      throw Object.assign(paused("Серверная версия новее, местные изменения ждут сверки. Нажмите «Разобрать изменения», чтобы выбрать дальнейшее действие."),
        { recoveryReviewNeeded: true });
    }
    const review = JSON.parse(canonical(outbox.ordinaryRecoveryReview()));
    assertCurrent();
    // The validated outbox head, not array order or a guessed original action,
    // supplies the saved side. This comparison is display-only and cannot
    // authorize a merge, cancellation or replacement of either version.
    const saved = review.records.find(record => record.action?.operationId === review.headOperationId);
    const comparison = saved?.action.kind === "list.update" && saved.action.body?.payload && remote.payload
      ? JSON.parse(canonical({ local: saved.action.body.payload, remote: remote.payload, serverRevision: remote.stateRevision })) : null;
    const choice = await chooseServer({ actionCount: outbox.ordinaryRecoveryState().actionCount,
      records: review.records, confirmedOperationIds: review.confirmedOperationIds,
      comparison,
      failure: { code: error.code, reason: error.reason, hasConflicts: Boolean(error.conflicts?.length) },
      getRecoveryCopy: () => { assertCurrent(); return outbox.ordinaryRecoveryCopy(); } });
    assertCurrent();
    if (choice !== "server") throw Object.assign(paused("Выбор отложен. Местные изменения и очередь сохранены на этом устройстве."),
      { recoveryReviewNeeded: true });
    // This synchronous publication includes the recovery copy and is reread
    // before any cancellation can be sent. A quota failure preserves the queue.
    outbox.prepareOrdinaryRecoveryArchive({ getContext });
    return resume();
  }
}
