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
  render();
  finishAppStartup(documentRef);
}
