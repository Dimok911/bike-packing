export function layoutEditTitle(layout) {
  return layout?.adminDemo || layout?.adminSharedSourceId ? "Редактировать шаблон" : "Редактировать укладку";
}

export function layoutCopyTitle(layout) {
  return layout?.adminDemo || layout?.adminSharedSourceId ? "Скопировать шаблон" : "Скопировать укладку";
}

export function publicTemplateOptionLabel({ prefix, sharedPrefix, name, languageLabel, demo = false }) {
  const kind = demo ? "" : `${sharedPrefix}: `;
  return `${prefix}: ${kind}${name} (${languageLabel})`;
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
    ? "Опубликованный shared-шаблон будет удален с сервера и из публичного списка шаблонов."
    : "Опубликованная версия на сервере не удаляется.";
  return {
    title: "Удалить шаблон?",
    text: `«${layout?.name || "Шаблон"}» будет удален из локальных шаблонов для правки.`,
    highlightText: `${containerCount} сумок/контейнеров, ${itemText} исчезнут из этого локального шаблона. ${serverText}`,
    okText: "Удалить",
    tone: "danger"
  };
}
