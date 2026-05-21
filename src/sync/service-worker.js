export function registerAppServiceWorker({ isLocalDevOrigin = () => false } = {}) {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  if (isLocalDevOrigin()) {
    navigator.serviceWorker.getRegistrations?.().then((registrations) => {
      registrations.forEach((registration) => registration.unregister());
    }).catch(() => null);
    return;
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const activateWaitingWorker = (registration) => {
    if (registration.waiting && navigator.serviceWorker.controller) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  };

  navigator.serviceWorker.register("./sw.js").then((registration) => {
    activateWaitingWorker(registration);
    registration.update?.().then(() => activateWaitingWorker(registration)).catch(() => null);
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          worker.postMessage({ type: "SKIP_WAITING" });
        }
      });
    });
  }).catch(() => null);
}
