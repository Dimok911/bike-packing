import { catalogDuplicateGroups } from "../state/catalog-duplicates.js";
import { escapeHtml } from "../utils/html.js";

export function renderCatalogDuplicateGroups(records, renderRecord, t = (key) => key) {
  return catalogDuplicateGroups(records).map((group, index) => {
    const values = { number: index + 1, count: group.length };
    const translated = t("catalog.duplicateGroup", values);
    const title = translated === "catalog.duplicateGroup" ? `Группа ${values.number} · ${values.count} записей` : translated;
    return `<section class="catalog-duplicate-group" data-duplicate-group="${index + 1}">
      <h3>${escapeHtml(title)}</h3><div class="catalog-duplicate-group-records">${group.map(renderRecord).join("")}</div>
    </section>`;
  }).join("");
}

export function renderCatalogDuplicatesNotice(root, { enabled = false, language = "ru", onClear = () => {} } = {}) {
  if (!root || !enabled) return;
  const documentRef = root.ownerDocument;
  const notice = documentRef.createElement("div");
  notice.className = "catalog-duplicates-notice";
  notice.setAttribute("role", "status");
  const text = documentRef.createElement("span");
  text.textContent = language === "en"
    ? "Possible duplicates: matching names, weight, dimensions, color, categories, notes and photos. Broken items are excluded."
    : "Возможные дубликаты: совпадают название, вес, размеры, цвет, категории, заметка и фотографии. Сломанные вещи исключены.";
  const clear = documentRef.createElement("button");
  clear.type = "button";
  clear.className = "ghost";
  clear.dataset.clearDuplicateFilter = "";
  clear.textContent = language === "en" ? "Show all" : "Показать всё";
  clear.addEventListener("click", onClear);
  notice.append(text, clear);
  root.prepend(notice);
}
