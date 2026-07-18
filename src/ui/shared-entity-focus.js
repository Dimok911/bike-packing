import { sharedVirtualContainerId, sharedVirtualItemId } from "../public/shared-virtual-state.js";

function selectorValue(value) {
  return String(value || "").replace(/["\\]/g, "\\$&");
}

export function sharedEntityFocusSelector(target) {
  if (!target?.id) return "";
  const virtualId = target.type === "item"
    ? sharedVirtualItemId(target.id)
    : sharedVirtualContainerId(target.id);
  const escapedId = selectorValue(virtualId);
  return target.type === "item"
    ? `[data-item-id="${escapedId}"]`
    : `[data-root-container-id="${escapedId}"], [data-subcontainer-id="${escapedId}"]`;
}

export function focusSharedEntityTarget(root, target, {
  attempts = 8,
  requestFrame = (callback) => requestAnimationFrame(callback),
  setTimer = (callback, delay) => setTimeout(callback, delay)
} = {}) {
  const selector = sharedEntityFocusSelector(target);
  if (!root || !selector) return false;
  let remaining = Math.max(1, Number(attempts) || 1);
  const focus = () => {
    const element = root.querySelector(selector);
    if (!element) {
      remaining -= 1;
      if (remaining > 0) requestFrame(focus);
      return;
    }
    const hadTabIndex = element.hasAttribute("tabindex");
    const previousTabIndex = element.getAttribute("tabindex");
    if (!hadTabIndex) element.setAttribute("tabindex", "-1");
    element.classList.add("shared-link-focus");
    element.scrollIntoView?.({ behavior: "smooth", block: "center", inline: "center" });
    element.focus?.({ preventScroll: true });
    setTimer(() => {
      element.classList.remove("shared-link-focus");
      if (!hadTabIndex) element.removeAttribute("tabindex");
      else if (previousTabIndex !== null) element.setAttribute("tabindex", previousTabIndex);
    }, 3300);
  };
  requestFrame(focus);
  return true;
}
