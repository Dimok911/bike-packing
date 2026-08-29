function searchableCatalogValue(value) {
  if (Array.isArray(value)) return value.map(searchableCatalogValue).join(" ");
  if (value && typeof value === "object") return Object.values(value).map(searchableCatalogValue).join(" ");
  return value == null ? "" : String(value);
}

export function normalizeManufacturerBagCatalogQuery(value = "") {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function manufacturerBagCatalogSearchText(entry) {
  return normalizeManufacturerBagCatalogQuery(searchableCatalogValue({
    id: entry?.id,
    brand: entry?.brand,
    family: entry?.family,
    category: entry?.category,
    name: entry?.name,
    variant: entry?.variant,
    sku: entry?.sku,
    color: entry?.color,
    waterproof: entry?.waterproof,
    material: entry?.material,
    mounting: entry?.mounting,
    description: entry?.description,
    aliases: entry?.aliases,
    weight: entry?.weight,
    volume: entry?.volume,
    loadKg: entry?.loadKg
  }));
}

export function matchesManufacturerBagCatalogQuery(entry, query = "") {
  const normalized = normalizeManufacturerBagCatalogQuery(query);
  if (!normalized) return true;
  const haystack = manufacturerBagCatalogSearchText(entry);
  return normalized.split(/\s+/).every((token) => haystack.includes(token));
}

export function filterManufacturerBagCatalog(catalog = [], {
  category = "",
  family = "",
  query = ""
} = {}) {
  return (Array.isArray(catalog) ? catalog : []).filter((entry) => {
    if (family && entry?.family !== family) return false;
    if (category && entry?.category !== category) return false;
    return matchesManufacturerBagCatalogQuery(entry, query);
  });
}

export function manufacturerBagCatalogCount(catalog = [], {
  category = "",
  family = ""
} = {}) {
  return filterManufacturerBagCatalog(catalog, { category, family }).length;
}

export function manufacturerBagCatalogEntry(catalog = [], id = "") {
  const normalized = String(id || "");
  return (Array.isArray(catalog) ? catalog : []).find((entry) => entry?.id === normalized) || null;
}

export function normalizeManufacturerBagCatalogOverride(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = String(value.id || "").trim();
  if (!id) return null;
  const number = (field) => {
    const parsed = Number(value[field]);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  };
  const textFields = [
    "name", "variant", "sku", "color", "waterproof", "material", "mounting",
    "imageUrl", "sourceImageUrl", "sourceUrl", "family", "category"
  ];
  const normalized = { id };
  textFields.forEach((field) => {
    if (typeof value[field] === "string") normalized[field] = value[field].trim();
  });
  ["weight", "volume", "loadKg"].forEach((field) => {
    const parsed = number(field);
    if (parsed !== undefined) normalized[field] = parsed;
  });
  const dimensions = value.dimensions && typeof value.dimensions === "object"
    ? ["width", "height", "depth"].reduce((result, field) => {
        const parsed = Number(value.dimensions[field]);
        if (Number.isFinite(parsed) && parsed >= 0) result[field] = parsed;
        return result;
      }, {})
    : null;
  if (dimensions && Object.keys(dimensions).length) normalized.dimensions = dimensions;
  if (value.description && typeof value.description === "object") {
    normalized.description = {
      en: String(value.description.en || "").trim(),
      ru: String(value.description.ru || "").trim()
    };
  }
  return normalized;
}

export function mergeManufacturerBagCatalogOverrides(catalog = [], overrides = []) {
  const overrideById = new Map(
    (Array.isArray(overrides) ? overrides : [])
      .map(normalizeManufacturerBagCatalogOverride)
      .filter(Boolean)
      .map((entry) => [entry.id, entry])
  );
  return (Array.isArray(catalog) ? catalog : []).map((entry) => {
    const override = overrideById.get(entry?.id);
    if (!override) return { ...entry };
    return {
      ...entry,
      ...override,
      dimensions: override.dimensions ? { ...(entry.dimensions || {}), ...override.dimensions } : entry.dimensions,
      description: override.description ? { ...(entry.description || {}), ...override.description } : entry.description
    };
  });
}

export function manufacturerBagContainerDraft(entry) {
  if (!entry || typeof entry !== "object") return null;
  const volumeSuffix = Number(entry.volume || 0) > 0 ? ` ${entry.volume} L` : "";
  const dimensions = entry.dimensions && typeof entry.dimensions === "object"
    ? {
        width: Number(entry.dimensions.width || 0),
        height: Number(entry.dimensions.height || 0),
        depth: Number(entry.dimensions.depth || 0)
      }
    : {};
  return {
    name: `${entry.brand || ""} ${entry.name || ""}${volumeSuffix}`.trim(),
    weight: Math.max(0, Math.round(Number(entry.weight || 0))),
    volume: Math.max(0, Number(entry.volume || 0)),
    color: String(entry.color || ""),
    dimensions,
    manufacturerCatalogSource: {
      kind: "manufacturer-bag",
      provider: "ortlieb.com",
      catalogId: String(entry.id || ""),
      brand: String(entry.brand || ""),
      sku: String(entry.sku || ""),
      sourceUrl: String(entry.sourceUrl || ""),
      sourceImageUrl: String(entry.sourceImageUrl || "")
    }
  };
}

export function manufacturerBagSourceMeta(entry) {
  const draft = manufacturerBagContainerDraft(entry);
  return draft?.manufacturerCatalogSource
    ? { manufacturerCatalogSource: { ...draft.manufacturerCatalogSource } }
    : {};
}
