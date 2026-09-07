import { addCustomDictionaryValue, removeCustomDictionaryValue, renameCustomDictionaryValue } from "../state/dictionaries.js";
import { itemCategories, containerCategories } from "../state/normalize.js";

const clone = value => JSON.parse(JSON.stringify(value));
const validValue = value => typeof value === "string" && value.length > 0 && value === value.trim();
const validId = value => typeof value === "string" && value.length > 0 && value.length <= 191
  && value === value.trim() && !["__proto__", "prototype", "constructor"].includes(value);

// Global PRIVATE dictionaries and every affected private owner are one frozen
// list snapshot. Public/template dictionaries need their own authorized adapter.
export function preparePersonalDictionaryMutation(state, { type, action, value, nextValue = "", fallback = "",
  values, itemIds, containerIds }, { changedAt = "", markEdited = () => {} } = {}) {
  if (!["location", "category"].includes(type) || !["add", "rename", "delete"].includes(action)
    || !validValue(value) || !Array.isArray(values) || values.some(entry => !validValue(entry))
    || new Set(values).size !== values.length || (action === "add" ? values.includes(value) : !values.includes(value))
    || action === "rename" && (!validValue(nextValue) || values.includes(nextValue))
    || action === "delete" && fallback !== (values.find(entry => entry !== value) || "")) {
    throw Error("Справочник изменился. Повторите выбор значения.");
  }
  for (const [field, ids] of [["items", itemIds], ["containers", containerIds]]) {
    if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some(id => !validId(id) || !state[field]?.[id]
      || state[field][id].adminDemo || state[field][id].adminSharedSourceId || state[field][id].publicCatalogLayoutId)) {
      throw Error("Не подтверждён состав личных записей справочника.");
    }
  }
  const snapshot = clone(state), affected = { items: [], containers: [] };
  if (action === "add") addCustomDictionaryValue(snapshot, type, value);
  else {
    const replacement = action === "rename" ? nextValue : fallback;
    if (action === "rename") renameCustomDictionaryValue(snapshot, type, value, replacement);
    else removeCustomDictionaryValue(snapshot, type, value);
    for (const [field, ids, categories] of [["items", itemIds, itemCategories], ["containers", containerIds, containerCategories]]) {
      for (const id of ids) {
        const record = snapshot[field][id];
        if (type === "location") {
          if (record.location !== value) continue;
          record.location = replacement;
        } else {
          const previous = categories(record);
          if (!previous.includes(value)) continue;
          record.categories = [...new Set(previous.map(entry => entry === value ? replacement : entry).filter(Boolean))];
          record.category = record.categories[0] || "";
        }
        markEdited(record, changedAt); affected[field].push(id);
      }
    }
  }
  return { snapshot, intent: { type: "dictionary", version: 1, dictionaryType: type, action, value,
    replacement: action === "rename" ? nextValue : action === "delete" ? fallback : null, ...affected } };
}
