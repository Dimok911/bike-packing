import { escapeHtml } from "../utils/html.js";
import { markExplicitViewportScrollIntent } from "./viewport-scroll-intent.js";
import {
  enableIsolatedViewportScrollHost,
  scrollViewportTo,
  viewportScrollHost,
  viewportScrollTop
} from "./viewport-scroll-host.js";

export const CATALOG_BACK_TO_TOP_THRESHOLD_PX = 360;
const TOUCH_ACTIVATION_MOVE_LIMIT_PX = 10;
const SYNTHETIC_CLICK_SUPPRESSION_MS = 700;

const activeBindings = new WeakMap();
const documentControllers = new WeakMap();

// CRITICAL: iOS WebKit can discard the touch that interrupts native momentum
// before dispatching it to a scrolling/sticky DOM subtree. Catalog renders may
// replace anchors, but the interactive portal and its listeners must stay stable.
export function renderCatalogBackToTopButton(label) {
  const safeLabel = escapeHtml(label || "");
  return `
    <span class="catalog-back-to-top-anchor" data-catalog-back-to-top-anchor data-label="${safeLabel}" hidden aria-hidden="true"></span>
  `;
}

export function shouldShowCatalogBackToTop({
  rootVisible = true,
  scrollY = 0,
  threshold = CATALOG_BACK_TO_TOP_THRESHOLD_PX
} = {}) {
  return Boolean(rootVisible && Number(scrollY) > Number(threshold));
}

function eventPoint(event) {
  const touch = event?.touches?.[0] || event?.changedTouches?.[0];
  if (touch) return { x: Number(touch.clientX) || 0, y: Number(touch.clientY) || 0 };
  return { x: Number(event?.clientX) || 0, y: Number(event?.clientY) || 0 };
}

function isTouchPointer(event) {
  return event?.pointerType === "touch" || event?.pointerType === "pen";
}

function rootIsVisible(root) {
  return Boolean(root
    && !root.hidden
    && !root.classList?.contains?.("hidden")
    && root.offsetParent !== null);
}

function setButtonLabel(button, label) {
  const value = String(label || "");
  button?.setAttribute?.("aria-label", value);
  button?.setAttribute?.("title", value);
}

function createPortalElements(documentRef) {
  const layer = documentRef.createElement("div");
  layer.className = "catalog-back-to-top-layer";
  layer.hidden = true;
  layer.setAttribute("aria-hidden", "true");

  const button = documentRef.createElement("button");
  button.className = "ghost catalog-back-to-top";
  button.type = "button";
  button.hidden = true;
  button.setAttribute("data-catalog-back-to-top", "");
  button.setAttribute("data-viewport-scroll-action", "");
  button.innerHTML = '<span aria-hidden="true">&#8593;</span>';
  layer.append(button);

  (documentRef.body || documentRef.documentElement)?.append?.(layer);
  return { button, layer };
}

export function createCatalogBackToTopController({
  button,
  documentRef,
  layer,
  mutationObserverFactory,
  threshold = CATALOG_BACK_TO_TOP_THRESHOLD_PX,
  windowRef
} = {}) {
  const registrations = new Map();
  let updateFrame = 0;
  let activeInput = "";
  let gestureStartX = 0;
  let gestureStartY = 0;
  let gestureMoved = false;
  let suppressClickUntil = 0;

  const requestFrame = windowRef?.requestAnimationFrame?.bind(windowRef);
  const cancelFrame = windowRef?.cancelAnimationFrame?.bind(windowRef);
  const mutationFactory = mutationObserverFactory
    || (typeof MutationObserver === "function"
      ? (callback) => new MutationObserver(callback)
      : null);

  const pageScrollY = () => viewportScrollTop({ documentRef, windowRef });
  const activeRegistration = () => [...registrations.values()].find(({ anchor, root }) =>
    rootIsVisible(root)
    && anchor
    && anchor.isConnected !== false
    && (!root.contains || root.contains(anchor))
  ) || null;

  const positionButton = (anchor) => {
    const rect = anchor?.getBoundingClientRect?.();
    if (!rect || rect.width <= 0 || rect.height <= 0) return false;
    button.style.left = `${Math.round(rect.left)}px`;
    button.style.top = `${Math.round(rect.top)}px`;
    button.style.width = `${Math.round(rect.width)}px`;
    button.style.height = `${Math.round(rect.height)}px`;
    return true;
  };

  const update = () => {
    updateFrame = 0;
    const registration = activeRegistration();
    const visible = shouldShowCatalogBackToTop({
      rootVisible: Boolean(registration),
      scrollY: pageScrollY(),
      threshold
    });

    for (const entry of registrations.values()) {
      entry.anchor.hidden = !visible || entry !== registration;
    }

    if (!visible || !registration || !positionButton(registration.anchor)) {
      button.hidden = true;
      layer.hidden = true;
      layer.setAttribute?.("aria-hidden", "true");
      return;
    }

    setButtonLabel(button, registration.label);
    layer.hidden = false;
    button.hidden = false;
    layer.setAttribute?.("aria-hidden", "false");
  };

  const scheduleUpdate = () => {
    if (updateFrame) return;
    updateFrame = requestFrame?.(update) || 0;
    if (!updateFrame) update();
  };

  const stopEvent = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
  };

  const scrollToTop = ({ smooth = false } = {}) => {
    markExplicitViewportScrollIntent();
    scrollViewportTo({
      top: 0,
      left: 0,
      behavior: smooth ? "smooth" : "auto"
    }, { documentRef, windowRef });
  };

  const beginGesture = (input, event) => {
    if (activeInput && activeInput !== input) return;
    if (input === "pointer" && !isTouchPointer(event)) return;
    if (input === "touch" && event?.touches?.length !== 1) return;
    const point = eventPoint(event);
    activeInput = input;
    gestureStartX = point.x;
    gestureStartY = point.y;
    gestureMoved = false;
    stopEvent(event);
  };

  const moveGesture = (input, event) => {
    if (activeInput !== input) return;
    const point = eventPoint(event);
    if (Math.hypot(point.x - gestureStartX, point.y - gestureStartY) > TOUCH_ACTIVATION_MOVE_LIMIT_PX) {
      gestureMoved = true;
    }
    stopEvent(event);
  };

  const finishGesture = (input, event) => {
    if (activeInput !== input) return;
    const shouldActivate = !gestureMoved;
    activeInput = "";
    gestureMoved = false;
    stopEvent(event);
    if (!shouldActivate) return;
    suppressClickUntil = Date.now() + SYNTHETIC_CLICK_SUPPRESSION_MS;
    scrollToTop();
  };

  const cancelGesture = (input) => {
    if (activeInput !== input) return;
    activeInput = "";
    gestureMoved = false;
  };

  const onClick = (event) => {
    if (Date.now() < suppressClickUntil) {
      stopEvent(event);
      return;
    }
    scrollToTop({ smooth: true });
  };
  const onTouchStart = (event) => beginGesture("touch", event);
  const onTouchMove = (event) => moveGesture("touch", event);
  const onTouchEnd = (event) => finishGesture("touch", event);
  const onTouchCancel = () => cancelGesture("touch");
  const onPointerDown = (event) => beginGesture("pointer", event);
  const onPointerMove = (event) => moveGesture("pointer", event);
  const onPointerUp = (event) => finishGesture("pointer", event);
  const onPointerCancel = () => cancelGesture("pointer");

  button?.addEventListener?.("click", onClick);
  button?.addEventListener?.("touchstart", onTouchStart, { passive: false });
  button?.addEventListener?.("touchmove", onTouchMove, { passive: false });
  button?.addEventListener?.("touchend", onTouchEnd, { passive: false });
  button?.addEventListener?.("touchcancel", onTouchCancel, { passive: true });
  button?.addEventListener?.("pointerdown", onPointerDown, { passive: false });
  button?.addEventListener?.("pointermove", onPointerMove, { passive: false });
  button?.addEventListener?.("pointerup", onPointerUp, { passive: false });
  button?.addEventListener?.("pointercancel", onPointerCancel, { passive: true });
  windowRef?.addEventListener?.("scroll", scheduleUpdate, { passive: true });
  windowRef?.addEventListener?.("resize", scheduleUpdate, { passive: true });
  const scrollHost = viewportScrollHost({ documentRef });
  if (scrollHost && scrollHost !== documentRef?.scrollingElement) {
    scrollHost.addEventListener?.("scroll", scheduleUpdate, { passive: true });
  }
  windowRef?.visualViewport?.addEventListener?.("resize", scheduleUpdate, { passive: true });
  windowRef?.visualViewport?.addEventListener?.("scroll", scheduleUpdate, { passive: true });

  const register = (root, anchor, { label = "" } = {}) => {
    const previous = registrations.get(root);
    previous?.observer?.disconnect?.();

    const registration = { anchor, label, observer: null, root };
    if (mutationFactory) {
      registration.observer = mutationFactory(scheduleUpdate);
      registration.observer?.observe?.(root, {
        attributes: true,
        attributeFilter: ["class", "hidden"],
        childList: true,
        subtree: true
      });
    }
    registrations.set(root, registration);
    update();

    return () => {
      if (registrations.get(root) !== registration) return;
      registration.observer?.disconnect?.();
      registrations.delete(root);
      update();
    };
  };

  const destroy = () => {
    if (updateFrame) cancelFrame?.(updateFrame);
    for (const registration of registrations.values()) registration.observer?.disconnect?.();
    registrations.clear();
    button?.removeEventListener?.("click", onClick);
    button?.removeEventListener?.("touchstart", onTouchStart);
    button?.removeEventListener?.("touchmove", onTouchMove);
    button?.removeEventListener?.("touchend", onTouchEnd);
    button?.removeEventListener?.("touchcancel", onTouchCancel);
    button?.removeEventListener?.("pointerdown", onPointerDown);
    button?.removeEventListener?.("pointermove", onPointerMove);
    button?.removeEventListener?.("pointerup", onPointerUp);
    button?.removeEventListener?.("pointercancel", onPointerCancel);
    windowRef?.removeEventListener?.("scroll", scheduleUpdate);
    windowRef?.removeEventListener?.("resize", scheduleUpdate);
    if (scrollHost && scrollHost !== documentRef?.scrollingElement) {
      scrollHost.removeEventListener?.("scroll", scheduleUpdate);
    }
    windowRef?.visualViewport?.removeEventListener?.("resize", scheduleUpdate);
    windowRef?.visualViewport?.removeEventListener?.("scroll", scheduleUpdate);
    layer?.remove?.();
  };

  update();
  return { destroy, refresh: update, register };
}

function ensureDocumentController(documentRef, windowRef, threshold) {
  const existing = documentControllers.get(documentRef);
  if (existing) return existing;
  enableIsolatedViewportScrollHost({
    documentRef,
    navigatorRef: windowRef?.navigator || globalThis.navigator,
    windowRef
  });
  const { button, layer } = createPortalElements(documentRef);
  const controller = createCatalogBackToTopController({
    button,
    documentRef,
    layer,
    threshold,
    windowRef
  });
  documentControllers.set(documentRef, controller);
  return controller;
}

export function bindCatalogBackToTop(root, {
  threshold = CATALOG_BACK_TO_TOP_THRESHOLD_PX,
  windowRef = window
} = {}) {
  activeBindings.get(root)?.();

  const anchor = root?.querySelector?.("[data-catalog-back-to-top-anchor]");
  const documentRef = root?.ownerDocument || windowRef?.document || globalThis.document;
  if (!root || !anchor || !documentRef || !windowRef) return () => {};

  const controller = ensureDocumentController(documentRef, windowRef, threshold);
  const cleanupRegistration = controller.register(root, anchor, {
    label: anchor.dataset?.label || anchor.getAttribute?.("data-label") || ""
  });
  const cleanup = () => {
    cleanupRegistration();
    if (activeBindings.get(root) === cleanup) activeBindings.delete(root);
  };
  activeBindings.set(root, cleanup);
  return cleanup;
}
