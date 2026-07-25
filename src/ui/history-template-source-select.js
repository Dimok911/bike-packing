const normalizeText = (value) => String(value || "").trim();

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function optionValue(option) {
  return normalizeText(option?.value || option?.listId || option?.id);
}

function isDeletedHistoryOption(option) {
  return option?.historyOnly === true || normalizeText(option?.visibility).toLowerCase() === "deleted";
}

function deletedHistoryDate(option, language) {
  const value = normalizeText(option?.deletedAt || option?.createdAt || option?.updatedAt);
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language === "ru" ? "ru-RU" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function historyTemplateSourceModel(options = [], {
  language = "en",
  selectedValue = "",
  showDeleted = false,
  t = () => ""
} = {}) {
  const seen = new Set();
  const normalized = (Array.isArray(options) ? options : [])
    .map((option) => {
      const value = optionValue(option);
      if (!value || seen.has(value)) return null;
      seen.add(value);
      const label = normalizeText(option?.label || option?.name || value) || value;
      const deleted = isDeletedHistoryOption(option);
      const date = deleted ? deletedHistoryDate(option, language) : "";
      return {
        ...option,
        value,
        label,
        deleted,
        displayLabel: deleted
          ? t(date ? "history.deletedTemplateOption" : "history.deletedTemplateOptionNoDate", {
            name: label,
            date
          })
          : label
      };
    })
    .filter(Boolean);

  const current = normalized.filter((option) => !option.deleted);
  const deleted = normalized.filter((option) => option.deleted);
  const visible = showDeleted ? [...current, ...deleted] : current;
  const requested = normalizeText(selectedValue);
  const selected = visible.some((option) => option.value === requested)
    ? requested
    : (current[0]?.value || (showDeleted ? deleted[0]?.value : "") || "");

  const groups = [
    current.length ? {
      label: t("history.currentTemplatesGroup"),
      options: current
    } : null,
    showDeleted && deleted.length ? {
      label: t("history.deletedTemplatesGroup"),
      options: deleted
    } : null
  ].filter(Boolean);

  const html = groups.map((group) => (
    `<optgroup label="${escapeHtml(group.label)}">` +
      group.options.map((option) => (
        `<option value="${escapeHtml(option.value)}">${escapeHtml(option.displayLabel)}</option>`
      )).join("") +
    "</optgroup>"
  )).join("");

  return {
    current,
    deleted,
    deletedCount: deleted.length,
    html,
    selected
  };
}

export function renderHistoryTemplateSourceSelect({
  language = "en",
  options = [],
  select,
  selectedValue = "",
  showDeleted = false,
  t = () => "",
  toggleButton
} = {}) {
  const model = historyTemplateSourceModel(options, {
    language,
    selectedValue,
    showDeleted,
    t
  });
  if (select) {
    select.innerHTML = model.html;
    select.value = model.selected;
  }
  if (toggleButton) {
    toggleButton.hidden = model.deletedCount === 0;
    toggleButton.dataset.showDeleted = String(Boolean(showDeleted));
    toggleButton.setAttribute("aria-expanded", String(Boolean(showDeleted)));
    toggleButton.textContent = t(
      showDeleted ? "history.hideDeletedTemplates" : "history.showDeletedTemplates",
      { count: model.deletedCount }
    );
  }
  return model;
}

export function toggleHistoryDeletedSources(button) {
  const showDeleted = button?.dataset.showDeleted !== "true";
  if (button) {
    button.dataset.showDeleted = String(showDeleted);
    button.setAttribute("aria-expanded", String(showDeleted));
  }
  return showDeleted;
}
