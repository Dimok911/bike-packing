import { canonicalListOperationJson as canonical } from "./list-operation-queue.js";

// Reconciliation is not a transport retry. Every new action is published by
// the outbox only after exact old receipts and a fresh three-way comparison.
export async function drainPersonalSaveWithReconciliation({ outbox, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, resolveConflicts, resolveRejectedRestore, resolveRejectedShare, onReconciled, onAdopted, onConfirmed,
  prepareBeforeDrain = null, beforeDrain = () => {}, maxReconciliations = 2 }) {
  for (let attempt = 0; ; attempt++) {
    // Read-only preparation may obtain a missing server baseline. The final
    // synchronous guard still binds that evidence to the current editor and
    // immutable queue, including after a newly reconciled successor.
    if (prepareBeforeDrain) await prepareBeforeDrain();
    // Revalidate the current durable chain after reconciliation as well. A
    // freshly merged successor must not inherit permission from its old body.
    const checked = beforeDrain();
    if (checked?.then) throw Error("Dispatch preflight must be synchronous");
    try { return await outbox.drain({ queue, getContext, onConfirmed }); }
    catch (error) {
      if (attempt >= maxReconciliations || !error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
      const initial = canonical(getContext());
      const record = await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta, resolveConflicts, resolveRejectedRestore, resolveRejectedShare });
      // The outbox owns the durable publication. Its completed phase cannot
      // authorize applying a snapshot after the awaited caller context changed.
      if (canonical(getContext()) !== initial) {
        throw Object.assign(new Error("Аккаунт или местные изменения изменились. Результат сохранён в очереди, применение остановлено."),
          { isOperationReceiptError: true, isPersonalSaveBlocked: true, code: "context" });
      }
      if (record.adoptedBaseline) {
        if (typeof onAdopted !== "function") throw Error("Current-state adoption callback is required");
        return onAdopted(record); // Read/adoption, not another write or old ACK apply.
      }
      // Synchronous: durable candidate first, visible state second, dispatch
      // last. A crash here recovers that exact candidate and operation ID.
      onReconciled(record);
    }
  }
}
