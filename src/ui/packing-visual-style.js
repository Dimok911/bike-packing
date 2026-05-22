export const PACKING_VISUAL_STYLE_DEFAULT = "default";
export const PACKING_VISUAL_STYLE_PRIMARY = "text-hierarchy";
export const PACKING_VISUAL_STYLE_SETTINGS_VERSION = 2;
export const PACKING_VISUAL_STYLE_OPTIONS = [
  { value: PACKING_VISUAL_STYLE_DEFAULT, label: "0. Текущий вид" },
  { value: "soft-nested", label: "1. Тёплые списки + тихие кнопки" },
  { value: "separated-axis", label: "2. Корни сверху, вложенность слева" },
  { value: "folder-nested", label: "3. Вариант 2 + тихие кнопки" },
  { value: "text-hierarchy", label: "4. Вариант 3 + бледные линии" },
  { value: "depth-markers", label: "5. Разные цвета глубины" },
  { value: "quiet-tools", label: "6. Только тихие кнопки" },
  { value: "calm-combined", label: "1+2. Спокойный гибрид" }
];

const PACKING_VISUAL_STYLE_CLASS_PREFIX = "packing-visual-";
const PACKING_VISUAL_STYLE_CLASS_NAMES = PACKING_VISUAL_STYLE_OPTIONS
  .filter((option) => option.value !== PACKING_VISUAL_STYLE_DEFAULT)
  .map((option) => `${PACKING_VISUAL_STYLE_CLASS_PREFIX}${option.value}`);

export function normalizePackingVisualStyle(value) {
  const style = String(value || "").trim();
  if (!style || style === PACKING_VISUAL_STYLE_DEFAULT) return PACKING_VISUAL_STYLE_PRIMARY;
  return PACKING_VISUAL_STYLE_OPTIONS.some((option) => option.value === style)
    ? style
    : PACKING_VISUAL_STYLE_PRIMARY;
}

export function applyPackingVisualStyleClass(target, value) {
  const style = normalizePackingVisualStyle(value);
  target?.classList?.remove(...PACKING_VISUAL_STYLE_CLASS_NAMES);
  if (style !== PACKING_VISUAL_STYLE_DEFAULT) {
    target?.classList?.add(`${PACKING_VISUAL_STYLE_CLASS_PREFIX}${style}`);
  }
  return style;
}

export function packingVisualStyleButtonLabel(option) {
  return String(option?.label || "").split(".")[0].trim() || option?.value || "";
}
