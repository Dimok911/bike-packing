export function createLayoutLoadStatusController({ getElement }) {
  let status = { tone: "idle", text: "" };

  function setStatus(tone = "idle", text = "") {
    status = { tone, text };
    render();
  }

  function render() {
    const element = getElement?.();
    if (!element) return;
    const resolvedText = typeof status.text === "function" ? status.text() : status.text;
    const text = String(resolvedText || "").trim();
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

function languageText(language, en, ru) {
  return language === "en" ? en : ru;
}

export function formatLayoutLoadProgress({ loaded = 0, total = null, prefix = "", language = "ru" } = {}) {
  const knownTotal = Number.isFinite(total) && total >= 0;
  const safeLoaded = Math.max(0, Number(loaded) || 0);
  const safeTotal = knownTotal ? Math.max(safeLoaded, Number(total) || 0) : null;
  const countText = knownTotal
    ? languageText(language, `${safeLoaded} of ${safeTotal}`, `${safeLoaded} из ${safeTotal}`)
    : languageText(
      language,
      `${safeLoaded} loaded · checking the full list`,
      `${safeLoaded} загружено · уточняю полный список`
    );
  return prefix ? `${prefix}: ${countText}` : countText;
}

export function formatPersonalLayoutsLoadedStatus(count = 0, language = "ru") {
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount) {
    return languageText(
      language,
      `Personal layouts loaded: ${safeCount} of ${safeCount}`,
      `Личные укладки загружены: ${safeCount} из ${safeCount}`
    );
  }
  return languageText(
    language,
    "Personal layouts loaded: 0 of 0 · the list is empty",
    "Личные укладки загружены: 0 из 0 · список пока пустой"
  );
}
