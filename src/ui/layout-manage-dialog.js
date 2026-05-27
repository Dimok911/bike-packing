export function layoutEditTitle(layout) {
  return layout?.adminDemo || layout?.adminSharedSourceId ? "Редактировать шаблон" : "Редактировать укладку";
}

export function publicTemplateOptionLabel({ prefix, name, languageLabel }) {
  return `${prefix}: ${name} (${languageLabel})`;
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
  const shouldCopy = normalizedMode === "copy";
  const shouldCreateFromTemplate = isLayoutCreateTemplateLayoutMode(normalizedMode);
  const shouldCopyTemplate = normalizedMode === "template-copy";
  const shouldPickTemplate = normalizedMode === "template" || normalizedMode === "demo-template" || normalizedMode === "shared-template";
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
  return !text || /^Новая укладка( \d+)?$/.test(text) || /^Шаблон( \d+)?$/.test(text);
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
  if (mode === "template-copy") return uniquePublishedTemplateName(selectedSourceName || "Шаблон");
  if (isLayoutCreateTemplateLayoutMode(mode)) return uniqueLayoutName(selectedSourceName || "Новая укладка");
  if (mode !== "template" && mode !== "demo-template" && mode !== "shared-template") return "";
  const fallback = kind === "demo" ? demoTemplateFallbackName(language) : "Новый шаблон";
  return uniquePublishedTemplateName(fallback);
}

export function privateLayoutDeleteConfirm({ layout, containerCount, itemText, isLastLayout }) {
  return {
    title: "Удалить укладку?",
    text: `«${layout?.name || "Укладка"}» будет удалена из списка укладок.`,
    highlightText: `${containerCount} сумок/контейнеров, ${itemText} исчезнут только из этой укладки.\nСами вещи и сумки останутся во вкладках «Вещи» и «Сумки».${isLastLayout ? "\nЭто последняя укладка, вместо неё будет создана пустая." : ""}`,
    okText: "Удалить",
    tone: "danger"
  };
}

export function publicLayoutDeleteConfirm({ layout, containerCount, itemText, deletePublished = false }) {
  const serverText = deletePublished
    ? "Опубликованный шаблон будет удален с сервера и из публичного списка шаблонов."
    : "Опубликованная версия на сервере не удаляется.";
  return {
    title: "Удалить шаблон?",
    text: `«${layout?.name || "Шаблон"}» будет удален из локальных шаблонов для правки.`,
    highlightText: `${containerCount} сумок/контейнеров, ${itemText} исчезнут из этого локального шаблона. ${serverText}`,
    okText: "Удалить",
    tone: "danger"
  };
}
