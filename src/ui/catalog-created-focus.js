function catalogCardForRecord(root, type, recordId) {
  const selector = type === "container" ? "[data-root-card]" : "[data-list-item-id]";
  const datasetKey = type === "container" ? "rootCard" : "listItemId";
  return [...(root?.querySelectorAll?.(selector) || [])]
    .find((card) => String(card.dataset?.[datasetKey] || "") === String(recordId || "")) || null;
}

export function focusCreatedCatalogCard({
  after = null,
  getViewportHeight = () => globalThis.innerHeight || globalThis.document?.documentElement?.clientHeight || 0,
  recordId,
  requestFrame = (callback) => globalThis.requestAnimationFrame?.(callback),
  root,
  setTimer = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  type = "item"
} = {}) {
  if (!root || !recordId) return false;

  const highlightCard = (card) => {
    card.classList.remove("just-added");
    void card.offsetWidth;
    card.classList.add("just-added");
    setTimer(() => card.classList.remove("just-added"), 1700);
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

  const tryFocus = (remaining = 4) => {
    const card = catalogCardForRecord(root, type, recordId);
    if (!card) {
      if (remaining > 0) requestFrame(() => tryFocus(remaining - 1));
      return false;
    }
    card.scrollIntoView?.({ block: "center", inline: "nearest", behavior: "smooth" });
    highlightWhenScrollSettles(card);
    return true;
  };

  if (after?.then) {
    after.then(() => requestFrame(() => tryFocus()));
    return true;
  }
  return tryFocus();
}
