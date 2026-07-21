export async function acquirePhotoUploadSlot({
  isBusy = () => false,
  setBusy = () => {},
  shouldContinue = () => true,
  maxWaitMs = 120000,
  delayMs = 250,
  now = () => Date.now(),
  setTimeoutImpl = globalThis.setTimeout
} = {}) {
  const startedAt = now();
  while (isBusy()) {
    if (!shouldContinue() || now() - startedAt >= maxWaitMs) return false;
    await new Promise((resolve) => setTimeoutImpl(resolve, delayMs));
  }
  if (!shouldContinue()) return false;
  setBusy(true);
  return true;
}
