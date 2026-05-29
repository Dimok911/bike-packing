function tr(t, key, fallback, values = {}) {
  return typeof t === "function" ? t(key, values) : fallback;
}

export function itemCopyConfirm({ item, keepPlacement = false, t } = {}) {
  const name = item?.name || tr(t, "items.addItem", "item").toLowerCase();
  return {
    title: tr(t, "copy.itemTitle", "Copy item?"),
    text: tr(t, "copy.itemText", "A separate copy of “{name}” will be created.", { name }),
    highlightText: keepPlacement
      ? tr(t, "copy.itemKeepPlacement", "The copy will appear next to the original item in the current layout and will also be available on the Items tab.")
      : tr(t, "copy.itemOutside", "The copy will appear on the Items tab as an item outside the layout."),
    okText: tr(t, "buttons.copy", "Copy"),
    cancelText: tr(t, "buttons.cancel", "Cancel"),
    tone: "safe"
  };
}

export function rootContainerCopyConfirm({ container, inLayout = false, t } = {}) {
  const name = container?.name || tr(t, "rootContainers.add", "bag or place").toLowerCase();
  return {
    title: tr(t, "copy.rootTitle", "Copy bag or place?"),
    text: tr(t, "copy.rootText", "A separate copy of “{name}” will be created.", { name }),
    highlightText: inLayout
      ? tr(t, "copy.rootInLayout", "The copy will appear in the current layout as a new top-level bag or place.")
      : tr(t, "copy.rootOutside", "The copy will appear in the bags and places list without items inside."),
    okText: tr(t, "buttons.copy", "Copy"),
    cancelText: tr(t, "buttons.cancel", "Cancel"),
    tone: "safe"
  };
}

export function itemDeleteConfirm({ item, placementText = "", hasPlacements = false, t } = {}) {
  const name = item?.name || tr(t, "items.addItem", "item").toLowerCase();
  return {
    title: tr(t, "delete.itemTitle", "Delete item forever?"),
    text: tr(t, "delete.itemText", "“{name}” will be deleted from the item list and from every layout. This action cannot be undone.", { name }),
    highlightText: placementText,
    okText: tr(t, "buttons.deleteLayout", "Delete"),
    cancelText: tr(t, "buttons.cancel", "Cancel"),
    tone: hasPlacements ? "danger" : "safe"
  };
}

export function rootContainerDeleteConfirm({ container, layoutText = "", itemsText = "", risky = false, t } = {}) {
  const name = container?.name || tr(t, "rootContainers.add", "bag or place").toLowerCase();
  return {
    title: tr(t, "delete.rootTitle", "Delete bag or place?"),
    text: tr(t, "delete.rootText", "“{name}” will be deleted from the bags and places list and from every layout.", { name }),
    highlightText: `${layoutText}${itemsText}`,
    okText: tr(t, "buttons.deleteLayout", "Delete"),
    cancelText: tr(t, "buttons.cancel", "Cancel"),
    tone: risky ? "danger" : "safe"
  };
}
