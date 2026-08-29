const FIXED_VOLUMES_BY_SOURCE_ID = new Map([
  ["ortlieb-accessory-pack", [3.5]],
  ["ortlieb-atrack-bike", [25]],
  ["ortlieb-back-roller-20l", [20]],
  ["ortlieb-back-roller-20l-pair", [20]],
  ["ortlieb-back-roller-35l-mesh-pocket-pair", [35]],
  ["ortlieb-back-roller-core", [20]],
  ["ortlieb-back-roller-plus", [23]],
  ["ortlieb-bike-packer", [20]],
  ["ortlieb-bike-packer-plus", [21]],
  ["ortlieb-commuter-bag-urban", [20]],
  ["ortlieb-fuel-pack", [1]],
  ["ortlieb-gravel-pack", [14.5]],
  ["ortlieb-gravel-pack-single", [14.5]],
  ["ortlieb-handlebar-pack-plus", [11]],
  ["ortlieb-handlebar-pack-qr", [11]],
  ["ortlieb-office-bag", [21]],
  ["ortlieb-pedal-mate", [16]],
  ["ortlieb-sport-packer", [15]],
  ["ortlieb-sport-roller-14-5l", [14.5]],
  ["ortlieb-sport-roller-core", [14.5]],
  ["ortlieb-sport-roller-pair", [14.5]],
  ["ortlieb-toptube-bag", [1.5]],
  ["ortlieb-trunk-bag", [12]],
  ["ortlieb-trunk-bag-rc", [12]],
  ["ortlieb-twin-city-urban", [9]],
  ["ortlieb-up-town", [17.5]],
  ["ortlieb-up-town-rack", [17.5]],
  ["ortlieb-vario-20l", [20]],
  ["ortlieb-vario-26l", [26]],
  ["ortlieb-vario-lite", [26]],
  ["ortlieb-velo-shopper", [18]],
  ["ortlieb-velo-sling", [3]],
  ["arkel-orca-city-backpack-pannier", [22]],
  ["arkel-exp-waterproof-top-tube-1l", [1]]
]);

const OFFICIAL_SPLIT_WEIGHT_OPTIONS = new Map([
  ["arkel-orca-panniers|12.5|single", [700, 775]],
  ["arkel-orca-panniers|12.5|pair", [1400, 1550]],
  ["arkel-orca-panniers|17.5|single", [930, 1060]],
  ["arkel-orca-panniers|17.5|pair", [1860, 2120]],
  ["arkel-orca-panniers|22.5|single", [1010, 1145]],
  ["arkel-orca-panniers|22.5|pair", [2020, 2290]]
]);

// Derive one-bag volume only when the official source confirms equal bags.
// Composite and unverified sets must keep their total without arithmetic splitting.
const VOLUME_SET_BASIS_BY_SOURCE_ID = new Map([
  ["arkel-dry-lites-saddle-bags", "equal-bags"],
  ["arkel-t-42-classic-touring-panniers", "equal-bags"],
  ["arkel-gt-54-classic-touring-panniers", "composite-set"]
]);

export function manufacturerBagCatalogFixedVolumes(sourceId = "") {
  return [...(FIXED_VOLUMES_BY_SOURCE_ID.get(String(sourceId || "")) || [])];
}

function positiveNumbers(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))]
    .sort((left, right) => left - right);
}

function formatNumber(value) {
  return Number(value).toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false });
}

function volumeSlug(value) {
  return `${formatNumber(value).replace(".", "-")}l`;
}

export function manufacturerBagCatalogVariantSetKind(entry, variant = {}) {
  const title = String(variant?.title || "");
  if (/\bpair\b/i.test(title)) return "pair";
  if (/\bunit\b/i.test(title)) return "single";
  return entry?.soldAsSet ? "pair" : "single";
}

export function manufacturerBagCatalogVariantMounting(variant = {}) {
  const title = String(variant?.title || "").toLowerCase();
  if (/ql\s*3[.,]?1|ql31/.test(title)) return "Quick-Lock3.1";
  if (/ql\s*2[.,]?2|ql22/.test(title)) return "Quick-Lock2.2";
  if (/ql\s*2[.,]?1|ql21/.test(title)) return "Quick-Lock2.1";
  if (/\bqls\b/.test(title)) return "Quick-LockS";
  return String(variant?.mounting || "").trim();
}

export function manufacturerBagCatalogSkuModelGroups(entry = {}) {
  const variants = Array.isArray(entry.variants) ? entry.variants : [];
  if (variants.length < 2) return [];
  const explicitVolumes = variants.map((variant) => Number(variant?.volume || 0));
  const separateVolumes = explicitVolumes.every((volume) => volume > 0)
    && new Set(explicitVolumes).size > 1;
  const explicitSetKinds = new Set(variants
    .map((variant) => /\b(pair|unit)\b/i.exec(String(variant?.title || ""))?.[1]?.toLowerCase())
    .filter(Boolean));
  const separateSetKinds = explicitSetKinds.size > 1;
  if (!separateVolumes && !separateSetKinds) return [];
  const groups = new Map();
  variants.forEach((variant) => {
    const explicitVolume = Number(variant.volume || 0);
    const volume = separateVolumes ? explicitVolume : Number(entry.volume || explicitVolume || 0);
    const setKind = manufacturerBagCatalogVariantSetKind(entry, variant);
    const key = [
      separateVolumes ? volume : "product",
      separateSetKinds ? setKind : "product"
    ].join("|");
    const group = groups.get(key) || {
      key,
      volume,
      setKind,
      separateVolumes,
      separateSetKinds,
      variants: []
    };
    group.variants.push({ ...variant, mounting: manufacturerBagCatalogVariantMounting(variant) });
    groups.set(key, group);
  });
  return groups.size > 1
    ? [...groups.values()].sort((left, right) => left.volume - right.volume || left.setKind.localeCompare(right.setKind))
    : [];
}

function normalizedMountingEntry(entry) {
  const variants = (Array.isArray(entry?.variants) ? entry.variants : []).map((variant) => ({
    ...variant,
    mounting: manufacturerBagCatalogVariantMounting(variant)
  }));
  const mountingOptions = [...new Set(variants.map(({ mounting }) => mounting).filter(Boolean))];
  return mountingOptions.length
    ? { ...entry, variants, mounting: mountingOptions.join(" / "), mountingOptions }
    : entry;
}

function fixedVolumeEntry(rawEntry) {
  const entry = normalizedMountingEntry(rawEntry);
  const fixed = manufacturerBagCatalogFixedVolumes(entry?.sourceProductId || entry?.id);
  const volumeSetBasis = VOLUME_SET_BASIS_BY_SOURCE_ID.get(String(entry?.sourceProductId || entry?.id || ""));
  const normalized = fixed?.length ? { ...entry, volume: fixed[0], volumeOptions: [...fixed] } : entry;
  return volumeSetBasis ? { ...normalized, volumeSetBasis } : normalized;
}

function groupWeightOptions(entry, group, groups) {
  const official = OFFICIAL_SPLIT_WEIGHT_OPTIONS.get(`${entry.id}|${group.volume}|${group.setKind}`);
  if (official) return [...official];
  const technical = positiveNumbers(entry.weightOptions);
  const volumes = [...new Set(groups.map(({ volume }) => volume))].sort((left, right) => left - right);
  if (entry.brand === "ORTLIEB") {
    const variantWeights = positiveNumbers(group.variants.map(({ weight }) => weight));
    if (variantWeights.length) return variantWeights;
  }
  if (technical.length === 1) return technical;
  if (technical.length === volumes.length && !group.separateSetKinds) {
    return [technical[volumes.indexOf(group.volume)]].filter(Boolean);
  }
  return [];
}

function replaceVolumeSummary(description = "", replacement = "") {
  return String(description || "").replace(
    /\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)+\s*L\b/i,
    replacement
  );
}

function splitEntry(entry, group, groups) {
  const volume = group.volume;
  const quantity = group.setKind === "pair" ? 2 : 1;
  const specificationsPerBag = group.separateSetKinds && group.setKind === "pair";
  const soldAsSet = group.setKind === "pair";
  const totalVolume = specificationsPerBag ? volume * quantity : volume;
  const volumeText = specificationsPerBag
    ? `${formatNumber(totalVolume)} L pair (${formatNumber(volume)} L per bag)`
    : `${formatNumber(volume)} L${soldAsSet ? " pair" : ""}`;
  const volumeNameSuffix = specificationsPerBag
    ? `${formatNumber(totalVolume)} L Pair (2 × ${formatNumber(volume)} L)`
    : `${formatNumber(volume)} L${soldAsSet ? " Pair" : ""}`;
  const nameSuffix = group.separateVolumes || group.separateSetKinds ? volumeNameSuffix : "";
  const variants = group.variants;
  const primaryVariant = variants.find(({ available }) => available) || variants[0] || {};
  const modelWeightOptions = groupWeightOptions(entry, group, groups);
  const perBagWeightOptions = specificationsPerBag
    ? positiveNumbers(modelWeightOptions.map((value) => value / quantity))
    : [];
  const weightOptions = specificationsPerBag ? perBagWeightOptions : modelWeightOptions;
  const idParts = [entry.id];
  if (group.separateVolumes) idParts.push(volumeSlug(volume));
  if (group.separateSetKinds) idParts.push(group.setKind);
  const id = idParts.join("-");
  const description = {
    en: replaceVolumeSummary(entry.description?.en, volumeText),
    ru: replaceVolumeSummary(
      entry.description?.ru,
      specificationsPerBag
        ? `${formatNumber(totalVolume)} L за пару (${formatNumber(volume)} L на одну сумку)`
        : `${formatNumber(volume)} L${soldAsSet ? " за пару" : ""}`
    )
  };
  const variantMountingOptions = [...new Set(variants.map(({ mounting }) => mounting).filter(Boolean))];
  const mountingOptions = variantMountingOptions.length
    ? variantMountingOptions
    : [...new Set((entry.mountingOptions || [entry.mounting]).filter(Boolean))];
  const result = {
    ...entry,
    id,
    sourceProductId: entry.sourceProductId || entry.id,
    name: `${entry.name} ${nameSuffix}`.trim(),
    nameIncludesVolume: group.separateVolumes || group.separateSetKinds,
    variant: `${volumeText} · ${variants.length} SKU`,
    sku: String(primaryVariant.sku || ""),
    weight: weightOptions[0] || 0,
    weightOptions,
    variantWeightsAuthoritative: entry.brand === "ORTLIEB",
    volume,
    volumeOptions: [volume],
    color: String(primaryVariant.color || ""),
    mounting: mountingOptions.join(" / ") || entry.mounting,
    mountingOptions,
    soldAsSet,
    available: variants.some(({ available }) => available),
    variantCount: variants.length,
    availableVariantCount: variants.filter(({ available }) => available).length,
    variants,
    dimensions: group.separateVolumes ? {} : entry.dimensions,
    description,
    aliases: [...new Set([...(entry.aliases || []), entry.id, entry.name])]
  };
  delete result.specificationBasis;
  delete result.setQuantity;
  delete result.volumePerBag;
  delete result.volumePerBagOptions;
  delete result.totalVolume;
  delete result.totalVolumeOptions;
  delete result.weightPerBag;
  delete result.weightPerBagOptions;
  delete result.totalWeight;
  delete result.totalWeightOptions;
  delete result.loadPerBagKg;
  delete result.totalLoadKg;
  if (specificationsPerBag) {
    Object.assign(result, {
      specificationBasis: "per-bag",
      setQuantity: quantity,
      volumePerBag: volume,
      volumePerBagOptions: [volume],
      totalVolume,
      totalVolumeOptions: [totalVolume],
      weightPerBag: perBagWeightOptions[0] || 0,
      weightPerBagOptions: perBagWeightOptions,
      totalWeight: modelWeightOptions[0] || 0,
      totalWeightOptions: modelWeightOptions
    });
  }
  return result;
}

export function splitManufacturerBagCatalogSkuModels(catalog = []) {
  return (Array.isArray(catalog) ? catalog : []).flatMap((rawEntry) => {
    const entry = fixedVolumeEntry(rawEntry);
    const groups = manufacturerBagCatalogSkuModelGroups(entry);
    return groups.length ? groups.map((group) => splitEntry(entry, group, groups)) : [entry];
  });
}

export function assertManufacturerBagCatalogSkuModels(catalog = []) {
  const compound = (Array.isArray(catalog) ? catalog : [])
    .filter((entry) => manufacturerBagCatalogSkuModelGroups(entry).length > 1)
    .map(({ id }) => id);
  if (compound.length) {
    throw new Error(`Catalog entries still combine distinct SKU models: ${compound.join(", ")}`);
  }
  const duplicateIds = (Array.isArray(catalog) ? catalog : [])
    .map(({ id }) => id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) throw new Error(`Duplicate catalog ids: ${[...new Set(duplicateIds)].join(", ")}`);
  return catalog;
}
