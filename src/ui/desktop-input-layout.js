const LATIN_LAYOUT = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const RU_LAYOUT = "ёйцукенгшщзхъфывапролджэячсмитьбю.";
export const DESKTOP_INPUT_LAYOUT_MUTE_ICONS = Object.freeze({
  disable: "⏸",
  enable: "▶"
});

export const DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR = [
  "#searchInput",
  "#categoryFilterSearch",
  "#itemCategorySearch",
  "#rootContainerCategorySearch",
  "#itemName",
  "#rootContainerName",
  "#itemColor",
  "#rootContainerColor",
  "#itemNote",
  "#rootContainerNote",
  "#layoutEditName",
  "#layoutEditNotes",
  "#layoutName",
  "#addToContainerSearch",
  "#newSubcontainerName",
  "#layoutRootSearch",
  "#categoryInput",
  "#locationInput",
  "[data-new-category-input]",
  "[data-dictionary-edit-input]"
].join(",");

const latinToRuMap = [...LATIN_LAYOUT].reduce((map, latin, index) => {
  map[latin] = RU_LAYOUT[index];
  return map;
}, {});

const ruToLatinMap = Object.entries(latinToRuMap).reduce((map, [latin, ru]) => {
  map[ru] = latin;
  return map;
}, {});

function convertByMap(value, map) {
  if (!value) return value;
  let changed = false;
  const converted = [...String(value)].map((character) => {
    const lower = character.toLowerCase();
    const mapped = map[lower];
    if (!mapped) return character;
    changed = true;
    return character === lower ? mapped : mapped.toUpperCase();
  }).join("");
  return changed ? converted : value;
}

export function convertLatinToRuLayout(value) {
  return convertByMap(value, latinToRuMap);
}

export function convertRuToLatinLayout(value) {
  return convertByMap(value, ruToLatinMap);
}

export function createDesktopInputNormalizer({
  initialMode = "RU",
  initialValue = ""
} = {}) {
  let mode = initialMode === "EN" ? "EN" : "RU";
  let previousValue = String(initialValue || "");

  const converter = () => mode === "EN" ? convertRuToLatinLayout : convertLatinToRuLayout;

  return {
    getMode: () => mode,
    setMode(nextMode) {
      mode = nextMode === "EN" ? "EN" : "RU";
      return mode;
    },
    toggleMode() {
      mode = mode === "RU" ? "EN" : "RU";
      return mode;
    },
    sync(value) {
      previousValue = String(value || "");
      return previousValue;
    },
    normalizeInput(input) {
      if (!input) return "";
      const raw = String(input.value || "");
      const previous = previousValue;
      let prefixLength = 0;
      const minimumLength = Math.min(previous.length, raw.length);
      while (
        prefixLength < minimumLength
        && previous.charCodeAt(prefixLength) === raw.charCodeAt(prefixLength)
      ) {
        prefixLength += 1;
      }

      let suffixLength = 0;
      while (
        suffixLength < minimumLength - prefixLength
        && previous.charCodeAt(previous.length - 1 - suffixLength)
          === raw.charCodeAt(raw.length - 1 - suffixLength)
      ) {
        suffixLength += 1;
      }

      const changedStart = prefixLength;
      const changedEnd = raw.length - suffixLength;
      if (changedStart >= changedEnd) {
        previousValue = raw;
        return raw;
      }

      const changedPart = raw.slice(changedStart, changedEnd);
      const convertedPart = converter()(changedPart);
      if (convertedPart === changedPart) {
        previousValue = raw;
        return raw;
      }

      const selectionStart = input.selectionStart ?? raw.length;
      const selectionEnd = input.selectionEnd ?? selectionStart;
      const delta = convertedPart.length - changedPart.length;
      input.value = raw.slice(0, changedStart) + convertedPart + raw.slice(changedEnd);
      input.setSelectionRange?.(
        Math.max(changedStart, selectionStart + delta),
        Math.max(changedStart, selectionEnd + delta)
      );
      previousValue = String(input.value || "");
      return previousValue;
    }
  };
}

export function shouldEnableDesktopInputLayout({
  language = "",
  desktopMatches = false
} = {}) {
  return String(language || "").toLowerCase() === "ru" && desktopMatches === true;
}

function translatedText(translate, key, fallback) {
  const value = typeof translate === "function" ? translate(key) : "";
  return value && value !== key ? value : fallback;
}

export function createDesktopInputLayoutController({
  desktopMediaQuery = "(min-width: 769px) and (hover: hover) and (pointer: fine)",
  documentRef = document,
  getLanguage = () => documentRef.documentElement?.lang || "",
  selector = DEFAULT_DESKTOP_INPUT_LAYOUT_SELECTOR,
  translate = (key) => key,
  windowRef = window
} = {}) {
  const states = new Map();
  const media = windowRef.matchMedia?.(desktopMediaQuery) || { matches: false };
  let refreshFrame = null;

  const labels = () => ({
    disable: translatedText(translate, "inputLayout.disable", "Отключить преобразование раскладки"),
    enable: translatedText(translate, "inputLayout.enable", "Включить преобразование раскладки"),
    en: translatedText(translate, "inputLayout.english", "Английская раскладка"),
    ru: translatedText(translate, "inputLayout.russian", "Русская раскладка"),
    switchMode: translatedText(translate, "inputLayout.switch", "Переключить язык ввода")
  });

  const syncUi = (state) => {
    const text = labels();
    const mode = state.normalizer.getMode();
    if (state.modeButton.textContent !== mode) state.modeButton.textContent = mode;
    state.modeButton.classList.toggle("is-muted", state.muted);
    state.modeButton.setAttribute("aria-label", `${text.switchMode}: ${mode === "RU" ? text.ru : text.en}`);
    state.modeButton.setAttribute("title", `${text.switchMode}: ${mode === "RU" ? text.ru : text.en}`);
    const muteText = state.muted
      ? DESKTOP_INPUT_LAYOUT_MUTE_ICONS.enable
      : DESKTOP_INPUT_LAYOUT_MUTE_ICONS.disable;
    if (state.muteButton.textContent !== muteText) state.muteButton.textContent = muteText;
    state.muteButton.classList.toggle("is-muted", state.muted);
    state.muteButton.setAttribute("aria-pressed", state.muted ? "true" : "false");
    state.muteButton.setAttribute("aria-label", state.muted ? text.enable : text.disable);
    state.muteButton.setAttribute("title", state.muted ? text.enable : text.disable);
    state.wrapper.classList.toggle("is-muted", state.muted);
  };

  const detach = (input) => {
    const state = states.get(input);
    if (!state) return;
    states.delete(input);
    state.wrapper.replaceWith(input);
  };

  const attach = (input) => {
    if (!input || states.has(input) || input.closest?.(".desktop-input-layout")) return;
    const wrapper = documentRef.createElement("span");
    wrapper.className = "desktop-input-layout";
    if (input.tagName === "TEXTAREA") wrapper.classList.add("for-textarea");
    if (input.closest?.(".search-field")) wrapper.classList.add("with-search-clear");

    const controls = documentRef.createElement("span");
    controls.className = "desktop-input-layout-controls";
    const modeButton = documentRef.createElement("button");
    modeButton.className = "desktop-input-layout-mode";
    modeButton.type = "button";
    const muteButton = documentRef.createElement("button");
    muteButton.className = "desktop-input-layout-mute";
    muteButton.type = "button";
    controls.append(modeButton, muteButton);
    input.before(wrapper);
    wrapper.append(input, controls);

    const state = {
      controls,
      input,
      modeButton,
      muteButton,
      muted: false,
      normalizer: createDesktopInputNormalizer({ initialMode: "RU", initialValue: input.value }),
      wrapper
    };
    states.set(input, state);
    modeButton.addEventListener("click", () => {
      if (state.muted) state.muted = false;
      else state.normalizer.toggleMode();
      state.normalizer.sync(input.value);
      syncUi(state);
      input.focus();
    });
    muteButton.addEventListener("click", () => {
      state.muted = !state.muted;
      state.normalizer.sync(input.value);
      syncUi(state);
      input.focus();
    });
    syncUi(state);
  };

  const enabled = () => shouldEnableDesktopInputLayout({
    language: getLanguage(),
    desktopMatches: Boolean(media.matches)
  });

  const refresh = () => {
    refreshFrame = null;
    if (!enabled()) {
      [...states.keys()].forEach(detach);
      return;
    }
    [...states.keys()].forEach((input) => {
      if (!input.isConnected || input.disabled || input.readOnly || !input.matches?.(selector)) detach(input);
      else syncUi(states.get(input));
    });
    documentRef.querySelectorAll?.(selector).forEach((input) => {
      if (!input.disabled && !input.readOnly) attach(input);
    });
  };

  const scheduleRefresh = () => {
    if (refreshFrame !== null) return;
    if (typeof windowRef.requestAnimationFrame === "function") {
      refreshFrame = windowRef.requestAnimationFrame(refresh);
      return;
    }
    if (typeof windowRef.setTimeout === "function") {
      refreshFrame = windowRef.setTimeout(refresh, 0);
      return;
    }
    refresh();
  };

  const onInput = (event) => {
    const state = states.get(event.target);
    if (!state) return;
    if (state.muted || event.isComposing) {
      state.normalizer.sync(state.input.value);
      return;
    }
    state.normalizer.normalizeInput(state.input);
  };

  const onFocus = (event) => {
    states.get(event.target)?.normalizer.sync(event.target.value);
  };

  documentRef.addEventListener?.("input", onInput, true);
  documentRef.addEventListener?.("focusin", onFocus, true);
  const observer = typeof windowRef.MutationObserver === "function"
    ? new windowRef.MutationObserver(scheduleRefresh)
    : null;
  observer?.observe(documentRef.documentElement, {
    attributes: true,
    attributeFilter: ["disabled", "lang", "readonly"],
    childList: true,
    subtree: true
  });
  media.addEventListener?.("change", scheduleRefresh);
  refresh();

  return {
    refresh,
    destroy() {
      if (refreshFrame !== null) {
        windowRef.cancelAnimationFrame?.(refreshFrame);
        windowRef.clearTimeout?.(refreshFrame);
      }
      observer?.disconnect();
      media.removeEventListener?.("change", scheduleRefresh);
      documentRef.removeEventListener?.("input", onInput, true);
      documentRef.removeEventListener?.("focusin", onFocus, true);
      [...states.keys()].forEach(detach);
    }
  };
}
