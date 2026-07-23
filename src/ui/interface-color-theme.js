export const DEFAULT_INTERFACE_COLOR_THEME = "jade";
export const DEFAULT_INTERFACE_COLOR_BRIGHTNESS = 100;
export const MIN_INTERFACE_COLOR_BRIGHTNESS = 70;
export const MAX_INTERFACE_COLOR_BRIGHTNESS = 130;

export const INTERFACE_COLOR_THEME_OPTIONS = Object.freeze([
  Object.freeze({ value: "jade", hue: 165, saturation: 70, browserColor: "#147a62", labelKey: "interfaceColor.jade" }),
  Object.freeze({ value: "emerald", hue: 130, saturation: 82, browserColor: "#16833f", labelKey: "interfaceColor.emerald" }),
  Object.freeze({ value: "ocean", hue: 188, saturation: 88, browserColor: "#087f91", labelKey: "interfaceColor.ocean" }),
  Object.freeze({ value: "sapphire", hue: 214, saturation: 86, browserColor: "#1557a0", labelKey: "interfaceColor.sapphire" }),
  Object.freeze({ value: "indigo", hue: 244, saturation: 78, browserColor: "#4338a8", labelKey: "interfaceColor.indigo" }),
  Object.freeze({ value: "amethyst", hue: 274, saturation: 76, browserColor: "#7030a5", labelKey: "interfaceColor.amethyst" }),
  Object.freeze({ value: "plum", hue: 306, saturation: 84, browserColor: "#9b278e", labelKey: "interfaceColor.plum" }),
  Object.freeze({ value: "berry", hue: 332, saturation: 90, browserColor: "#b12565", labelKey: "interfaceColor.berry" }),
  Object.freeze({ value: "ruby", hue: 354, saturation: 92, browserColor: "#b52335", labelKey: "interfaceColor.ruby" }),
  Object.freeze({ value: "coral", hue: 14, saturation: 94, browserColor: "#bd492c", labelKey: "interfaceColor.coral" }),
  Object.freeze({ value: "amber", hue: 42, saturation: 96, browserColor: "#b27608", labelKey: "interfaceColor.amber" })
]);

const THEME_BY_VALUE = new Map(
  INTERFACE_COLOR_THEME_OPTIONS.map((option) => [option.value, option])
);

export function normalizeInterfaceColorBrightness(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_INTERFACE_COLOR_BRIGHTNESS;
  return Math.min(
    MAX_INTERFACE_COLOR_BRIGHTNESS,
    Math.max(MIN_INTERFACE_COLOR_BRIGHTNESS, Math.round(numeric))
  );
}

function brightnessLightness(brightness, base, scale) {
  const value = base + (normalizeInterfaceColorBrightness(brightness) - 100) * scale;
  return `${Math.round(value * 10) / 10}%`;
}

export function normalizeInterfaceColorTheme(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return THEME_BY_VALUE.has(normalized) ? normalized : DEFAULT_INTERFACE_COLOR_THEME;
}

export function interfaceColorThemeOption(value) {
  return THEME_BY_VALUE.get(normalizeInterfaceColorTheme(value));
}

export function applyInterfaceColorTheme({
  brightness = DEFAULT_INTERFACE_COLOR_BRIGHTNESS,
  documentRef = document,
  value = DEFAULT_INTERFACE_COLOR_THEME
} = {}) {
  const option = interfaceColorThemeOption(value);
  const normalizedBrightness = normalizeInterfaceColorBrightness(brightness);
  const root = documentRef.documentElement;
  if (root?.dataset) root.dataset.interfaceColorTheme = option.value;
  root?.style?.setProperty?.("--interface-hue", `${option.hue}deg`);
  root?.style?.setProperty?.("--interface-accent-saturation", `${option.saturation}%`);
  root?.style?.setProperty?.("--interface-medium-saturation", `${Math.round(option.saturation * 0.62)}%`);
  root?.style?.setProperty?.("--interface-soft-saturation", `${Math.round(option.saturation * 0.48)}%`);
  root?.style?.setProperty?.("--interface-accent-lightness", brightnessLightness(normalizedBrightness, 28, 0.16));
  root?.style?.setProperty?.("--interface-dark-lightness", brightnessLightness(normalizedBrightness, 23, 0.12));
  root?.style?.setProperty?.("--interface-darker-lightness", brightnessLightness(normalizedBrightness, 17, 0.1));
  documentRef.querySelector?.('meta[name="theme-color"]')?.setAttribute?.("content", option.browserColor);
  return option.value;
}

export function createInterfaceColorThemeController({
  brightnessInput,
  brightnessOutput,
  defaultButton,
  documentRef = document,
  dialog,
  getLanguage = () => documentRef.documentElement?.lang || "ru",
  initialBrightness = DEFAULT_INTERFACE_COLOR_BRIGHTNESS,
  initialValue = DEFAULT_INTERFACE_COLOR_THEME,
  menuButton,
  onBrightnessChange = () => {},
  onChange = () => {},
  openDialog = (target) => target?.showModal?.(),
  optionsRoot,
  translate = (key) => key
} = {}) {
  let activeBrightness = normalizeInterfaceColorBrightness(initialBrightness);
  let activeValue = applyInterfaceColorTheme({
    brightness: activeBrightness,
    documentRef,
    value: initialValue
  });

  const syncBrightnessUi = () => {
    if (brightnessInput && String(brightnessInput.value) !== String(activeBrightness)) {
      brightnessInput.value = String(activeBrightness);
    }
    if (brightnessOutput) {
      const text = `${activeBrightness}%`;
      brightnessOutput.value = text;
      brightnessOutput.textContent = text;
    }
  };

  const render = () => {
    if (!optionsRoot) return;
    const language = getLanguage();
    optionsRoot.setAttribute("lang", language);
    optionsRoot.replaceChildren(...INTERFACE_COLOR_THEME_OPTIONS.map((option) => {
      const button = documentRef.createElement("button");
      const active = option.value === activeValue;
      button.type = "button";
      button.className = "interface-color-option";
      button.dataset.interfaceColorTheme = option.value;
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(active));
      button.classList.toggle("active", active);
      button.style.setProperty("--theme-option-hue", `${option.hue}deg`);
      button.style.setProperty("--theme-option-saturation", `${option.saturation}%`);
      button.style.setProperty("--theme-option-soft-saturation", `${Math.round(option.saturation * 0.48)}%`);
      button.style.setProperty(
        "--theme-option-preview-lightness",
        brightnessLightness(activeBrightness, 38, 0.2)
      );

      const swatch = documentRef.createElement("span");
      swatch.className = "interface-color-option-swatch";
      swatch.setAttribute("aria-hidden", "true");

      const label = documentRef.createElement("span");
      label.className = "interface-color-option-label";
      label.textContent = translate(option.labelKey);

      const check = documentRef.createElement("span");
      check.className = "interface-color-option-check";
      check.setAttribute("aria-hidden", "true");
      check.textContent = "✓";

      button.append(swatch, label, check);
      return button;
    }));
  };

  const setValue = (value, { notify = true } = {}) => {
    const nextValue = applyInterfaceColorTheme({
      brightness: activeBrightness,
      documentRef,
      value
    });
    const changed = nextValue !== activeValue;
    activeValue = nextValue;
    render();
    if (changed && notify) onChange(activeValue);
    return activeValue;
  };

  const setBrightness = (value, { notify = true } = {}) => {
    const nextBrightness = normalizeInterfaceColorBrightness(value);
    const changed = nextBrightness !== activeBrightness;
    activeBrightness = nextBrightness;
    applyInterfaceColorTheme({
      brightness: activeBrightness,
      documentRef,
      value: activeValue
    });
    syncBrightnessUi();
    render();
    if (changed && notify) onBrightnessChange(activeBrightness);
    return activeBrightness;
  };

  const reset = () => {
    const colorChanged = activeValue !== DEFAULT_INTERFACE_COLOR_THEME;
    const brightnessChanged = activeBrightness !== DEFAULT_INTERFACE_COLOR_BRIGHTNESS;
    setValue(DEFAULT_INTERFACE_COLOR_THEME, { notify: false });
    setBrightness(DEFAULT_INTERFACE_COLOR_BRIGHTNESS, { notify: false });
    if (colorChanged) onChange(activeValue);
    if (brightnessChanged) onBrightnessChange(activeBrightness);
  };

  const handleOptionClick = (event) => {
    const button = event.target.closest?.("[data-interface-color-theme]");
    if (!button || !optionsRoot?.contains?.(button)) return;
    setValue(button.dataset.interfaceColorTheme);
  };

  const open = () => {
    render();
    syncBrightnessUi();
    openDialog(dialog);
  };

  const handleBrightnessInput = () => setBrightness(brightnessInput?.value);
  optionsRoot?.addEventListener?.("click", handleOptionClick);
  brightnessInput?.addEventListener?.("input", handleBrightnessInput);
  defaultButton?.addEventListener?.("click", reset);
  menuButton?.addEventListener?.("click", open);
  syncBrightnessUi();
  render();

  return {
    getBrightness: () => activeBrightness,
    getValue: () => activeValue,
    open,
    refresh: render,
    reset,
    setBrightness,
    setValue,
    destroy() {
      optionsRoot?.removeEventListener?.("click", handleOptionClick);
      brightnessInput?.removeEventListener?.("input", handleBrightnessInput);
      defaultButton?.removeEventListener?.("click", reset);
      menuButton?.removeEventListener?.("click", open);
    }
  };
}
