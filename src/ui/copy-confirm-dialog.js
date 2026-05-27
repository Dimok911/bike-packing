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

export function itemDeleteConfirm({ item, placementText = "", hasPlacements = false }) {
  const name = item?.name || "РІРµС‰СЊ";
  return {
    title: "РЈРґР°Р»РёС‚СЊ РІРµС‰СЊ РЅР°РІСЃРµРіРґР°?",
    text: `В«${name}В» Р±СѓРґРµС‚ СѓРґР°Р»РµРЅР° РёР· СЃРїРёСЃРєР° РІРµС‰РµР№ Рё РёР· РІСЃРµС… СѓРєР»Р°РґРѕРє. Р­С‚Рѕ РґРµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.`,
    highlightText: placementText,
    okText: "РЈРґР°Р»РёС‚СЊ",
    tone: hasPlacements ? "danger" : "safe"
  };
}

export function rootContainerDeleteConfirm({ container, layoutText = "", itemsText = "", risky = false }) {
  const name = container?.name || "СЃСѓРјРєР° РёР»Рё РјРµСЃС‚Рѕ";
  return {
    title: "РЈРґР°Р»РёС‚СЊ СЃСѓРјРєСѓ РёР»Рё РјРµСЃС‚Рѕ?",
    text: `В«${name}В» Р±СѓРґРµС‚ СѓРґР°Р»РµРЅРѕ РёР· СЃРїРёСЃРєР° СЃСѓРјРѕРє Рё РјРµСЃС‚ Рё РёР· РІСЃРµС… СѓРєР»Р°РґРѕРє.`,
    highlightText: `${layoutText}${itemsText}`,
    okText: "РЈРґР°Р»РёС‚СЊ",
    tone: risky ? "danger" : "safe"
  };
}
