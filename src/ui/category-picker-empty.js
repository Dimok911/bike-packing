import { escapeHtml } from "../utils/html.js";

export function normalizeInlineCategoryName(value) {
  return String(value || "").trim();
}

export function renderEmptyCategoryPicker({
  hint = "",
  placeholder = "",
  actionText = ""
} = {}) {
  return `
    <div class="category-picker-empty">
      <span>${escapeHtml(hint)}</span>
      <div class="category-picker-create-row">
        <input
          type="text"
          data-new-category-input
          placeholder="${escapeHtml(placeholder)}"
          aria-label="${escapeHtml(placeholder)}"
        />
        <button type="button" data-add-category-inline disabled>${escapeHtml(actionText)}</button>
      </div>
    </div>
  `;
}

export function bindEmptyCategoryPicker(target, {
  onCreate = () => false
} = {}) {
  const input = target?.querySelector?.("[data-new-category-input]");
  const button = target?.querySelector?.("[data-add-category-inline]");
  if (!input || !button) return;

  const updateButton = () => {
    button.disabled = !normalizeInlineCategoryName(input.value);
  };
  const submit = () => {
    const value = normalizeInlineCategoryName(input.value);
    if (!value) return;
    onCreate(value);
  };

  input.addEventListener("input", updateButton);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    submit();
  });
  button.addEventListener("click", submit);
  updateButton();
}
