/**
 * Delivery kernel, independent of an application's commands, wire format and UI.
 *
 * capture must durably record a NEW immutable intent before resolving. The caller
 * holds its queue lock and selects existing intents for recover instead. A failed
 * capture or readiness check never sends. assertReady is deliberately synchronous:
 * there is no asynchronous gap between the final context check and send.
 *
 * accept must validate identity + terminal result and durably record its proof
 * before resolving. Its result is historical evidence, NOT permission to replace
 * the current screen. The application still checks account/generation/freshness.
 *
 * Recovery defaults to read-only. Unknown/timeout/404 cannot authorize resending.
 * prepareRecovery is an optional application adapter: only a freshly checked,
 * server-bound authorization may return beforeDispatch. It must never replace
 * the entry/ID/body. Storage, capability and dependency checks stay in that hook.
 */
export function createConfirmedDelivery({ capture, send, readReceipt, accept,
  onUncertain = () => {}, canReadAfterError = () => true,
  recoveryFailure = (_sendError, readError) => readError }) {
  const readAccepted = async entry => ({ entry, receipt: await accept(entry, await readReceipt(entry)) });
  const dispatchOnce = async (entry, noteFailure) => {
    try { return { entry, receipt: await accept(entry, await send(entry)) }; }
    catch (error) {
      if (!canReadAfterError(error)) throw error;
      if (noteFailure) await onUncertain(entry, error);
      try { return await readAccepted(entry); }
      catch (readError) { throw recoveryFailure(error, readError); }
    }
  };
  const recover = async (entry, { assertCurrent = () => {}, prepareRecovery } = {}) => {
    assertCurrent();
    let receipt = await readReceipt(entry);
    assertCurrent();
    const plan = prepareRecovery ? await prepareRecovery(entry, receipt) : null;
    if (plan) receipt = plan.receipt;
    if (plan?.beforeDispatch) {
      await plan.beforeDispatch();
      assertCurrent(); // No await between this check and the frozen dispatch.
      return dispatchOnce(entry, false);
    }
    return { entry, receipt: await accept(entry, receipt) };
  };

  return {
    recover,
    async deliverNew(intent, { assertReady = () => {} } = {}) {
      const entry = await capture(intent);
      assertReady(entry);
      return dispatchOnce(entry, true);
    },
  };
}
