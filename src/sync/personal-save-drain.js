// Reconciliation is not a transport retry. Every new action is published by
// the outbox only after exact old receipts and a fresh three-way comparison.
export async function drainPersonalSaveWithReconciliation({ outbox, queue, getContext,
  readRemote, makeSnapshot, makeBaselineMeta, onReconciled, onAdopted, onConfirmed, maxReconciliations = 2 }) {
  for (let attempt = 0; ; attempt++) {
    try { return await outbox.drain({ queue, getContext, onConfirmed }); }
    catch (error) {
      if (attempt >= maxReconciliations || !error.isOperationReceiptError || error.isPersonalSaveBlocked) throw error;
      const record = await outbox.reconcile({ queue, getContext, readRemote, makeSnapshot, makeBaselineMeta });
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
