export function createLayoutLoadStatusController({ getElement }) {
  let status = { tone: "idle", text: "" };

  function setStatus(tone = "idle", text = "") {
    status = { tone, text };
    render();
  }

  function render() {
    const element = getElement?.();
    if (!element) return;
    const text = String(status.text || "").trim();
    element.hidden = false;
    element.textContent = text;
    element.classList.remove("loading", "success", "warning", "error", "empty");
    element.classList.toggle("empty", !text);
    const tone = String(status.tone || "");
    if (["loading", "success", "warning", "error"].includes(tone)) element.classList.add(tone);
  }

  return {
    render,
    setStatus
  };
}

export function countPrivateLayouts(targetState, { guestDemoCopyFlag = "" } = {}) {
  return Object.values(targetState?.layouts || {})
    .filter((layout) => layout && !layout.adminDemo && !layout.adminSharedSourceId && !layout?.[guestDemoCopyFlag])
    .length;
}
