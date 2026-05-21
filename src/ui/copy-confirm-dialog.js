export function itemCopyConfirm({ item, keepPlacement = false }) {
  const name = item?.name || "вещь";
  return {
    title: "Скопировать вещь?",
    text: `Будет создана отдельная копия «${name}».`,
    highlightText: keepPlacement
      ? "Копия появится рядом с исходной вещью в текущей укладке и также будет доступна во вкладке «Вещи»."
      : "Копия появится во вкладке «Вещи» как вещь вне укладки.",
    okText: "Скопировать",
    cancelText: "Отмена",
    tone: "safe"
  };
}

export function rootContainerCopyConfirm({ container, inLayout = false }) {
  const name = container?.name || "сумка или место";
  return {
    title: "Скопировать сумку или место?",
    text: `Будет создана отдельная копия «${name}».`,
    highlightText: inLayout
      ? "Копия появится в текущей укладке как новая сумка или место верхнего уровня."
      : "Копия появится в списке сумок и мест без вещей внутри.",
    okText: "Скопировать",
    cancelText: "Отмена",
    tone: "safe"
  };
}
