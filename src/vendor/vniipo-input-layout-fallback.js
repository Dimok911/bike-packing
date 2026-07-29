(function installVniipoInputLayout(global) {
  "use strict";

  const VERSION = "1.0.1";
  const CONTRACT_VERSION = 1;
  const STYLE_ID = "vniipo-input-layout-v1-styles";
  const LATIN_LAYOUT = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
  const RU_LAYOUT = "ёйцукенгшщзхъфывапролджэячсмитьбю.";
  const MUTE_ICONS = Object.freeze({
    disable: "⏸",
    enable: "▶"
  });
  const DEFAULT_SELECTOR = [
    'input[type="text"]:not([data-input-layout="off"])',
    'input[type="search"]:not([data-input-layout="off"])',
    'input:not([type]):not([data-input-layout="off"])',
    'textarea:not([data-input-layout="off"])'
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

  function convertLatinToRuLayout(value) {
    return convertByMap(value, latinToRuMap);
  }

  function convertRuToLatinLayout(value) {
    return convertByMap(value, ruToLatinMap);
  }

  function isExternalTextInsertion(event) {
    return event?.inputType === "insertFromPaste"
      || event?.inputType === "insertFromDrop"
      || event?.inputType === "insertFromYank";
  }

  function createInputNormalizer({ initialMode = "RU", initialValue = "" } = {}) {
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
        ) prefixLength += 1;

        let suffixLength = 0;
        while (
          suffixLength < minimumLength - prefixLength
          && previous.charCodeAt(previous.length - 1 - suffixLength)
            === raw.charCodeAt(raw.length - 1 - suffixLength)
        ) suffixLength += 1;

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

  function shouldEnable({ language = "", desktopMatches = false } = {}) {
    return String(language || "").toLowerCase() === "ru" && desktopMatches === true;
  }

  function translatedText(translate, key, fallback) {
    const value = typeof translate === "function" ? translate(key) : "";
    return value && value !== key ? value : fallback;
  }

  function ensureStyles(doc) {
    if (!doc?.head || !doc?.createElement || doc.getElementById?.(STYLE_ID)) return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.desktop-input-layout{position:relative;display:block;width:100%;min-width:0}
.desktop-input-layout>input,.desktop-input-layout>textarea{display:block;width:100%;padding-right:82px!important}
.desktop-input-layout>input[type="search"]{-webkit-appearance:none;appearance:none}
.desktop-input-layout>input[type="search"]::-webkit-search-cancel-button,.desktop-input-layout>input[type="search"]::-webkit-search-decoration,.desktop-input-layout>input[type="search"]::-webkit-search-results-button,.desktop-input-layout>input[type="search"]::-webkit-search-results-decoration{-webkit-appearance:none;appearance:none}
.desktop-input-layout.with-search-clear>input,.desktop-input-layout.with-search-icon>input{padding-right:122px!important}
.desktop-input-layout-controls{position:absolute;top:50%;right:8px;z-index:3;display:flex;align-items:center;gap:4px;transform:translateY(-50%)}
.desktop-input-layout.with-search-clear .desktop-input-layout-controls,.desktop-input-layout.with-search-icon .desktop-input-layout-controls{right:40px}
.desktop-input-layout.for-textarea .desktop-input-layout-controls{top:8px;transform:none}
.desktop-input-layout-controls button{display:grid;place-items:center;margin:0;min-width:0;min-height:0;padding:0;border:0;cursor:pointer}
.desktop-input-layout-mode{width:34px;height:24px;border:1px solid var(--input-layout-border,rgba(18,63,54,.35))!important;border-radius:999px;color:var(--input-layout-accent,#123f36);background:var(--input-layout-soft,#edf4ee);font:900 11px/1 system-ui,sans-serif;letter-spacing:.03em}
.desktop-input-layout-mute{position:relative;width:28px;height:28px;border-radius:8px;color:var(--input-layout-accent,#123f36);background:transparent;font:900 13px/1 system-ui,sans-serif}
.desktop-input-layout-mode:hover,.desktop-input-layout-mode:focus-visible,.desktop-input-layout-mute:hover,.desktop-input-layout-mute:focus-visible{outline:0;background:var(--input-layout-hover,#dce9e1)}
.desktop-input-layout.is-muted .desktop-input-layout-mode,.desktop-input-layout-mute.is-muted{color:#7d8782;border-color:#cdd4d0!important;background:#eef1ef}
@media (max-width:768px),(hover:none),(pointer:coarse){.desktop-input-layout-controls{display:none!important}.desktop-input-layout>input,.desktop-input-layout.with-search-clear>input,.desktop-input-layout.with-search-icon>input,.desktop-input-layout>textarea{padding-right:11px!important}}
`;
    doc.head.appendChild(style);
  }

  function createController({
    desktopMediaQuery = "(min-width: 769px) and (hover: hover) and (pointer: fine)",
    documentRef = global.document,
    getLanguage = () => documentRef?.documentElement?.lang || "",
    selector = DEFAULT_SELECTOR,
    translate = (key) => key,
    windowRef = global
  } = {}) {
    if (!documentRef || !windowRef) return { refresh() {}, destroy() {} };
    ensureStyles(documentRef);
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
      state.modeButton.textContent = mode;
      state.modeButton.classList.toggle("is-muted", state.muted);
      state.modeButton.setAttribute("aria-label", `${text.switchMode}: ${mode === "RU" ? text.ru : text.en}`);
      state.modeButton.title = state.modeButton.getAttribute("aria-label");
      state.muteButton.textContent = state.muted ? MUTE_ICONS.enable : MUTE_ICONS.disable;
      state.muteButton.classList.toggle("is-muted", state.muted);
      state.muteButton.setAttribute("aria-pressed", state.muted ? "true" : "false");
      state.muteButton.setAttribute("aria-label", state.muted ? text.enable : text.disable);
      state.muteButton.title = state.muteButton.getAttribute("aria-label");
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
      if (input.closest?.(".search-box")) wrapper.classList.add("with-search-icon");
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
        input,
        modeButton,
        muteButton,
        muted: false,
        skipNextInput: false,
        normalizer: createInputNormalizer({ initialValue: input.value }),
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

    const enabled = () => shouldEnable({
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
      refreshFrame = windowRef.requestAnimationFrame?.(refresh)
        ?? windowRef.setTimeout?.(refresh, 0)
        ?? null;
      if (refreshFrame === null) refresh();
    };
    const markExternalInsertion = (event) => {
      const state = states.get(event.target);
      if (state) state.skipNextInput = true;
    };
    const onInput = (event) => {
      const state = states.get(event.target);
      if (!state) return;
      if (state.muted || event.isComposing || state.skipNextInput || isExternalTextInsertion(event)) {
        state.skipNextInput = false;
        state.normalizer.sync(state.input.value);
        return;
      }
      state.normalizer.normalizeInput(state.input);
    };
    const onFocus = (event) => {
      states.get(event.target)?.normalizer.sync(event.target.value);
    };

    documentRef.addEventListener?.("paste", markExternalInsertion, true);
    documentRef.addEventListener?.("drop", markExternalInsertion, true);
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
        documentRef.removeEventListener?.("paste", markExternalInsertion, true);
        documentRef.removeEventListener?.("drop", markExternalInsertion, true);
        documentRef.removeEventListener?.("input", onInput, true);
        documentRef.removeEventListener?.("focusin", onFocus, true);
        [...states.keys()].forEach(detach);
      }
    };
  }

  const api = Object.freeze({
    version: VERSION,
    contractVersion: CONTRACT_VERSION,
    defaultSelector: DEFAULT_SELECTOR,
    muteIcons: MUTE_ICONS,
    convertLatinToRuLayout,
    convertRuToLatinLayout,
    createInputNormalizer,
    createController,
    isExternalTextInsertion,
    shouldEnable,
    ensureStyles
  });
  global.VniipoInputLayout = api;
  global.dispatchEvent?.(new global.CustomEvent("vniipo-input-layout-ready", {
    detail: { version: VERSION, contractVersion: CONTRACT_VERSION }
  }));
})(typeof window !== "undefined" ? window : globalThis);
