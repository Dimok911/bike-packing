import { itemCategories } from "./normalize.js";
import { collectPublicLayoutRecordIds, isPublicLayoutRecord } from "./public-layout-scope.js";

const PUBLIC_DICTIONARY_CLEANUP_VERSION = "public-dictionaries-v1";

export function normalizeDictionaryValues(values, fallbackValues = []) {
  const result = [];
  [...(Array.isArray(values) ? values : []), ...(Array.isArray(fallbackValues) ? fallbackValues : [])].forEach((value) => {
    if (typeof value !== "string") return;
    const normalized = value.trim();
    if (normalized && !result.includes(normalized)) result.push(normalized);
  });
  return result;
}

export function isPrivateDictionaryRecord(record) {
  return Boolean(record && !record.adminDemo && !record.adminSharedSourceId && !record.publicCatalogLayoutId);
}

export function layoutDictionaryValues(layout, type, sourceState, {
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} = {}) {
  if (!layout || !sourceState || !getLayoutContainerIdSet || !getLayoutItemIdSet) return [];
  const values = [];
  const containerIds = getLayoutContainerIdSet(sourceState, layout);
  const itemIds = getLayoutItemIdSet(sourceState, layout);
  if (type === "location") {
    containerIds.forEach((id) => {
      const value = sourceState.containers?.[id]?.location;
      if (value) values.push(value);
    });
    itemIds.forEach((id) => {
      const value = sourceState.items?.[id]?.location;
      if (value) values.push(value);
    });
  } else {
    itemIds.forEach((id) => {
      itemCategories(sourceState.items?.[id] || {}).forEach((value) => values.push(value));
    });
  }
  return normalizeDictionaryValues(values);
}

export function privateDictionaryValues(type, sourceState, helpers = {}) {
  const publicIds = collectPublicLayoutRecordIds(sourceState, helpers);
  const values = [];
  if (type === "location") {
    Object.entries(sourceState?.containers || {}).forEach(([id, container]) => {
      if (!publicIds.containerIds.has(id) && isPrivateDictionaryRecord(container) && container.location) values.push(container.location);
    });
    Object.entries(sourceState?.items || {}).forEach(([id, item]) => {
      if (!publicIds.itemIds.has(id) && isPrivateDictionaryRecord(item) && item.location) values.push(item.location);
    });
  } else {
    Object.entries(sourceState?.items || {}).forEach(([id, item]) => {
      if (publicIds.itemIds.has(id) || !isPrivateDictionaryRecord(item)) return;
      itemCategories(item).forEach((value) => values.push(value));
    });
  }
  return normalizeDictionaryValues(values);
}

export function publicDictionaryValues(type, sourceState, helpers = {}) {
  const publicIds = collectPublicLayoutRecordIds(sourceState, helpers);
  const values = [];
  Object.values(sourceState?.layouts || {}).forEach((layout) => {
    if (!isPublicLayoutRecord(layout)) return;
    values.push(...customDictionaryValues(layout, type));
    values.push(...normalizeDictionaryValues(layout?.[type === "location" ? "locations" : "categories"]));
  });
  if (type === "location") {
    publicIds.containerIds.forEach((id) => {
      const value = sourceState?.containers?.[id]?.location;
      if (value) values.push(value);
    });
    publicIds.itemIds.forEach((id) => {
      const value = sourceState?.items?.[id]?.location;
      if (value) values.push(value);
    });
  } else {
    publicIds.itemIds.forEach((id) => {
      itemCategories(sourceState?.items?.[id] || {}).forEach((value) => values.push(value));
    });
  }
  return normalizeDictionaryValues(values);
}

export function customDictionaryValues(owner, type) {
  if (!owner) return [];
  const list = type === "location"
    ? owner.customLocations || owner.locationDictionary || []
    : owner.customCategories || owner.categoryDictionary || [];
  return normalizeDictionaryValues(list);
}

function hasCustomDictionary(owner, type) {
  if (!owner) return false;
  return type === "location"
    ? Array.isArray(owner.customLocations) || Array.isArray(owner.locationDictionary)
    : Array.isArray(owner.customCategories) || Array.isArray(owner.categoryDictionary);
}

function legacyDictionaryValues(owner, type) {
  return normalizeDictionaryValues(owner?.[type === "location" ? "locations" : "categories"]);
}

function setLegacyDictionaryValues(owner, type, values) {
  if (!owner) return owner;
  if (type === "location") owner.locations = normalizeDictionaryValues(values);
  else owner.categories = normalizeDictionaryValues(values);
  return owner;
}

function migratePrivateCustomDictionary(owner, type, defaults = {}, helpers = {}) {
  if (!owner || hasCustomDictionary(owner, type)) return;
  const legacyValues = legacyDictionaryValues(owner, type);
  const defaultValues = new Set(normalizeDictionaryValues(defaults[type === "location" ? "locations" : "categories"]));
  const privateValues = new Set(privateDictionaryValues(type, owner, helpers));
  const publicValues = new Set(publicDictionaryValues(type, owner, helpers));
  const customValues = legacyValues.filter((value) =>
    !defaultValues.has(value) && (!publicValues.has(value) || privateValues.has(value))
  );
  setCustomDictionaryValues(owner, type, customValues);
}

function migrateLayoutCustomDictionary(layout, type, sourceState, defaults = {}, helpers = {}) {
  if (!layout || hasCustomDictionary(layout, type)) return;
  const defaultValues = new Set(normalizeDictionaryValues(defaults[type === "location" ? "locations" : "categories"]));
  const usedValues = new Set(layoutDictionaryValues(layout, type, sourceState, helpers));
  const customValues = legacyDictionaryValues(layout, type).filter((value) =>
    !defaultValues.has(value) || !usedValues.has(value)
  );
  setCustomDictionaryValues(layout, type, customValues);
}

function prunePublicLayoutCustomDictionary(layout, type, usedValues = []) {
  if (!isPublicLayoutRecord(layout)) return;
  const used = new Set(normalizeDictionaryValues(usedValues));
  setCustomDictionaryValues(layout, type, customDictionaryValues(layout, type).filter((value) => used.has(value)));
}

function layoutDictionaryList(owner, type, usedValues = [], defaults = {}) {
  const values = normalizeDictionaryValues([
    ...customDictionaryValues(owner, type),
    ...normalizeDictionaryValues(usedValues)
  ]);
  return values.length ? values : normalizeDictionaryValues(defaults[type === "location" ? "locations" : "categories"]);
}

export function setCustomDictionaryValues(owner, type, values) {
  if (!owner) return owner;
  if (type === "location") owner.customLocations = normalizeDictionaryValues(values);
  else owner.customCategories = normalizeDictionaryValues(values);
  return owner;
}

export function addCustomDictionaryValue(owner, type, value) {
  const normalized = normalizeDictionaryValues([value])[0];
  if (!owner || !normalized) return owner;
  setCustomDictionaryValues(owner, type, [...customDictionaryValues(owner, type), normalized]);
  setLegacyDictionaryValues(owner, type, [...legacyDictionaryValues(owner, type), normalized]);
  return owner;
}

export function removeCustomDictionaryValue(owner, type, value) {
  if (!owner) return owner;
  setCustomDictionaryValues(owner, type, customDictionaryValues(owner, type).filter((item) => item !== value));
  setLegacyDictionaryValues(owner, type, legacyDictionaryValues(owner, type).filter((item) => item !== value));
  return owner;
}

export function renameCustomDictionaryValue(owner, type, oldValue, newValue) {
  if (!owner) return owner;
  setCustomDictionaryValues(owner, type, customDictionaryValues(owner, type).map((item) => item === oldValue ? newValue : item));
  setLegacyDictionaryValues(owner, type, legacyDictionaryValues(owner, type).map((item) => item === oldValue ? newValue : item));
  return owner;
}

export function ensurePrivateDictionaries(sourceState, defaults = {}) {
  if (!sourceState) return sourceState;
  const helpers = {
    getLayoutContainerIdSet: defaults.getLayoutContainerIdSet,
    getLayoutItemIdSet: defaults.getLayoutItemIdSet
  };
  migratePrivateCustomDictionary(sourceState, "location", defaults, helpers);
  migratePrivateCustomDictionary(sourceState, "category", defaults, helpers);
  sourceState.locations = normalizeDictionaryValues(customDictionaryValues(sourceState, "location"), [
    ...(defaults.locations || []),
    ...privateDictionaryValues("location", sourceState, helpers)
  ]);
  sourceState.categories = normalizeDictionaryValues(customDictionaryValues(sourceState, "category"), [
    ...(defaults.categories || []),
    ...privateDictionaryValues("category", sourceState, helpers)
  ]);
  return sourceState;
}

export function ensureLayoutDictionaries(layout, {
  sourceState,
  defaults = {},
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} = {}) {
  if (!layout) return null;
  const source = sourceState || {};
  const helpers = { getLayoutContainerIdSet, getLayoutItemIdSet };
  migrateLayoutCustomDictionary(layout, "location", source, defaults, helpers);
  migrateLayoutCustomDictionary(layout, "category", source, defaults, helpers);
  const usedLocations = layoutDictionaryValues(layout, "location", source, helpers);
  const usedCategories = layoutDictionaryValues(layout, "category", source, helpers);
  if (isPublicLayoutRecord(layout) && layout.publicDictionaryCleanupVersion !== PUBLIC_DICTIONARY_CLEANUP_VERSION) {
    prunePublicLayoutCustomDictionary(layout, "location", usedLocations);
    prunePublicLayoutCustomDictionary(layout, "category", usedCategories);
    layout.publicDictionaryCleanupVersion = PUBLIC_DICTIONARY_CLEANUP_VERSION;
  }
  layout.locations = layoutDictionaryList(layout, "location", usedLocations, defaults);
  layout.categories = layoutDictionaryList(layout, "category", usedCategories, defaults);
  return layout;
}

export function readOnlyLayoutDictionaries(layout, {
  sourceState,
  defaults = {},
  getLayoutContainerIdSet,
  getLayoutItemIdSet
} = {}) {
  if (!layout) return { locations: normalizeDictionaryValues(defaults.locations), categories: normalizeDictionaryValues(defaults.categories) };
  const source = sourceState || {};
  const helpers = { getLayoutContainerIdSet, getLayoutItemIdSet };
  return {
    locations: layoutDictionaryList(layout, "location", layoutDictionaryValues(layout, "location", source, helpers), defaults),
    categories: layoutDictionaryList(layout, "category", layoutDictionaryValues(layout, "category", source, helpers), defaults)
  };
}

export function dictionaryOptionsForUi(type, activeValues, { selected = [] } = {}) {
  const selectedValues = Array.isArray(selected) ? selected : [...selected || []];
  return normalizeDictionaryValues(activeValues, selectedValues);
}
