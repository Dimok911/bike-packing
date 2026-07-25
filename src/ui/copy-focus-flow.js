export const COPY_FOCUS_SYNC_FALLBACK_DELAY_MS = 2600;

export async function closeDialogsThenFocus({
  clearTimer = (timer) => globalThis.clearTimeout?.(timer),
  closeDialog = () => Promise.resolve(),
  dialogs = [],
  focus = () => false,
  focusTimeoutMs = 1800,
  requestFrame = (callback) => {
    if (typeof globalThis.requestAnimationFrame === "function") {
      globalThis.requestAnimationFrame(callback);
    } else {
      globalThis.setTimeout?.(callback, 0);
    }
  },
  setTimer = (callback, delay) => globalThis.setTimeout?.(callback, delay)
} = {}) {
  const openDialogs = dialogs.filter((dialog) => dialog?.open);
  await Promise.all(openDialogs.map((dialog) => Promise.resolve(closeDialog(dialog, "copy"))));
  await new Promise((resolve) => {
    if (typeof requestFrame === "function") requestFrame(resolve);
    else resolve();
  });
  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;
    const finish = (card = null) => {
      if (settled) return;
      settled = true;
      if (timeout != null) clearTimer(timeout);
      resolve(card);
    };
    timeout = setTimer(finish, focusTimeoutMs);
    focus(finish);
  });
}
