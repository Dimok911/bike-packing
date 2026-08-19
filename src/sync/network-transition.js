export const DEFAULT_NETWORK_OFFLINE_DELAY_MS = 4000;

export function createNetworkTransitionController({
  offlineDelayMs = DEFAULT_NETWORK_OFFLINE_DELAY_MS,
  onOffline = () => {},
  onOnline = () => {},
  setTimer = (callback, delay) => globalThis.setTimeout(callback, delay),
  clearTimer = (timer) => globalThis.clearTimeout(timer)
} = {}) {
  let offlineTimer = null;

  const cancelPendingOffline = () => {
    if (offlineTimer === null) return false;
    clearTimer(offlineTimer);
    offlineTimer = null;
    return true;
  };

  const reportOffline = () => {
    if (offlineTimer !== null) return false;
    offlineTimer = setTimer(() => {
      offlineTimer = null;
      onOffline();
    }, Math.max(0, Number(offlineDelayMs) || 0));
    return true;
  };

  const reportOnline = () => {
    const canceledPendingOffline = cancelPendingOffline();
    onOnline({ canceledPendingOffline });
    return canceledPendingOffline;
  };

  return {
    cancel: cancelPendingOffline,
    hasPendingOffline: () => offlineTimer !== null,
    reportOffline,
    reportOnline
  };
}
