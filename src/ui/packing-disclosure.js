function disclosureLabel(button, collapsed) {
  return collapsed
    ? String(button?.dataset?.expandLabel || "")
    : String(button?.dataset?.collapseLabel || "");
}

export function updateNestedPackingDisclosure(button, collapsed) {
  const containerId = String(button?.dataset?.toggleContainer || "");
  const section = button?.closest?.(".subcontainer[data-subcontainer-id]");
  if (!containerId || !section || String(section?.dataset?.subcontainerId || "") !== containerId) return false;

  section.classList.remove("native-disclosure-opening");
  section.classList.toggle("collapsed", Boolean(collapsed));
  button.setAttribute("aria-expanded", String(!collapsed));

  const label = disclosureLabel(button, collapsed);
  if (label) {
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }

  const icon = button.querySelector?.(".chevron-icon");
  icon?.classList?.toggle("chevron-right", Boolean(collapsed));
  icon?.classList?.toggle("chevron-down", !collapsed);

  if (!collapsed) {
    section.classList.add("native-disclosure-opening");
    const dropzone = section.querySelector?.(":scope > .dropzone");
    const clearOpeningState = () => {
      section.classList.remove("native-disclosure-opening");
    };
    dropzone?.addEventListener?.("animationend", clearOpeningState, { once: true });
    dropzone?.addEventListener?.("animationcancel", clearOpeningState, { once: true });
  }
  return true;
}
