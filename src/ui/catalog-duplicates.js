export function renderCatalogDuplicatesNotice(root, { enabled = false, language = "ru", onClear = () => {} } = {}) {
  if (!root || !enabled) return;
  const documentRef = root.ownerDocument;
  const notice = documentRef.createElement("div");
  notice.className = "catalog-duplicates-notice";
  notice.setAttribute("role", "status");
  const text = documentRef.createElement("span");
  text.textContent = language === "en"
    ? "Possible duplicates: matching names, including copy suffixes. Check the details before deleting."
    : "Возможные дубликаты: совпадающие названия, включая copy и копия. Перед удалением сравните свойства.";
  const clear = documentRef.createElement("button");
  clear.type = "button";
  clear.className = "ghost";
  clear.dataset.clearDuplicateFilter = "";
  clear.textContent = language === "en" ? "Show all" : "Показать всё";
  clear.addEventListener("click", onClear);
  notice.append(text, clear);
  root.prepend(notice);
}
