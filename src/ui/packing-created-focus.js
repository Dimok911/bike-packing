import {
  scrollElementBelowStickyHeader,
  stickyHeaderOffsetForTarget
} from "./sticky-scroll.js";
import {
  viewportScrollHost,
  viewportScrollTop
} from "./viewport-scroll-host.js";

function packingCardForRecord(root, type, recordId) {
  const selector = type === "container"
    ? "[data-root-container-id], [data-subcontainer-id]"
    : "[data-item-id]";
  const datasetKeys = type === "container"
    ? ["rootContainerId", "subcontainerId"]
    : ["itemId"];
  return [...(root?.querySelectorAll?.(selector) || [])].find((card) =>
    datasetKeys.some((key) => String(card.dataset?.[key] || "") === String(recordId || ""))
  ) || null;
}

function applySearchFocusStyle(card) {
  card?.classList?.remove?.("just-added");
  card?.classList?.add?.("filter-focus", "copied-item-focus");
}

export function reservePackingFocusScrollRoom(target, {
  documentRef = document,
  gap = 24,
  windowRef = window
} = {}) {
  const view = target?.closest?.(".view");
  const host = viewportScrollHost({ documentRef });
  if (!view || !host || !target?.getBoundingClientRect || !documentRef?.createElement) return null;

  let spacer = view.querySelector?.("[data-packing-focus-scroll-spacer]");
  if (!spacer) {
    spacer = documentRef.createElement("div");
    spacer.setAttribute("data-packing-focus-scroll-spacer", "");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.pointerEvents = "none";
    spacer.style.width = "1px";
    view.append?.(spacer);
  }
  spacer.style.height = "0px";

  const offset = stickyHeaderOffsetForTarget(target, { documentRef, windowRef });
  const currentTop = viewportScrollTop({ documentRef, windowRef });
  const desiredTop = Math.max(0, Math.round(currentTop + target.getBoundingClientRect().top - offset));
  const viewportHeight = host.hasAttribute?.("data-viewport-scroll-host")
    ? Number(host.clientHeight) || 0
    : Number(windowRef.innerHeight) || Number(documentRef.documentElement?.clientHeight) || 0;
  const maxScrollTop = Math.max(0, (Number(host.scrollHeight) || 0) - viewportHeight);
  const reservedHeight = Math.max(0, desiredTop - maxScrollTop) + Math.max(0, Number(gap) || 0);
  spacer.style.height = `${Math.round(reservedHeight)}px`;
  return { desiredTop, maxScrollTop, reservedHeight, spacer };
}

function scrollPackingFocusCard(card) {
  reservePackingFocusScrollRoom(card);
  return scrollElementBelowStickyHeader(card);
}

export function focusRecentlyAddedPackingCard({
  createMutationObserver = (callback) => {
    const Observer = globalThis.MutationObserver;
    return typeof Observer === "function" ? new Observer(callback) : null;
  },
  getViewportHeight = () => globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || 0,
  onClear = () => {},
  onScroll = () => {},
  recordId,
  requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback),
  root,
  scrollCard = scrollPackingFocusCard,
  setTimer = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  type = "item"
} = {}) {
  if (!root || !recordId) return false;

  const highlightCard = (initialCard) => {
    let card = initialCard;
    let stopObserving = () => {};
    const tabIndexByCard = new WeakMap();
    const restoreTabIndex = (target) => {
      const stored = target && tabIndexByCard.get(target);
      if (!stored) return;
      if (!stored.hadTabIndex) target.removeAttribute?.("tabindex");
      else if (stored.previousTabIndex !== null) target.setAttribute?.("tabindex", stored.previousTabIndex);
      tabIndexByCard.delete(target);
    };
    const applyHighlight = (target) => {
      if (!target) return;
      if (card && card !== target) {
        card.classList.remove("filter-focus", "copied-item-focus");
        restoreTabIndex(card);
      }
      card = target;
      if (!tabIndexByCard.has(card)) {
        tabIndexByCard.set(card, {
          hadTabIndex: card.hasAttribute?.("tabindex"),
          previousTabIndex: card.getAttribute?.("tabindex")
        });
      }
      if (!tabIndexByCard.get(card).hadTabIndex) card.setAttribute?.("tabindex", "-1");
      card.focus?.({ preventScroll: true });
      applySearchFocusStyle(card);
    };
    applyHighlight(card);
    const observer = createMutationObserver(() => {
      const currentCard = packingCardForRecord(root, type, recordId);
      if (!currentCard || currentCard === card) return;
      scrollCard(currentCard);
      onScroll(currentCard);
      applyHighlight(currentCard);
    });
    if (observer) {
      observer.observe(root, { childList: true, subtree: true });
      stopObserving = () => observer.disconnect();
    }
    setTimer(() => {
      stopObserving();
      card.classList.remove("filter-focus", "copied-item-focus");
      restoreTabIndex(card);
      onClear(card);
    }, 2600);
  };

  const highlightWhenScrollSettles = (initialCard, remaining = 120) => {
    let card = initialCard;
    if (!card.getBoundingClientRect || !getViewportHeight()) {
      highlightCard(card);
      return;
    }
    let previousTop = null;
    let stableVisibleFrames = 0;
    const check = () => {
      const currentCard = packingCardForRecord(root, type, recordId);
      if (currentCard && currentCard !== card) {
        card = currentCard;
        previousTop = null;
        stableVisibleFrames = 0;
        applySearchFocusStyle(card);
        scrollCard(card);
        onScroll(card);
      }
      const rect = card.getBoundingClientRect();
      const visible = rect.bottom > 0 && rect.top < getViewportHeight();
      const stable = previousTop !== null && Math.abs(rect.top - previousTop) <= 1;
      stableVisibleFrames = visible && stable ? stableVisibleFrames + 1 : 0;
      previousTop = rect.top;
      if (stableVisibleFrames >= 2 || remaining <= 0) {
        highlightCard(card);
        return;
      }
      remaining -= 1;
      requestFrame(check);
    };
    requestFrame(check);
  };

  const tryFocus = (remaining = 8) => {
    const card = packingCardForRecord(root, type, recordId);
    if (!card) {
      if (remaining > 0) requestFrame(() => tryFocus(remaining - 1));
      return false;
    }
    applySearchFocusStyle(card);
    scrollCard(card);
    onScroll(card);
    highlightWhenScrollSettles(card);
    return true;
  };

  return tryFocus();
}
