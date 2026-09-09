// Interpret only the known pre-arrangement guest format on an isolated copy.
// A present but inconsistent arrangement is never replaced with owner mirrors.
const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const id = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(value)
  && !["__proto__", "prototype", "constructor"].includes(value);
const ids = value => Array.isArray(value) && value.every(id) && new Set(value).size === value.length;
const fail = () => { throw Error("Старые размещения гостевой укладки неоднозначны. Исходные данные сохранены."); };

export function personalGuestSourceLayout(source, layoutId) {
  const layout = source?.layouts?.[layoutId];
  if (!id(layoutId) || !plain(layout) || layout.id !== layoutId) fail();
  if (layout.arrangement != null) return clone(layout);
  if (!ids(layout.rootContainerIds) || !plain(source.items) || !plain(source.containers)) fail();
  const result = clone(layout), seen = new Set();
  const arrangement = { rootContainerIds: [...layout.rootContainerIds], containers: {}, items: {},
    itemQuantities: {}, itemQuantityMigrationVersion: 3, packedItems: {} };
  const walk = (containerId, parentId) => {
    const owner = source.containers[containerId];
    if (seen.has(containerId) || !plain(owner) || owner.id !== containerId || (owner.parentId ?? "") !== parentId) fail();
    seen.add(containerId);
    const children = owner.childIds ?? [], declaredItems = owner.itemIds ?? [];
    if (!ids(children) || !ids(declaredItems)) fail();
    const linkedItems = Object.entries(source.items).filter(([, item]) => item?.containerId === containerId).map(([key]) => key);
    const items = [...new Set([...declaredItems, ...linkedItems])];
    if (!ids(items)) fail();
    for (const itemId of items) {
      const item = source.items[itemId], quantity = item?.quantity ?? 1;
      if (!plain(item) || item.id !== itemId || Object.hasOwn(arrangement.items, itemId)
        || item.containerId && item.containerId !== containerId || !Number.isSafeInteger(quantity) || quantity < 1) fail();
      arrangement.items[itemId] = containerId; arrangement.itemQuantities[itemId] = quantity;
      const packed = source.packedItems?.[itemId];
      if (packed !== undefined && typeof packed !== "boolean") fail();
      if (packed) arrangement.packedItems[itemId] = true;
    }
    const order = owner.order ?? [];
    if (!Array.isArray(order)) fail();
    arrangement.containers[containerId] = { parentId, childIds: [...children], itemIds: items,
      order: order.length ? clone(order) : [...items.map(id => ({ type: "item", id })), ...children.map(id => ({ type: "container", id }))] };
    children.forEach(childId => walk(childId, containerId));
  };
  layout.rootContainerIds.forEach(rootId => walk(rootId, ""));
  result.arrangement = arrangement;
  return result;
}
