import { currentDocumentLanguage } from "../utils/language.js";
import { managedTemplateOptionLabel } from "../public/template-publication.js";

function isEnglish() {
  return currentDocumentLanguage() === "en";
}

function localText(en, ru) {
  return isEnglish() ? en : ru;
}

function quoteName(name) {
  return isEnglish() ? `“${name}”` : `«${name}»`;
}

function containerText(count) {
  if (isEnglish()) return `${count} ${count === 1 ? "bag/container" : "bags/containers"}`;
  const abs = Math.abs(Number(count) || 0);
  const last = abs % 10;
  const lastTwo = abs % 100;
  const word = last === 1 && lastTwo !== 11
    ? "сумка/контейнер"
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? "сумки/контейнера"
      : "сумок/контейнеров";
  return `${count} ${word}`;
}

export function layoutEditTitle(layout) {
  if (layout?.adminDemo || layout?.adminSharedSourceId) return localText("Edit template", "Редактировать шаблон");
  return localText("Edit layout", "Редактировать укладку");
}

export function publicTemplateOptionLabel({ prefix, name, languageLabel, unpublished = false, draftMarker = "" }) {
  return managedTemplateOptionLabel(`${prefix}: ${name} (${languageLabel})`, {
    draftMarker,
    unpublished
  });
}

export function layoutSourceNameFromOptionLabel(label = "") {
  return String(label || "")
    .trim()
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/^[^:]+:\s*/, "")
    .replace(/\s+\([^)]+\)\s*$/, "")
    .trim();
}

export function isLayoutCreateTemplateLayoutMode(mode) {
  return mode === "from-template-layout";
}

export function layoutCreateModeState(mode, { canCreateTemplates = false } = {}) {
  let normalizedMode = String(mode || "");
  const templateModes = ["from-template-layout", "template", "template-copy", "demo-template", "shared-template"];
  if (!canCreateTemplates && templateModes.includes(normalizedMode)) normalizedMode = "empty";
  if (normalizedMode === "template") normalizedMode = "demo-template";
  const shouldCopy = normalizedMode === "copy";
  const shouldCreateFromTemplate = isLayoutCreateTemplateLayoutMode(normalizedMode);
  const shouldCopyTemplate = normalizedMode === "template-copy";
  const shouldPickTemplate = normalizedMode === "demo-template" || normalizedMode === "shared-template";
  return {
    mode: normalizedMode,
    shouldCopy,
    shouldCopyTemplate,
    shouldCreateFromTemplate,
    shouldPickSource: shouldCopy || shouldCreateFromTemplate || shouldCopyTemplate,
    shouldPickTemplate
  };
}

export function layoutCreateCopySourceOptions({
  adminPublicLayoutOptions = [],
  canUsePrivateState = false,
  guestDemoCopyFlag = "",
  includeTemplates = false,
  layouts = {},
  templates = false
} = {}) {
  const personalLayouts = canUsePrivateState
    ? Object.values(layouts || {}).filter((layout) => !layout.adminDemo && !layout.adminSharedSourceId)
    : Object.values(layouts || {}).filter((layout) => layout?.[guestDemoCopyFlag]);
  if (templates) return adminPublicLayoutOptions;
  const personalOptions = personalLayouts.map((layout) => [layout.id, layout.name, "personal"]);
  return includeTemplates ? [...adminPublicLayoutOptions, ...personalOptions] : personalOptions;
}

export function canReplaceLayoutCreateNameSuggestion(value, { force = false } = {}) {
  if (force) return true;
  const text = String(value || "").trim();
  return !text ||
    /^New layout( \d+)?$/i.test(text) ||
    /^Template( \d+)?$/i.test(text) ||
    /^Новая укладка( \d+)?$/.test(text) ||
    /^Шаблон( \d+)?$/.test(text);
}

export function suggestedLayoutCreateName({
  demoTemplateFallbackName = () => "Шаблон",
  kind = "demo",
  mode = "",
  selectedSourceName = "",
  uniqueLayoutName = (value) => value,
  uniquePublishedTemplateName = (value) => value,
  language = ""
} = {}) {
  if (mode === "template-copy") return uniquePublishedTemplateName(selectedSourceName || localText("Template", "Шаблон"));
  if (isLayoutCreateTemplateLayoutMode(mode)) return uniqueLayoutName(selectedSourceName || localText("New layout", "Новая укладка"));
  if (mode !== "template" && mode !== "demo-template" && mode !== "shared-template") return "";
  const fallback = kind === "demo" ? demoTemplateFallbackName(language) : localText("New template", "Новый шаблон");
  return uniquePublishedTemplateName(fallback);
}

export function privateLayoutDeleteConfirm({ layout, containerCount, itemText, isLastLayout }) {
  if (isEnglish()) {
    return {
      title: "Delete layout?",
      text: `${quoteName(layout?.name || "Layout")} will be removed from the layout list.`,
      highlightText: `${containerText(containerCount)} and ${itemText} will disappear only from this layout.\nThe items and bags themselves will stay on the Items and Bags tabs.${isLastLayout ? "\nThis is the last layout, so an empty one will be created instead." : ""}`,
      okText: "Delete",
      tone: "danger"
    };
  }
  return {
    title: "Удалить укладку?",
    text: `${quoteName(layout?.name || "Укладка")} будет удалена из списка укладок.`,
    highlightText: `${containerText(containerCount)}, ${itemText} исчезнут только из этой укладки.\nСами вещи и сумки останутся во вкладках «Вещи» и «Сумки».${isLastLayout ? "\nЭто последняя укладка, вместо неё будет создана пустая." : ""}`,
    okText: "Удалить",
    tone: "danger"
  };
}

export function publicLayoutDeleteConfirm({ layout, containerCount, itemText, deletePublished = false }) {
  if (isEnglish()) {
    const serverText = deletePublished
      ? "The template will disappear from the public list, while its server history and photos will be kept. It can be restored from History."
      : "The published version on the server will not be deleted.";
    return {
      title: "Delete template?",
      text: `${quoteName(layout?.name || "Template")} will be removed from local editable templates.`,
      highlightText: `${containerText(containerCount)} and ${itemText} will disappear from this local template. ${serverText}`,
      okText: "Delete",
      tone: "danger"
    };
  }
  const serverText = deletePublished
    ? "Шаблон исчезнет из публичного списка, но его серверная история и фотографии сохранятся. Его можно будет восстановить из истории."
    : "Опубликованная версия на сервере удалена не будет.";
  return {
    title: "Удалить шаблон?",
    text: `${quoteName(layout?.name || "Шаблон")} будет удалён из локальных редактируемых шаблонов.`,
    highlightText: `${containerText(containerCount)}, ${itemText} исчезнут из этого локального шаблона. ${serverText}`,
    okText: "Удалить",
    tone: "danger"
  };
}
