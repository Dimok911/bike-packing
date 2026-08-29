function numericValues(values, fallback = 0) {
  const rows = (Array.isArray(values) ? values : [fallback])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(rows)].sort((left, right) => left - right);
}

export const MANUFACTURER_BAG_COMPARISON_COLUMNS = Object.freeze([
  "model",
  "manufacturer",
  "volume",
  "weight",
  "dimensions",
  "waterproof",
  "mounting",
  "set",
  "availability",
  "source"
]);

const UNKNOWN_FILTER_KEY = "__unknown__";

function normalizedText(value = "") {
  return String(value || "").trim();
}

function numericBounds(values = []) {
  const normalized = numericValues(values);
  return normalized.length
    ? { min: normalized[0], max: normalized.at(-1) }
    : null;
}

export function manufacturerBagComparisonNumericBounds(entry, column = "") {
  if (column === "volume") return numericBounds(entry?.volumeOptions);
  if (column === "weight") return numericBounds(entry?.weightOptions);
  return null;
}

export function manufacturerBagComparisonFilterKey(entry, column = "") {
  let value = "";
  if (column === "model") value = normalizedText(entry?.name);
  else if (column === "manufacturer") value = normalizedText(entry?.brand);
  else if (column === "volume" || column === "weight") {
    const bounds = manufacturerBagComparisonNumericBounds(entry, column);
    value = bounds ? `${bounds.min}:${bounds.max}` : "";
  } else if (column === "dimensions") {
    value = manufacturerBagComparisonDimensions(entry?.dimensions);
  } else if (column === "waterproof") value = normalizedText(entry?.waterproof);
  else if (column === "mounting") {
    value = (entry?.mountingOptions || []).map(normalizedText).filter(Boolean).sort().join(" / ")
      || normalizedText(entry?.mounting);
  } else if (column === "set") value = entry?.soldAsSet ? "pair" : "single";
  else if (column === "availability") {
    value = entry?.available ? String(Math.max(0, Number(entry?.availableVariantCount || 0))) : "unavailable";
  } else if (column === "source") value = normalizedText(entry?.provider || entry?.sourceUrl);
  return value || UNKNOWN_FILTER_KEY;
}

export function manufacturerBagComparisonFilterOptions(rows = [], column = "") {
  const options = new Map();
  (Array.isArray(rows) ? rows : []).forEach((entry) => {
    const key = manufacturerBagComparisonFilterKey(entry, column);
    const current = options.get(key);
    if (current) current.count += 1;
    else options.set(key, { key, entry, count: 1 });
  });
  return [...options.values()];
}

function normalizedFilter(filter = {}) {
  const selectedKeys = Array.isArray(filter?.selectedKeys)
    ? [...new Set(filter.selectedKeys.map(String))]
    : null;
  const rawMin = filter?.min;
  const rawMax = filter?.max;
  const min = rawMin === null || rawMin === undefined || rawMin === "" ? Number.NaN : Number(rawMin);
  const max = rawMax === null || rawMax === undefined || rawMax === "" ? Number.NaN : Number(rawMax);
  return {
    selectedKeys,
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null
  };
}

export function filterManufacturerBagComparisonRows(rows = [], filters = {}) {
  const activeFilters = Object.entries(filters || {})
    .filter(([column]) => MANUFACTURER_BAG_COMPARISON_COLUMNS.includes(column))
    .map(([column, filter]) => [column, normalizedFilter(filter)]);
  if (!activeFilters.length) return [...(Array.isArray(rows) ? rows : [])];
  return (Array.isArray(rows) ? rows : []).filter((entry) => activeFilters.every(([column, filter]) => {
    if (filter.selectedKeys && !filter.selectedKeys.includes(manufacturerBagComparisonFilterKey(entry, column))) {
      return false;
    }
    if (filter.min === null && filter.max === null) return true;
    const bounds = manufacturerBagComparisonNumericBounds(entry, column);
    if (!bounds) return false;
    const requestedMin = filter.min ?? Number.NEGATIVE_INFINITY;
    const requestedMax = filter.max ?? Number.POSITIVE_INFINITY;
    return bounds.max >= requestedMin && bounds.min <= requestedMax;
  }));
}

function comparisonSortValue(entry, column, direction) {
  if (column === "volume" || column === "weight") {
    const bounds = manufacturerBagComparisonNumericBounds(entry, column);
    return bounds ? (direction === "desc" ? bounds.max : bounds.min) : null;
  }
  if (column === "availability") {
    return entry?.available ? Math.max(0, Number(entry?.availableVariantCount || 0)) : -1;
  }
  if (column === "dimensions") {
    const values = [entry?.dimensions?.width, entry?.dimensions?.height, entry?.dimensions?.depth].map(Number);
    return values.every((value) => Number.isFinite(value) && value > 0)
      ? values.reduce((total, value) => total * value, 1)
      : null;
  }
  return manufacturerBagComparisonFilterKey(entry, column);
}

export function sortManufacturerBagComparisonRows(rows = [], sort = {}) {
  const column = MANUFACTURER_BAG_COMPARISON_COLUMNS.includes(sort?.column) ? sort.column : "model";
  const direction = sort?.direction === "desc" ? "desc" : "asc";
  const multiplier = direction === "desc" ? -1 : 1;
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
    const leftValue = comparisonSortValue(left, column, direction);
    const rightValue = comparisonSortValue(right, column, direction);
    const leftMissing = leftValue === null || leftValue === UNKNOWN_FILTER_KEY;
    const rightMissing = rightValue === null || rightValue === UNKNOWN_FILTER_KEY;
    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
    let result = 0;
    if (typeof leftValue === "number" && typeof rightValue === "number") result = leftValue - rightValue;
    else result = String(leftValue || "").localeCompare(String(rightValue || ""), undefined, { numeric: true });
    if (result) return result * multiplier;
    return normalizedText(left?.brand).localeCompare(normalizedText(right?.brand))
      || normalizedText(left?.name).localeCompare(normalizedText(right?.name));
  });
}

export function manufacturerBagComparisonViewRows(rows = [], { filters = {}, sort = {} } = {}) {
  return sortManufacturerBagComparisonRows(filterManufacturerBagComparisonRows(rows, filters), sort);
}

export function manufacturerBagComparisonRows(catalog = [], category = "") {
  const normalizedCategory = String(category || "").trim();
  if (!normalizedCategory) return [];
  return (Array.isArray(catalog) ? catalog : [])
    .filter((entry) => entry?.category === normalizedCategory)
    .map((entry) => {
      const referenceWeight = Number(entry?.weight || 0);
      const plausibleVariantWeights = (Array.isArray(entry?.variants) ? entry.variants : [])
        .map((variant) => Number(variant?.weight || 0))
        .filter((weight) => weight > 0 && (!referenceWeight
          || (weight >= referenceWeight / 4 && weight <= referenceWeight * 4)));
      return {
        ...entry,
        volumeOptions: numericValues(entry?.volumeOptions, entry?.volume),
        weightOptions: numericValues([...(entry?.weightOptions || []), ...plausibleVariantWeights], entry?.weight),
        mountingOptions: [...new Set((Array.isArray(entry?.mountingOptions)
          ? entry.mountingOptions
          : [entry?.mounting]).map((value) => String(value || "").trim()).filter(Boolean))]
      };
    })
    .sort((left, right) => String(left.brand || "").localeCompare(String(right.brand || ""))
      || String(left.name || "").localeCompare(String(right.name || "")));
}

export function manufacturerBagComparisonRange(values = [], unit = "") {
  const normalized = numericValues(values);
  if (!normalized.length) return "";
  const value = normalized.length === 1
    ? String(normalized[0])
    : `${normalized[0]}–${normalized.at(-1)}`;
  return unit ? `${value} ${unit}` : value;
}

export function manufacturerBagComparisonDimensions(dimensions = {}) {
  const values = [dimensions?.width, dimensions?.height, dimensions?.depth].map(Number);
  return values.every((value) => Number.isFinite(value) && value > 0)
    ? values.join(" × ")
    : "";
}
