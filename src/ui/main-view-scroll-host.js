import {
  disableIsolatedViewportScrollHost,
  enableIsolatedViewportScrollHost
} from "./viewport-scroll-host.js";

export function mainViewUsesIsolatedScrollHost(view) {
  return String(view || "") === "packing";
}

// Packing owns custom pan/zoom gestures and benefits from a stable internal
// viewport on iOS. The catalog and settings views must remain on Safari's
// document scroller so their vertical touch momentum cannot be trapped in a
// stale nested overflow layer after a tab switch.
export function syncMainViewScrollHost(view, {
  documentRef = document,
  navigatorRef = navigator,
  windowRef = window
} = {}) {
  if (mainViewUsesIsolatedScrollHost(view)) {
    return enableIsolatedViewportScrollHost({
      documentRef,
      navigatorRef,
      transferPosition: false,
      windowRef
    });
  }
  disableIsolatedViewportScrollHost({
    documentRef,
    transferPosition: false,
    windowRef
  });
  return null;
}
