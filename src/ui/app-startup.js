export function resolveAppStartupLanguage({
  uiLanguage = "en",
  authenticated = false,
  rememberedSession = false,
  defaultLanguage = "en"
} = {}) {
  return authenticated || rememberedSession ? uiLanguage : defaultLanguage;
}

export function finishAppStartup(documentRef = document) {
  documentRef.body?.classList.add("app-ready");
  documentRef.body?.classList.remove("app-starting");
  documentRef.querySelector?.(".app-startup")?.setAttribute("aria-busy", "false");
}

export function renderBeforeFinishingAppStartup({ documentRef = document, render = () => {} } = {}) {
  try {
    render();
  } finally {
    finishAppStartup(documentRef);
  }
}

export async function waitForStartupTask(task, {
  timeoutMs = 8000,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  if (!task) return "settled";
  let timeoutId = null;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeoutFn(() => resolve("timeout"), Math.max(0, Number(timeoutMs) || 0));
  });
  try {
    return await Promise.race([
      Promise.resolve(task).then(() => "settled"),
      timeout
    ]);
  } finally {
    if (timeoutId !== null) clearTimeoutFn(timeoutId);
  }
}
