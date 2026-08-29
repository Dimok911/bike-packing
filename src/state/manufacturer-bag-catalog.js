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
    mountingOptions: entry?.mountingOptions,
    description: entry?.description,
    aliases: entry?.aliases,
    weight: entry?.weight,
    weightOptions: entry?.weightOptions,
    volume: entry?.volume,
    volumeOptions: entry?.volumeOptions,
    volumePerBag: entry?.volumePerBag,
    volumePerBagOptions: entry?.volumePerBagOptions,
    totalVolume: entry?.totalVolume,
    totalVolumeOptions: entry?.totalVolumeOptions,
    specificationBasis: entry?.specificationBasis,
    setQuantity: entry?.setQuantity,
    variants: entry?.variants,
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

function positiveCatalogNumbers(values = [], fallback = 0) {
  const normalized = (Array.isArray(values) ? values : [fallback])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(normalized)].sort((left, right) => left - right);
}

export function manufacturerBagCatalogSetQuantity(entry) {
  if (!entry?.soldAsSet) return 1;
  const quantity = Math.floor(Number(entry?.setQuantity || 2));
  return quantity > 1 ? quantity : 2;
}

export function manufacturerBagCatalogPerBagSpecifications(entry) {
  return entry?.specificationBasis === "per-bag" && manufacturerBagCatalogSetQuantity(entry) > 1;
}

export function manufacturerBagCatalogVolumeMetrics(entry) {
  const quantity = manufacturerBagCatalogSetQuantity(entry);
  const perBag = positiveCatalogNumbers(entry?.volumePerBagOptions, entry?.volumePerBag || entry?.volume);
  const total = positiveCatalogNumbers(
    entry?.totalVolumeOptions,
    entry?.totalVolume || (manufacturerBagCatalogPerBagSpecifications(entry) ? perBag[0] * quantity : entry?.volume)
  );
  return {
    quantity,
    perBag: manufacturerBagCatalogPerBagSpecifications(entry) ? perBag : [],
    total: total.length ? total : positiveCatalogNumbers(entry?.volumeOptions, entry?.volume)
  };
}

export function manufacturerBagCatalogWeightMetrics(entry) {
  const quantity = manufacturerBagCatalogSetQuantity(entry);
  const perBag = positiveCatalogNumbers(entry?.weightPerBagOptions, entry?.weightPerBag || entry?.weight);
  const total = positiveCatalogNumbers(
    entry?.totalWeightOptions,
    entry?.totalWeight || (manufacturerBagCatalogPerBagSpecifications(entry) ? perBag[0] * quantity : entry?.weight)
  );
  return {
    quantity,
    perBag: manufacturerBagCatalogPerBagSpecifications(entry) ? perBag : [],
    total: total.length ? total : positiveCatalogNumbers(entry?.weightOptions, entry?.weight)
  };
}

function manufacturerBagCatalogVariantSetKind(entry, variant = {}) {
  const title = String(variant?.title || "");
  if (/\bpair\b/i.test(title)) return "pair";
  if (/\bunit\b/i.test(title)) return "single";
  return entry?.soldAsSet ? "pair" : "single";
}

export function manufacturerBagCatalogVariantChoices(entry) {
  const variants = Array.isArray(entry?.variants) ? entry.variants : [];
  const choices = new Map();
  variants.forEach((variant) => {
    const volume = Number(variant?.volume || entry?.volume || 0);
    const mounting = String(variant?.mounting || entry?.mounting || "").trim();
    const setKind = manufacturerBagCatalogVariantSetKind(entry, variant);
    const key = `${volume}|${mounting}|${setKind}`;
    const current = choices.get(key);
    if (!current || (!current.available && variant?.available)) {
      choices.set(key, { ...variant, volume, mounting, setKind });
    }
  });
  if (!choices.size && entry) {
    choices.set("default", {
      sku: String(entry.sku || ""),
      title: String(entry.variant || ""),
      color: String(entry.color || ""),
      volume: Number(entry.volume || 0),
      weight: Number(entry.weight || 0),
      mounting: String(entry.mounting || ""),
      setKind: entry.soldAsSet ? "pair" : "single",
      available: entry.available !== false
    });
  }
  return [...choices.values()].sort((left, right) => Number(left.volume || 0) - Number(right.volume || 0)
    || String(left.mounting || "").localeCompare(String(right.mounting || ""))
    || String(left.setKind || "").localeCompare(String(right.setKind || "")));
}

export function manufacturerBagCatalogVariantEntry(entry, sku = "") {
  if (!entry || typeof entry !== "object") return null;
  const choices = manufacturerBagCatalogVariantChoices(entry);
  const selected = choices.find((variant) => variant.sku === String(sku || "")) || choices[0];
  if (!selected) return { ...entry };
  const referenceWeight = Number(entry.weight || 0);
  const variantWeight = Number(selected.weight || 0);
  const weightIsPlausible = variantWeight > 0 && (!referenceWeight
    || (variantWeight >= referenceWeight / 4 && variantWeight <= referenceWeight * 4));
  const volume = Number(selected.volume || entry.volume || 0);
  const mounting = String(selected.mounting || entry.mounting || "");
  const samePrimarySize = !volume || volume === Number(entry.volume || 0);
  const setQuantity = manufacturerBagCatalogSetQuantity({ ...entry, soldAsSet: selected.setKind === "pair" });
  const specificationsPerBag = manufacturerBagCatalogPerBagSpecifications(entry) && selected.setKind === "pair";
  const selectedWeight = weightIsPlausible ? variantWeight : referenceWeight;
  return {
    ...entry,
    sku: String(selected.sku || entry.sku || ""),
    variant: String(selected.title || entry.variant || ""),
    weight: selectedWeight,
    weightOptions: [selectedWeight].filter((value) => value > 0),
    volume,
    volumeOptions: [volume].filter((value) => value > 0),
    color: String(selected.color || entry.color || ""),
    mounting,
    mountingOptions: mounting ? [mounting] : [],
    soldAsSet: selected.setKind === "pair",
    ...(specificationsPerBag ? {
      specificationBasis: "per-bag",
      setQuantity,
      volumePerBag: volume,
      volumePerBagOptions: [volume].filter((value) => value > 0),
      totalVolume: volume * setQuantity,
      totalVolumeOptions: [volume * setQuantity].filter((value) => value > 0),
      weightPerBag: selectedWeight,
      weightPerBagOptions: [selectedWeight].filter((value) => value > 0),
      totalWeight: selectedWeight * setQuantity,
      totalWeightOptions: [selectedWeight * setQuantity].filter((value) => value > 0)
    } : {}),
    available: selected.available !== false,
    dimensions: samePrimarySize ? entry.dimensions : {}
  };
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
    const merged = {
      ...entry,
      ...override,
      dimensions: override.dimensions ? { ...(entry.dimensions || {}), ...override.dimensions } : entry.dimensions,
      description: override.description ? { ...(entry.description || {}), ...override.description } : entry.description
    };
    if (!manufacturerBagCatalogPerBagSpecifications(merged)) return merged;
    const quantity = manufacturerBagCatalogSetQuantity(merged);
    if (override.volume !== undefined) {
      merged.volumePerBag = override.volume;
      merged.volumePerBagOptions = [override.volume].filter((value) => value > 0);
      merged.totalVolume = override.volume * quantity;
      merged.totalVolumeOptions = [merged.totalVolume].filter((value) => value > 0);
    }
    if (override.weight !== undefined) {
      merged.weightPerBag = override.weight;
      merged.weightPerBagOptions = [override.weight].filter((value) => value > 0);
      merged.totalWeight = override.weight * quantity;
      merged.totalWeightOptions = [merged.totalWeight].filter((value) => value > 0);
    }
    if (override.loadKg !== undefined) {
      merged.loadPerBagKg = override.loadKg;
      merged.totalLoadKg = override.loadKg * quantity;
    }
    return merged;
  });
}

export function manufacturerBagContainerDraft(entry) {
  if (!entry || typeof entry !== "object") return null;
  const volumeMetrics = manufacturerBagCatalogVolumeMetrics(entry);
  const weightMetrics = manufacturerBagCatalogWeightMetrics(entry);
  const volume = Number(volumeMetrics.total[0] || entry.volume || 0);
  const weight = Number(weightMetrics.total[0] || entry.weight || 0);
  const perBagVolume = Number(volumeMetrics.perBag[0] || 0);
  const volumeSuffix = volume > 0
    ? ` ${volume} L${perBagVolume > 0 ? ` (${volumeMetrics.quantity} × ${perBagVolume} L)` : ""}`
    : "";
  const dimensions = entry.dimensions && typeof entry.dimensions === "object"
    ? {
        width: Number(entry.dimensions.width || 0),
        height: Number(entry.dimensions.height || 0),
        depth: Number(entry.dimensions.depth || 0)
      }
    : {};
  return {
    name: `${entry.brand || ""} ${entry.name || ""}${volumeSuffix}`.trim(),
    weight: Math.max(0, Math.round(weight)),
    volume: Math.max(0, volume),
    color: String(entry.color || ""),
    dimensions,
    manufacturerCatalogSource: {
      kind: "manufacturer-bag",
      provider: String(entry.provider || "manufacturer-catalog"),
      catalogId: String(entry.id || ""),
      brand: String(entry.brand || ""),
      sku: String(entry.sku || ""),
      sourceUrl: String(entry.sourceUrl || ""),
      sourceImageUrl: String(entry.sourceImageUrl || ""),
      setQuantity: manufacturerBagCatalogSetQuantity(entry),
      specificationBasis: String(entry.specificationBasis || "product"),
      volumePerBag: perBagVolume,
      totalVolume: volume
    }
  };
}

export function manufacturerBagSourceMeta(entry) {
  const draft = manufacturerBagContainerDraft(entry);
  return draft?.manufacturerCatalogSource
    ? { manufacturerCatalogSource: { ...draft.manufacturerCatalogSource } }
    : {};
}
