import {
  scrollViewportTo,
  viewportScrollLeft,
  viewportScrollTop
} from "./viewport-scroll-host.js";

function cssPixels(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function packingStickyHeaderHeight(target, windowRef) {
  const board = target?.closest?.(".board");
  const header = board?.previousElementSibling?.classList?.contains?.("packing-root-header-row")
    ? board.previousElementSibling
    : null;
  if (!header) return 0;
  const style = windowRef.getComputedStyle?.(header);
  const plannedHeight = cssPixels(style?.getPropertyValue?.("--packing-root-header-cell-height"));
  if (
    !header.classList?.contains?.("is-visible")
    || style?.display === "none"
    || style?.visibility === "hidden"
  ) {
    return plannedHeight;
  }
  return Math.max(plannedHeight, header.getBoundingClientRect?.().height || 0);
}

function engagedStickyBottom(element, windowRef) {
  if (!element || element.hidden || element.offsetParent === null) return 0;
  const style = windowRef.getComputedStyle?.(element);
  if (style?.display === "none" || style?.visibility === "hidden") return 0;
  if (style?.position !== "sticky" && style?.position !== "fixed") return 0;
  const rect = element.getBoundingClientRect?.();
  if (!rect) return 0;
  const top = cssPixels(style?.top);
  if (style.position === "sticky" && rect.top > top + 1) return 0;
  const viewportHeight = Math.max(0, windowRef.innerHeight || 0);
  if (rect.bottom <= 0 || (viewportHeight && rect.top >= viewportHeight)) return 0;
  return Math.max(0, rect.bottom || (rect.top + (rect.height || 0)));
}

export function centerElementInHorizontalScrollHost(target, {
  behavior = "smooth",
  hostSelector = ".board"
} = {}) {
  const host = target?.closest?.(hostSelector);
  if (!host?.getBoundingClientRect || !target?.getBoundingClientRect) return null;
  const maxScroll = Math.max(0, (host.scrollWidth || 0) - (host.clientWidth || 0));
  if (maxScroll <= 0) return null;
  const hostRect = host.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const targetCenter = targetRect.left + targetRect.width / 2;
  const hostCenter = hostRect.left + hostRect.width / 2;
  const left = Math.max(0, Math.min(
    maxScroll,
    Math.round((host.scrollLeft || 0) + targetCenter - hostCenter)
  ));
  if (typeof host.scrollTo === "function") {
    host.scrollTo({ left, behavior });
  } else {
    host.scrollLeft = left;
  }
  return { left, maxScroll };
}

export function stickyHeaderOffsetForTarget(target, {
  documentRef = document,
  gap = 12,
  windowRef = window
} = {}) {
  const rootStyles = windowRef.getComputedStyle?.(documentRef.documentElement);
  const bannerHeight = cssPixels(rootStyles?.getPropertyValue("--sticky-banner-height"));
  const controlsHeight = cssPixels(rootStyles?.getPropertyValue("--sticky-controls-height"));
  const tabsHeight = cssPixels(rootStyles?.getPropertyValue("--sticky-tabs-height"));
  const view = target?.closest?.(".view");
  const toolbar = view?.querySelector?.(".catalog-toolbar-sticky");
  const toolbarVisible = toolbar
    && !toolbar.hidden
    && toolbar.offsetParent !== null
    && windowRef.getComputedStyle?.(toolbar)?.display !== "none";
  const toolbarHeight = toolbarVisible ? Math.max(0, toolbar.getBoundingClientRect().height || 0) : 0;
  const packingHeaderHeight = packingStickyHeaderHeight(target, windowRef);
  const configuredOffset = bannerHeight
    + controlsHeight
    + tabsHeight
    + toolbarHeight
    + packingHeaderHeight;
  const liveOffset = Math.max(
    engagedStickyBottom(documentRef.querySelector?.(".experiment-banner"), windowRef),
    engagedStickyBottom(documentRef.querySelector?.(".controls"), windowRef),
    engagedStickyBottom(documentRef.querySelector?.(".tabs-row"), windowRef),
    engagedStickyBottom(toolbar, windowRef),
    engagedStickyBottom(
      target?.closest?.(".board")?.previousElementSibling,
      windowRef
    )
  );
  return Math.max(configuredOffset, liveOffset)
    + Math.max(0, Number(gap) || 0);
}

export function scrollElementBelowStickyHeader(target, {
  behavior = "smooth",
  documentRef = document,
  gap = 12,
  windowRef = window
} = {}) {
  if (!target?.getBoundingClientRect) return null;
  const offset = stickyHeaderOffsetForTarget(target, { documentRef, gap, windowRef });
  const rect = target.getBoundingClientRect();
  const refs = { documentRef, windowRef };
  const currentTop = viewportScrollTop(refs);
  const top = Math.max(0, Math.round(currentTop + rect.top - offset));
  scrollViewportTo({ top, left: viewportScrollLeft(refs), behavior }, refs);
  centerElementInHorizontalScrollHost(target, { behavior });
  return { top, offset };
}
