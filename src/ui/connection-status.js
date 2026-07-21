function isPopoverOpen(element) {
  try {
    return Boolean(element?.matches?.(":popover-open"));
  } catch {
    return false;
  }
}

export function createConnectionStatusController({
  getElement = () => null,
  getMessage = (kind) => kind,
  onChange = () => {}
} = {}) {
  let problemKind = "";

  const render = () => {
    const element = getElement?.();
    if (!element) return;
    if (!problemKind) {
      if (isPopoverOpen(element)) element.hidePopover?.();
      element.hidden = true;
      element.textContent = "";
      delete element.dataset?.kind;
      return;
    }
    element.hidden = false;
    element.dataset.kind = problemKind;
    element.textContent = getMessage(problemKind);
    if (typeof element.showPopover === "function" && !isPopoverOpen(element)) {
      try {
        element.showPopover();
      } catch {
        // The visible non-popover fallback remains available.
      }
    }
  };

  const setProblem = (kind = "offline") => {
    const normalizedKind = kind === "timeout" ? "timeout" : "offline";
    const changed = problemKind !== normalizedKind;
    problemKind = normalizedKind;
    render();
    if (changed) onChange(problemKind);
  };

  const clear = () => {
    if (!problemKind) return;
    problemKind = "";
    render();
    onChange(problemKind);
  };

  return {
    clear,
    currentMessage: () => problemKind ? getMessage(problemKind) : "",
    currentProblem: () => problemKind,
    refresh: render,
    reportFailure: setProblem,
    reportSuccess: clear
  };
}
