const clone = value => JSON.parse(JSON.stringify(value));
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);

// Private layout deletion removes its placements, not the bags/items/files.
// The caller supplies the exact eligible layouts and a preallocated empty
// replacement only when deleting the last one. No ID is generated on retry.
export function preparePersonalLayoutDeletion(state, { layoutId, eligibleLayoutIds, nextLayoutId, replacement = null }) {
  if (!validId(layoutId) || !validId(nextLayoutId) || nextLayoutId === layoutId || state?.activeLayoutId !== layoutId
    || !state.layouts?.[layoutId] || !Array.isArray(eligibleLayoutIds) || !eligibleLayoutIds.includes(layoutId)
    || new Set(eligibleLayoutIds).size !== eligibleLayoutIds.length
    || eligibleLayoutIds.some(id => !validId(id) || !state.layouts[id])) throw Error("Состав личных укладок изменился. Повторите выбор.");
  const remaining = eligibleLayoutIds.filter(id => id !== layoutId);
  if (remaining.length) {
    if (!remaining.includes(nextLayoutId) || replacement !== null) throw Error("Не подтверждена следующая личная укладка.");
  } else {
    const empty = replacement?.arrangement;
    if (!replacement || replacement.id !== nextLayoutId || replacement.adminDemo || replacement.adminSharedSourceId
      || ["items", "containers", "layouts"].some(type => Object.hasOwn(state[type] || {}, nextLayoutId))
      || !Array.isArray(replacement.rootContainerIds) || replacement.rootContainerIds.length || !empty
      || !Array.isArray(empty.rootContainerIds) || empty.rootContainerIds.length
      || ["items", "containers", "packedItems", "itemQuantities"].some(key => !empty[key] || typeof empty[key] !== "object"
        || Array.isArray(empty[key]) || Object.keys(empty[key]).length)) throw Error("Не подготовлена пустая замена последней укладки.");
  }
  const snapshot = clone(state);
  if (replacement) snapshot.layouts[nextLayoutId] = clone(replacement);
  delete snapshot.layouts[layoutId];
  snapshot.activeLayoutId = nextLayoutId;
  snapshot.packedItems = clone(snapshot.layouts[nextLayoutId].arrangement?.packedItems || {});
  return { snapshot, intent: { type: "layout", id: layoutId }, nextLayoutId };
}
