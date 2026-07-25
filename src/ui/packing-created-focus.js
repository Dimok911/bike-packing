import { scrollElementBelowStickyHeader } from "./sticky-scroll.js";

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

export function focusRecentlyAddedPackingCard({
  getViewportHeight = () => globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || 0,
  onClear = () => {},
  onScroll = () => {},
  recordId,
  requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback),
  root,
  scrollCard = (card) => scrollElementBelowStickyHeader(card),
  setTimer = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  type = "item"
} = {}) {
  if (!root || !recordId) return false;

  const highlightCard = (card) => {
    const hadTabIndex = card.hasAttribute?.("tabindex");
    const previousTabIndex = card.getAttribute?.("tabindex");
    if (!hadTabIndex) card.setAttribute?.("tabindex", "-1");
    card.focus?.({ preventScroll: true });
    card.classList.remove("just-added", "copied-item-focus");
    void card.offsetWidth;
    card.classList.add("copied-item-focus");
    setTimer(() => {
      card.classList.remove("copied-item-focus");
      if (!hadTabIndex) card.removeAttribute?.("tabindex");
      else if (previousTabIndex !== null) card.setAttribute?.("tabindex", previousTabIndex);
      onClear(card);
    }, 2600);
  };

  const highlightWhenScrollSettles = (card, remaining = 120) => {
    if (!card.getBoundingClientRect || !getViewportHeight()) {
      highlightCard(card);
      return;
    }
    let previousTop = null;
    let stableVisibleFrames = 0;
    const check = () => {
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
    scrollCard(card);
    onScroll(card);
    highlightWhenScrollSettles(card);
    return true;
  };

  return tryFocus();
}
