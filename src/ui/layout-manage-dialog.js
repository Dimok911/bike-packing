export function layoutEditTitle(layout) {
  return layout?.adminDemo || layout?.adminSharedSourceId ? "Edit template" : "Edit layout";
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
  if (mode === "template-copy") return uniquePublishedTemplateName(selectedSourceName || "Template");
  if (isLayoutCreateTemplateLayoutMode(mode)) return uniqueLayoutName(selectedSourceName || "New layout");
  if (mode !== "template" && mode !== "demo-template" && mode !== "shared-template") return "";
  const fallback = kind === "demo" ? demoTemplateFallbackName(language) : "New template";
  return uniquePublishedTemplateName(fallback);
}

export function privateLayoutDeleteConfirm({ layout, containerCount, itemText, isLastLayout }) {
  const containerText = `${containerCount} ${containerCount === 1 ? "bag/container" : "bags/containers"}`;
  return {
    title: "Delete layout?",
    text: `“${layout?.name || "Layout"}” will be removed from the layout list.`,
    highlightText: `${containerText} and ${itemText} will disappear only from this layout.\nThe items and bags themselves will stay on the Items and Bags tabs.${isLastLayout ? "\nThis is the last layout, so an empty one will be created instead." : ""}`,
    okText: "Delete",
    tone: "danger"
  };
}

export function publicLayoutDeleteConfirm({ layout, containerCount, itemText, deletePublished = false }) {
  const containerText = `${containerCount} ${containerCount === 1 ? "bag/container" : "bags/containers"}`;
  const serverText = deletePublished
    ? "The published template will be deleted from the server and the public template list."
    : "The published version on the server will not be deleted.";
  return {
    title: "Delete template?",
    text: `“${layout?.name || "Template"}” will be removed from local editable templates.`,
    highlightText: `${containerText} and ${itemText} will disappear from this local template. ${serverText}`,
    okText: "Delete",
    tone: "danger"
  };
}
