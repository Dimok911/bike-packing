export const CARD_EDIT_INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "a",
  "[contenteditable]",
  "[data-photo-controls]",
  "[data-photo-open]"
].join(", ");

export function shouldOpenCardEditor(event, {
  card = null,
  closestCardSelector = ""
} = {}) {
  if (!event || !card || event.defaultPrevented) return false;
  if (typeof event.button === "number" && event.button !== 0) return false;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
  if (card.dataset?.justDragged === "true") return false;
  const target = event.target;
  if (typeof target?.closest !== "function") return false;
  if (target.closest(CARD_EDIT_INTERACTIVE_SELECTOR)) return false;
  if (closestCardSelector && target.closest(closestCardSelector) !== card) return false;
  return true;
}

export function bindCardEditorClicks(root, {
  cardSelector = "",
  closestCardSelector = cardSelector,
  getCardId = () => "",
  isBlocked = () => false,
  openEditor = () => {}
} = {}) {
  if (!root || !cardSelector) return;
  root.querySelectorAll(cardSelector).forEach((card) => {
    card.addEventListener("click", (event) => {
      if (isBlocked(event, card) || !shouldOpenCardEditor(event, { card, closestCardSelector })) return;
      const id = getCardId(card);
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      openEditor(id, card, event);
    });
  });
}
