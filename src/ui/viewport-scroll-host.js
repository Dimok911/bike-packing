const VIEWPORT_SCROLL_HOST_ATTRIBUTE = "data-viewport-scroll-host";
const VIEWPORT_SCROLL_HOST_NO_BANNER_ATTRIBUTE = "data-viewport-scroll-host-no-banner";
const VIEWPORT_SCROLL_HOST_CLASS = "isolated-viewport-scroll";
const hostBindings = new WeakMap();

export function shouldIsolateViewportScroll({
  maxTouchPoints = 0,
  platform = "",
  userAgent = ""
} = {}) {
  const agent = String(userAgent || "");
  const devicePlatform = String(platform || "");
  return /iPad|iPhone|iPod/i.test(agent)
    || (/Mac/i.test(devicePlatform) && Number(maxTouchPoints) > 1);
}

export function viewportScrollHost({
  documentRef = document
} = {}) {
  return documentRef?.querySelector?.(`[${VIEWPORT_SCROLL_HOST_ATTRIBUTE}]`)
    || documentRef?.scrollingElement
    || documentRef?.documentElement
    || null;
}

export function viewportScrollTop(options = {}) {
  const { documentRef = document, windowRef = window } = options;
  const host = viewportScrollHost({ documentRef });
  if (host?.hasAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE)) {
    return Number(host.scrollTop) || 0;
  }
  return Number(windowRef?.scrollY ?? windowRef?.pageYOffset ?? host?.scrollTop ?? 0) || 0;
}

export function viewportScrollLeft(options = {}) {
  const { documentRef = document, windowRef = window } = options;
  const host = viewportScrollHost({ documentRef });
  if (host?.hasAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE)) {
    return Number(host.scrollLeft) || 0;
  }
  return Number(windowRef?.scrollX ?? windowRef?.pageXOffset ?? host?.scrollLeft ?? 0) || 0;
}

export function currentViewportScrollPosition(options = {}) {
  return {
    x: viewportScrollLeft(options),
    y: viewportScrollTop(options)
  };
}

export function scrollViewportTo(options = {}, refs = {}) {
  const { documentRef = document, windowRef = window } = refs;
  const host = viewportScrollHost({ documentRef });
  if (host?.hasAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE)) {
    if (typeof host.scrollTo === "function") host.scrollTo(options);
    else {
      if (Number.isFinite(Number(options.left))) host.scrollLeft = Number(options.left);
      if (Number.isFinite(Number(options.top))) host.scrollTop = Number(options.top);
    }
    return host;
  }
  windowRef?.scrollTo?.(options);
  return host;
}

export function scrollViewportBy(options = {}, refs = {}) {
  const {
    left = 0,
    top = 0,
    behavior = "auto"
  } = options;
  return scrollViewportTo({
    left: viewportScrollLeft(refs) + (Number(left) || 0),
    top: viewportScrollTop(refs) + (Number(top) || 0),
    behavior
  }, refs);
}

export function enableIsolatedViewportScrollHost({
  documentRef = document,
  force = false,
  navigatorRef = navigator,
  windowRef = window
} = {}) {
  const app = documentRef?.querySelector?.(".app");
  if (!app) return null;
  if (!force && !shouldIsolateViewportScroll({
    maxTouchPoints: navigatorRef?.maxTouchPoints,
    platform: navigatorRef?.platform,
    userAgent: navigatorRef?.userAgent
  })) return null;
  if (app.hasAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE)) return app;

  const initialX = Number(windowRef?.scrollX ?? windowRef?.pageXOffset ?? 0) || 0;
  const initialY = Number(windowRef?.scrollY ?? windowRef?.pageYOffset ?? 0) || 0;
  app.setAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE, "");
  if (!app.querySelector?.(".experiment-banner")) {
    app.setAttribute?.(VIEWPORT_SCROLL_HOST_NO_BANNER_ATTRIBUTE, "");
  }
  documentRef.documentElement?.classList?.add?.(VIEWPORT_SCROLL_HOST_CLASS);
  documentRef.body?.classList?.add?.(VIEWPORT_SCROLL_HOST_CLASS);

  if (initialX || initialY) {
    if (typeof app.scrollTo === "function") {
      app.scrollTo({ left: initialX, top: initialY, behavior: "auto" });
    } else {
      app.scrollLeft = initialX;
      app.scrollTop = initialY;
    }
    if (documentRef.scrollingElement && documentRef.scrollingElement !== app) {
      documentRef.scrollingElement.scrollLeft = 0;
      documentRef.scrollingElement.scrollTop = 0;
    }
  }

  const forwardScroll = () => {
    const EventCtor = windowRef?.Event || globalThis.Event;
    if (typeof EventCtor === "function") windowRef?.dispatchEvent?.(new EventCtor("scroll"));
  };
  app.addEventListener?.("scroll", forwardScroll, { passive: true });
  hostBindings.set(app, { forwardScroll });
  return app;
}

export function disableIsolatedViewportScrollHost({
  documentRef = document,
  windowRef = window
} = {}) {
  const app = documentRef?.querySelector?.(`[${VIEWPORT_SCROLL_HOST_ATTRIBUTE}]`);
  if (!app) return false;
  const position = {
    x: Number(app.scrollLeft) || 0,
    y: Number(app.scrollTop) || 0
  };
  const binding = hostBindings.get(app);
  if (binding) app.removeEventListener?.("scroll", binding.forwardScroll);
  hostBindings.delete(app);
  app.removeAttribute?.(VIEWPORT_SCROLL_HOST_ATTRIBUTE);
  app.removeAttribute?.(VIEWPORT_SCROLL_HOST_NO_BANNER_ATTRIBUTE);
  documentRef.documentElement?.classList?.remove?.(VIEWPORT_SCROLL_HOST_CLASS);
  documentRef.body?.classList?.remove?.(VIEWPORT_SCROLL_HOST_CLASS);
  windowRef?.scrollTo?.({ left: position.x, top: position.y, behavior: "auto" });
  return true;
}
