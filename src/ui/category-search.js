import { escapeHtml } from "../utils/html.js";

export function normalizeCategorySearchQuery(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

export function categoryMatchesSearch(label, query) {
  const normalizedQuery = normalizeCategorySearchQuery(query);
  if (!normalizedQuery) return true;
  return String(label || "").toLocaleLowerCase().includes(normalizedQuery);
}

export function highlightCategorySearchMatch(label, query) {
  const text = String(label || "");
  const normalizedQuery = normalizeCategorySearchQuery(query);
  if (!normalizedQuery) return escapeHtml(text);

  const normalizedText = text.toLocaleLowerCase();
  const parts = [];
  let cursor = 0;
  let matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
  while (matchIndex >= 0) {
    parts.push(escapeHtml(text.slice(cursor, matchIndex)));
    parts.push(`<mark>${escapeHtml(text.slice(matchIndex, matchIndex + normalizedQuery.length))}</mark>`);
    cursor = matchIndex + normalizedQuery.length;
    matchIndex = normalizedText.indexOf(normalizedQuery, cursor);
  }
  parts.push(escapeHtml(text.slice(cursor)));
  return parts.join("");
}

export function categorySearchEmptyHtml(text) {
  return `<div class="category-search-empty" data-category-search-empty hidden>${escapeHtml(text)}</div>`;
}

export function renderCategorySearchOption({
  category,
  label,
  id,
  checked = false,
  className = "category-option"
}) {
  return `
    <label
      class="${escapeHtml(className)}"
      for="${escapeHtml(id)}"
      data-category-search-option
      data-category-search-label="${escapeHtml(label)}"
    >
      <input id="${escapeHtml(id)}" type="checkbox" value="${escapeHtml(category)}" ${checked ? "checked" : ""} />
      <span data-category-search-label-text>${escapeHtml(label)}</span>
    </label>
  `;
}

export function applyCategorySearch(input, list, { emptyText = "" } = {}) {
  if (!input || !list) return 0;
  const query = input.value || "";
  const options = [...list.querySelectorAll("[data-category-search-option]")];
  let visibleCount = 0;

  options.forEach((option) => {
    const label = option.dataset.categorySearchLabel || "";
    const matches = categoryMatchesSearch(label, query);
    option.hidden = !matches;
    if (matches) visibleCount += 1;
    const labelNode = option.querySelector("[data-category-search-label-text]");
    if (labelNode) labelNode.innerHTML = highlightCategorySearchMatch(label, query);
  });

  const empty = list.querySelector("[data-category-search-empty]");
  if (empty) {
    empty.textContent = typeof emptyText === "function" ? emptyText() : emptyText;
    empty.hidden = !options.length || visibleCount > 0;
  }
  return visibleCount;
}

export function resetCategorySearch(input, list, options = {}) {
  if (input) input.value = "";
  return applyCategorySearch(input, list, options);
}

export function bindCategorySearch(input, list, options = {}) {
  if (!input || !list) return () => {};
  const apply = () => applyCategorySearch(input, list, options);
  input.addEventListener("input", apply);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
  });
  return apply;
}

export function categoryFilterHasSelection(list) {
  return Boolean(list?.querySelector?.("input:checked"));
}

export function syncCategoryFilterResetVisibility(list, resetButton) {
  if (!resetButton) return false;
  const hasSelection = categoryFilterHasSelection(list);
  resetButton.hidden = !hasSelection;
  return hasSelection;
}

export function bindCategoryFilterResetVisibility(list, resetButton) {
  if (!list || !resetButton) return () => {};
  const sync = () => syncCategoryFilterResetVisibility(list, resetButton);
  const reset = () => {
    list.querySelectorAll("input").forEach((input) => {
      input.checked = false;
    });
    sync();
  };
  list.addEventListener("change", sync);
  resetButton.addEventListener("click", reset);
  sync();
  return () => {
    list.removeEventListener("change", sync);
    resetButton.removeEventListener("click", reset);
  };
}

export function syncCategorySearchAvailability(input, list, {
  available = true,
  emptyText = "",
  reset = false
} = {}) {
  const field = input?.closest?.(".category-search-field");
  if (field) field.hidden = !available;
  if (reset && input) input.value = "";
  return applyCategorySearch(input, list, { emptyText });
}
