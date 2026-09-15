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
 * Recovery only reads the original operation's receipt. Unknown/timeout/404 cannot
 * authorize resending. Protocol-specific prepared/waiting retries stay in adapters.
 */
export function createConfirmedDelivery({ capture, send, readReceipt, accept,
  onUncertain = () => {}, canReadAfterError = () => true,
  recoveryFailure = (_sendError, readError) => readError }) {
  const recover = async entry => ({ entry, receipt: await accept(entry, await readReceipt(entry)) });

  return {
    recover,
    async deliverNew(intent, { assertReady = () => {} } = {}) {
      const entry = await capture(intent);
      assertReady(entry);
      try {
        return { entry, receipt: await accept(entry, await send(entry)) };
      } catch (error) {
        if (!canReadAfterError(error)) throw error;
        await onUncertain(entry, error);
        try { return await recover(entry); }
        catch (readError) { throw recoveryFailure(error, readError); }
      }
    },
  };
}
