export function finishAppStartup(documentRef = document) {
  documentRef.body?.classList.remove("app-starting");
  documentRef.querySelector?.(".app-startup")?.setAttribute("aria-busy", "false");
}

export function renderBeforeFinishingAppStartup({ documentRef = document, render = () => {} } = {}) {
  render();
  finishAppStartup(documentRef);
}
