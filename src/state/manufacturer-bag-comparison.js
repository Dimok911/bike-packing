function numericValues(values, fallback = 0) {
  const rows = (Array.isArray(values) ? values : [fallback])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(rows)].sort((left, right) => left - right);
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
