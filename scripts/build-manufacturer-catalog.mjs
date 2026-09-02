import { readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertManufacturerBagCatalogSkuModels,
  manufacturerBagCatalogFixedVolumes,
  splitManufacturerBagCatalogSkuModels
} from "../src/data/manufacturer-bag-catalog-variants.js";
import {
  buildTailfinCatalogEntry,
  tailfinCatalogTargets,
} from "./manufacturer-catalog/tailfin-adapter.mjs";
import {
  apiduraCatalogTargets,
  buildApiduraCatalogEntry,
} from "./manufacturer-catalog/apidura-adapter.mjs";
import {
  buildRestrapCatalogEntry,
  restrapCatalogTargets,
} from "./manufacturer-catalog/restrap-adapter.mjs";
import {
  buildRevelateCatalogEntry,
  revelateCatalogTargets,
} from "./manufacturer-catalog/revelate-adapter.mjs";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceDir = resolve(args.get("--source-dir") || ".");
const pagesDir = resolve(args.get("--pages-dir") || join(sourceDir, ".catalog-pages"));
const outputPath = resolve(args.get("--output") || "src/data/manufacturer-bag-catalog.generated.js");
const imageManifestPath = resolve(args.get("--image-manifest") || "manufacturer-catalog-images.json");
const checkedAt = args.get("--checked-at") || new Date().toISOString().slice(0, 10);
const approvedCatalogPath = args.get("--approved-catalog")
  ? resolve(args.get("--approved-catalog"))
  : "";
const requestedManufacturers = new Set(String(args.get("--manufacturers") || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean));
const manufacturerRequested = (id) => !requestedManufacturers.size || requestedManufacturers.has(id);

const ORTLIEB_COLLECTION_FILES = [
  "ortlieb-bikepacking.json",
  "ortlieb-frame-bags.json",
  "ortlieb-handlebar-bags.json",
  "ortlieb-panniers.json",
  "ortlieb-rack-top-bags.json",
  "ortlieb-saddle-bags.json"
];

const RESTRAP_COLLECTION_FILES = [
  "restrap-cockpit.json",
  "restrap-frame.json",
  "restrap-bar.json",
  "restrap-panniers-fork.json",
  "restrap-rack.json",
  "restrap-saddle.json",
  "restrap-on-body.json",
];

const ORTLIEB_EXCLUDED = new Set([
  "quick-rack",
  "cyber-bikepacking-bundle",
  "handlebar-pack-qr-inner-pocket"
]);

const ARKEL_EXCLUDED = new Set([
  "orca-pannier-organizer",
  "rollpacker-bag-only-no-hanger"
]);

const ORTLIEB_CATEGORY = {
  "seat-pack": "saddle",
  "seat-pack-qr": "saddle",
  "micro-bag": "saddle",
  "saddle-bag": "saddle",
  "fork-pack": "fork",
  "dry-pack": "rack-top",
  "up-town-rack": "rack-top",
  "rack-pack": "rack-top",
  "trunk-bag": "rack-top",
  "trunk-bag-rc": "rack-top",
  "frame-pack-toptube": "frame",
  "frame-pack-rc-toptube": "frame",
  "frame-pack": "frame",
  "frame-pack-rc": "frame",
  "fuel-pack": "top-tube",
  "toptube-bag": "top-tube",
  "handlebar-pack": "handlebar",
  "velo-sling": "handlebar",
  "accessory-pack": "handlebar",
  "handlebar-pack-flex": "handlebar",
  "handlebar-pack-qr": "handlebar",
  "velo-sling-flex": "handlebar",
  "ultimate": "handlebar",
  "handlebar-pack-plus": "handlebar",
  "up-town": "handlebar",
  "atrack-bike": "backpack",
  "vario-20l": "hybrid-pannier",
  "vario-26l": "hybrid-pannier",
  "vario-lite": "hybrid-pannier",
  "sport-roller-pair": "pannier",
  "sport-roller-14-5l": "pannier",
  "sport-roller-core": "pannier",
  "sport-packer": "pannier"
};

const ARKEL_CATEGORY = {
  "bb-packer-handlebar-bag": "handlebar",
  "burrito-handlebar-bag": "handlebar",
  "handlebar-bag": "handlebar",
  "le-petit-handlebar-bag": "handlebar",
  "rollpacker-front-bikepacking-bag": "handlebar",
  "signature-bb-handlebar-bag": "handlebar",
  "arkel-forkpacker-omm-flip-fork-bag-and-cage": "fork",
  "rollpacker-bikepacking-bag": "saddle",
  "saddle-bag": "saddle",
  "seatpacker-seat-bag-hanger-kit": "saddle",
  "top-tube-bag": "top-tube",
  "exp-waterproof-top-tube-1l": "top-tube",
  "exp-waterproof-top-tube-1l-copy": "top-tube",
  "water-resistant-frame-bag": "frame",
  "waterproof-frame-bag": "frame",
  "tailrider-trunk-bag": "rack-top",
  "tailrider-rolltop-trunk-bag": "rack-top",
  "bug-2-0-pannier-backpack": "hybrid-pannier",
  "gt-18bp-convertible-backpack-pannier": "hybrid-pannier",
  "orca-city-backpack-pannier": "hybrid-pannier",
  "dolphin-16l-waterproof-pannier": "pannier",
  "orca-panniers": "pannier",
  "t-28-classic-touring-panniers": "pannier",
  "gt-18-classic-touring-pannier": "pannier",
  "signature-d-rolltop-backpack": "backpack",
  "metropolitan-waterproof-rolltop-backpack": "backpack",
  "wellington-messenger-bag": "shoulder-waist",
  "mont-royal-sling-bag": "shoulder-waist",
  "heavy-duty-tote-bag": "shoulder-waist"
};

const CATEGORY_META = {
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", aliases: ["seat bag", "saddle bag", "подседельная", "седельная"] },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", aliases: ["handlebar bag", "bar bag", "рулевая", "на руль"] },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", aliases: ["frame bag", "нарамная", "в раму", "рамная"] },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", aliases: ["top tube", "toptube", "на верхнюю трубу", "бензобак"] },
  fork: { family: "bikepacking", en: "fork bag", ru: "сумка на вилку", aliases: ["fork bag", "cargo cage", "на вилку", "вилочная"] },
  pannier: { family: "panniers", en: "pannier", ru: "панир", aliases: ["pannier", "front pannier", "rear pannier", "панир", "передний панир", "задний панир"] },
  "hybrid-pannier": { family: "panniers", en: "convertible pannier", ru: "панир-трансформер", aliases: ["pannier backpack", "convertible pannier", "панир рюкзак", "трансформер"] },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", aliases: ["rack top", "trunk bag", "сумка на багажник", "багажная сумка"] },
  backpack: { family: "carry", en: "backpack", ru: "рюкзак", aliases: ["backpack", "rucksack", "рюкзак"] },
  "shoulder-waist": { family: "carry", en: "shoulder or waist bag", ru: "наплечная или поясная сумка", aliases: ["messenger bag", "shoulder bag", "waist bag", "hip pack", "tote", "sling", "курьерская", "наплечная", "поясная", "тоут", "слинг"] }
};

const ARKEL_REAR_PANNIERS = new Set([
  "commuter-urban-pannier",
  "dolphin-24l-waterproof-pannier",
  "dry-lites-saddle-bags",
  "gt-54-classic-touring-panniers",
  "haul-it-versatile-pannier",
  "metropolitan-urban-pannier",
  "shopper-urban-pannier",
  "signature-h-urban-pannier",
  "signature-m-waterproof-urban-pannier",
  "signature-v-urban-pannier",
  "t-42-classic-touring-panniers"
]);

const SET_PRODUCT_HANDLES = new Set([
  "back-roller-20l-pair",
  "gravel-pack",
  "sport-roller-pair",
  "back-roller-35l-mesh-pocket-pair",
  "bike-packer-plus",
  "bike-packer",
  "sport-packer",
  "dry-lites-saddle-bags",
  "gt-54-classic-touring-panniers",
  "t-28-classic-touring-panniers",
  "t-42-classic-touring-panniers"
]);

// ORTLIEB labels the technical table on these official pair pages "Per bag".
// Keep the source values intact and derive explicit totals for the sold pair.
const ORTLIEB_PER_BAG_PAIR_HANDLES = new Set([
  "back-roller-20l-pair",
  "back-roller-35l-mesh-pocket-pair",
  "bike-packer",
  "bike-packer-plus",
  "gravel-pack",
  "sport-packer",
  "sport-roller-pair"
]);

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

function uniqueNumbers(values = []) {
  return [...new Set(values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))]
    .sort((left, right) => left - right);
}

function valuesByRegex(value, regex, convert = Number) {
  return [...String(value || "").matchAll(regex)].map((match) => convert(match[1], match));
}

function volumeValues(value = "") {
  return uniqueNumbers(valuesByRegex(value, /((?:\d+(?:[.,]\d+)?)|(?:[.,]\d+))\s*(?:L|lit(?:er|re)s?)\b/gi, (raw) => Number(raw.replace(",", "."))));
}

function gramsFromText(value = "") {
  const weightFragments = [...String(value || "").matchAll(/Weight[^\n]{0,180}/gi)]
    .map((match) => match[0])
    .filter((fragment) => !/weight\s+capacity|maximum\s+weight|weight\s+limit/i.test(fragment));
  const grams = weightFragments.flatMap((fragment) => valuesByRegex(fragment, /(\d+(?:[.,]\d+)?)\s*g\b/gi, (raw) => Number(raw.replace(",", "."))));
  const kilograms = weightFragments.flatMap((fragment) => valuesByRegex(fragment, /(\d+(?:[.,]\d+)?)\s*kg\b/gi, (raw) => Number(raw.replace(",", ".")) * 1000));
  return uniqueNumbers([...grams, ...kilograms].filter((weight) => weight >= 20));
}

function inchToCentimeters(value) {
  return Math.round(Number(value) * 2.54 * 10) / 10;
}

function ouncesToGrams(value) {
  return Math.round(Number(value) * 28.3495);
}

function poundsToKilograms(value) {
  return Math.round(Number(value) * 0.453592 * 10) / 10;
}

function extractOrtliebSpecs(html = "") {
  const rows = {};
  const rowPattern = /<div class="specifications-table__row">([\s\S]*?)<\/div>/gi;
  for (const match of String(html).matchAll(rowPattern)) {
    const paragraphs = [...match[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((part) => plainText(part[1]));
    if (paragraphs.length >= 2 && paragraphs[0] && !rows[paragraphs[0]]) rows[paragraphs[0]] = paragraphs[1];
  }
  const dimension = (label) => {
    const raw = rows[label] || "";
    const inches = raw.match(/(\d+(?:\.\d+)?)\s*in\b/i)?.[1];
    return inches ? inchToCentimeters(inches) : Number(raw.match(/(\d+(?:\.\d+)?)\s*cm\b/i)?.[1] || 0);
  };
  const weightRaw = rows.Weight || "";
  const weight = weightRaw.match(/(\d+(?:\.\d+)?)\s*oz\b/i)
    ? ouncesToGrams(weightRaw.match(/(\d+(?:\.\d+)?)\s*oz\b/i)[1])
    : Number(weightRaw.match(/(\d+(?:\.\d+)?)\s*g\b/i)?.[1] || 0);
  const loadRaw = rows.Load || "";
  const loadKg = loadRaw.match(/(\d+(?:\.\d+)?)\s*lb\b/i)
    ? poundsToKilograms(loadRaw.match(/(\d+(?:\.\d+)?)\s*lb\b/i)[1])
    : Number(loadRaw.match(/(\d+(?:\.\d+)?)\s*kg\b/i)?.[1] || 0);
  return {
    dimensions: {
      width: dimension("Width"),
      height: dimension("Height"),
      depth: dimension("Depth")
    },
    loadKg,
    material: rows.Material || "",
    volumeOptions: volumeValues(rows.Volume || ""),
    waterproof: rows.Waterproof?.match(/IP\d{2}/i)?.[0]?.toUpperCase() || (rows.Waterproof || ""),
    weightOptions: weight > 0 ? [weight] : []
  };
}

function technicalSection(html = "") {
  const normalized = String(html || "");
  const start = normalized.search(/Technical Specifications/i);
  if (start < 0) return plainText(normalized.slice(0, 25_000));
  const recommendations = normalized.indexOf("product-recommendations", start);
  const end = recommendations > start
    ? recommendations
    : Math.min(normalized.length, start + 22_000);
  return plainText(normalized.slice(start, end));
}

function extractArkelSpecs(html = "") {
  const text = technicalSection(html);
  const dimension = (...labels) => {
    for (const label of labels) {
      const match = text.match(new RegExp(`${label}\\s*:\\s*(\\d+(?:[.,]\\d+)?)\\s*(cm|in(?:ches)?)\\b`, "i"));
      if (!match) continue;
      const value = Number(match[1].replace(",", "."));
      return /^in/i.test(match[2]) ? inchToCentimeters(value) : value;
    }
    return 0;
  };
  const loadValues = uniqueNumbers([
    ...valuesByRegex(text, /Maximum Load\s*:\s*(\d+(?:[.,]\d+)?)\s*kg\b/gi, (raw) => Number(raw.replace(",", "."))),
    ...valuesByRegex(text, /Maximum Load\s*:\s*(\d+(?:[.,]\d+)?)\s*lb/gi, (raw) => poundsToKilograms(raw.replace(",", ".")))
  ]);
  return {
    dimensions: {
      width: dimension("Width", "Length"),
      height: dimension("Height"),
      depth: dimension("Depth")
    },
    loadKg: loadValues.at(-1) || 0,
    material: "",
    volumeOptions: volumeValues(text),
    waterproof: /waterproof/i.test(text) ? "Waterproof" : "",
    weightOptions: gramsFromText(text)
  };
}

function variantVolume(variant = {}) {
  return volumeValues(variant.title || "")[0] || 0;
}

function variantMounting(variant = {}, tags = []) {
  const mountingFrom = (value = "") => {
    const text = String(value).toLowerCase();
    if (/ql\s*3[.,]?1|ql31/.test(text)) return "Quick-Lock3.1";
    if (/ql\s*2[.,]?2|ql22/.test(text)) return "Quick-Lock2.2";
    if (/ql\s*2[.,]?1|ql21/.test(text)) return "Quick-Lock2.1";
    if (/\bqls\b/.test(text)) return "Quick-LockS";
    return "";
  };
  return mountingFrom(variant.title) || mountingFrom((tags || []).join(" "));
}

function genericMounting(brand, category, tags = []) {
  const text = tags.join(" ").toLowerCase();
  if (brand === "Arkel" && text.includes("cam-lock")) return "Cam-Lock";
  return {
    saddle: brand === "Arkel" ? "Straps / saddle-rail hanger" : "Straps / quick release",
    handlebar: "Handlebar straps / mount",
    frame: "Frame straps",
    "top-tube": "Top-tube straps / direct mount",
    fork: brand === "Arkel" ? "Fork cage" : "Quick-LockS",
    pannier: brand === "Arkel" ? "Cam-Lock" : "Quick-Lock",
    "hybrid-pannier": brand === "Arkel" ? "Cam-Lock" : "Quick-Lock",
    "rack-top": "Rack straps / adapter",
    backpack: "Shoulder straps",
    "shoulder-waist": "Shoulder / waist strap or carry handles"
  }[category] || "";
}

function productCategory(brandKey, product) {
  if (brandKey === "ortlieb") return ORTLIEB_CATEGORY[product.handle] || "pannier";
  if (ARKEL_CATEGORY[product.handle]) return ARKEL_CATEGORY[product.handle];
  if (ARKEL_REAR_PANNIERS.has(product.handle) || product.tags?.includes("Panniers")) return "pannier";
  return "shoulder-waist";
}

function productMaterial(brandKey, product, primaryVariant, specs) {
  if (specs.material) return specs.material;
  const variantPrefix = String(primaryVariant?.title || "").split("/")[0].trim();
  if (brandKey === "arkel" && /^(?:XPac|Xpac|Cordura|EcoPak)/i.test(variantPrefix)) return variantPrefix;
  const tags = (product.tags || []).join(" ").toLowerCase();
  if (tags.includes("plus-material")) return "PU-coated Cordura-style fabric";
  if (tags.includes("urban-material")) return "PU-coated textile fabric";
  if (tags.includes("classic-material")) return "PVC-coated polyester";
  return brandKey === "ortlieb" ? "PU-coated technical fabric" : "Technical fabric";
}

function productColor(primaryVariant = {}) {
  const first = String(primaryVariant.title || "").split("/")[0].trim();
  if (!first || /^Default Title$/i.test(first)) return "";
  return first.replace(/^(XPac|Xpac|Cordura|EcoPak)\s+/i, "").trim();
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(extension) ? extension.replace(".jpeg", ".jpg") : ".jpg";
}

function resizedShopifyImage(url = "") {
  const parsed = new URL(url);
  parsed.searchParams.set("width", "700");
  return parsed.toString();
}

function productImageRecords(brandKey, product) {
  const sources = [...new Set([
    ...(Array.isArray(product.images) ? product.images.map((image) => image?.src) : []),
    product.image?.src
  ].map((value) => String(value || "").trim()).filter(Boolean))];
  return sources.map((source, index) => ({
    output: `assets/manufacturer-catalog/${brandKey}/${product.handle}${index ? `-${index + 1}` : ""}${safeImageExtension(source)}`,
    url: resizedShopifyImage(source)
  }));
}

function compactVariant(variant, product) {
  const mounting = variantMounting(variant, product.tags);
  return {
    sku: String(variant.sku || ""),
    title: String(variant.title || ""),
    color: productColor(variant),
    volume: variantVolume(variant),
    weight: Number(variant.grams || 0) > 10 ? Math.round(Number(variant.grams)) : 0,
    mounting,
    available: Boolean(variant.available)
  };
}

function summaryValues(values, unit) {
  if (!values.length) return "";
  return `${values.join(" / ")} ${unit}`;
}

function capitalizeSentence(value = "") {
  const normalized = String(value || "");
  return normalized ? `${normalized[0].toLocaleUpperCase()}${normalized.slice(1)}` : "";
}

async function normalizeProduct({ brandKey, product }) {
  const brand = brandKey === "ortlieb" ? "ORTLIEB" : "Arkel";
  const category = productCategory(brandKey, product);
  const categoryMeta = CATEGORY_META[category];
  const pagePath = join(pagesDir, brandKey, `${product.handle}.html`);
  const html = await readFile(pagePath, "utf8");
  const specs = brandKey === "ortlieb" ? extractOrtliebSpecs(html) : extractArkelSpecs(html);
  const variants = (product.variants || []).map((variant) => compactVariant(variant, product));
  const primaryVariant = variants.find((variant) => variant.available && variant.weight > 0)
    || variants.find((variant) => variant.available)
    || variants[0]
    || {};
  const fixedVolumes = manufacturerBagCatalogFixedVolumes(`${brandKey}-${product.handle}`);
  const variantVolumes = uniqueNumbers(variants.map((variant) => variant.volume));
  const volumeOptions = variantVolumes.length
    ? variantVolumes
    : fixedVolumes.length
      ? uniqueNumbers(fixedVolumes)
      : uniqueNumbers(specs.volumeOptions);
  const technicalWeights = specs.weightOptions.filter((weight) => weight >= 20 && weight < 10_000);
  const variantWeights = uniqueNumbers(variants.map((variant) => variant.weight).filter((weight) => weight >= 20 && weight < 10_000));
  const weightOptions = technicalWeights.length ? technicalWeights : variantWeights;
  const mountingOptions = [...new Set(variants.map((variant) => variant.mounting).filter(Boolean))];
  if (!mountingOptions.length) mountingOptions.push(genericMounting(brand, category, product.tags || []));
  const imageRecords = productImageRecords(brandKey, product);
  if (!imageRecords.length) throw new Error(`Missing image for ${brandKey}:${product.handle}`);
  const imageAssetPaths = imageRecords.map(({ output }) => output);
  const sourceImageUrls = imageRecords.map(({ url }) => url);
  const sourceUrl = `${brandKey === "ortlieb" ? "https://us.ortlieb.com" : "https://arkel.ca"}/products/${product.handle}`;
  const soldAsSet = SET_PRODUCT_HANDLES.has(product.handle);
  const setQuantity = soldAsSet ? 2 : 1;
  const specificationsPerBag = brandKey === "ortlieb" && ORTLIEB_PER_BAG_PAIR_HANDLES.has(product.handle);
  const totalVolumeOptions = specificationsPerBag
    ? uniqueNumbers(volumeOptions.map((value) => value * setQuantity))
    : volumeOptions;
  const totalWeightOptions = specificationsPerBag
    ? uniqueNumbers(weightOptions.map((value) => value * setQuantity))
    : weightOptions;
  const totalLoadKg = specificationsPerBag && Number(specs.loadKg || 0) > 0
    ? Math.round(Number(specs.loadKg) * setQuantity * 100) / 100
    : Number(specs.loadKg || 0);
  const volumeSummary = summaryValues(volumeOptions, "L");
  const totalVolumeSummary = summaryValues(totalVolumeOptions, "L");
  const catalogVolumeSummary = specificationsPerBag
    ? `${totalVolumeSummary} pair (${volumeSummary} per bag)`
    : volumeSummary;
  const setNote = soldAsSet ? " · pair/set" : "";
  const description = {
    en: `${brand} ${categoryMeta.en}${catalogVolumeSummary ? ` in ${catalogVolumeSummary}` : ""}. Technical data is normalized from the official product page.`,
    ru: `${capitalizeSentence(categoryMeta.ru)} ${brand}${catalogVolumeSummary ? ` объёмом ${specificationsPerBag ? `${totalVolumeSummary} за пару (${volumeSummary} на одну сумку)` : catalogVolumeSummary}` : ""}. Характеристики нормализованы по официальной карточке товара.`
  };
  const dimensions = Object.fromEntries(Object.entries(specs.dimensions || {}).filter(([, value]) => Number(value) > 0));
  const availableVariants = variants.filter((variant) => variant.available);
  const waterproof = specs.waterproof
    || ((product.tags || []).some((tag) => String(tag).toLowerCase() === "waterproof") ? "Waterproof" : "");
  return {
    id: `${brandKey}-${product.handle}`,
    brand,
    provider: brandKey === "ortlieb" ? "ortlieb.com" : "arkel.ca",
    family: categoryMeta.family,
    category,
    name: String(product.title || "")
      .replace(/(?:\s+[-–]\s*|\s*[-–]\s+)/g, " – ")
      .replace(/\s+/g, " ")
      .trim(),
    variant: `${catalogVolumeSummary || "Manufacturer model"}${setNote} · ${variants.length} SKU`.trim(),
    sku: primaryVariant.sku || "",
    weight: weightOptions[0] || primaryVariant.weight || 0,
    weightOptions,
    volume: volumeOptions[0] || 0,
    volumeOptions,
    ...(specificationsPerBag ? {
      specificationBasis: "per-bag",
      setQuantity,
      volumePerBag: volumeOptions[0] || 0,
      volumePerBagOptions: volumeOptions,
      totalVolume: totalVolumeOptions[0] || 0,
      totalVolumeOptions,
      weightPerBag: weightOptions[0] || primaryVariant.weight || 0,
      weightPerBagOptions: weightOptions,
      totalWeight: totalWeightOptions[0] || 0,
      totalWeightOptions,
      loadPerBagKg: Number(specs.loadKg || 0),
      totalLoadKg
    } : {}),
    loadKg: Number(specs.loadKg || 0),
    dimensions,
    color: primaryVariant.color || "",
    waterproof,
    material: productMaterial(brandKey, product, primaryVariant, specs),
    mounting: mountingOptions.join(" / "),
    mountingOptions,
    soldAsSet,
    available: availableVariants.length > 0,
    variantCount: variants.length,
    availableVariantCount: availableVariants.length,
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: sourceImageUrls[0],
    sourceImageUrls,
    sourceUrl,
    sourceCheckedAt: checkedAt,
    description,
    aliases: [...new Set([
      ...(categoryMeta.aliases || []),
      ...(product.tags || []),
      product.handle.replace(/-/g, " ")
    ])]
  };
}

async function readProducts(fileName) {
  return JSON.parse(await readFile(join(sourceDir, fileName), "utf8")).products || [];
}

const ortliebByHandle = new Map();
if (manufacturerRequested("ortlieb")) {
  for (const fileName of ORTLIEB_COLLECTION_FILES) {
    for (const product of await readProducts(fileName)) {
      if (!ORTLIEB_EXCLUDED.has(product.handle)) ortliebByHandle.set(product.handle, product);
    }
  }
}

const arkelProducts = manufacturerRequested("arkel")
  ? (await readProducts("arkel-products.json")).filter((product) => !ARKEL_EXCLUDED.has(product.handle))
  : [];

const tailfinTargets = manufacturerRequested("tailfin")
  ? tailfinCatalogTargets(await readFile(join(sourceDir, "tailfin-shop.html"), "utf8"))
  : [];
const apiduraTargets = manufacturerRequested("apidura")
  ? apiduraCatalogTargets(await readFile(join(sourceDir, "apidura-product-sitemap.xml"), "utf8"))
  : [];
const restrapByHandle = new Map();
if (manufacturerRequested("restrap")) {
  for (const fileName of RESTRAP_COLLECTION_FILES) {
    for (const product of await readProducts(fileName)) restrapByHandle.set(product.handle, product);
  }
}
const restrapTargets = restrapCatalogTargets([...restrapByHandle.values()]);
const revelateTargets = manufacturerRequested("revelate-designs")
  ? revelateCatalogTargets(await readFile(join(sourceDir, "revelate-product-chart.html"), "utf8"))
  : [];

const entries = [];
for (const product of [...ortliebByHandle.values()].sort((left, right) => left.title.localeCompare(right.title))) {
  entries.push(await normalizeProduct({ brandKey: "ortlieb", product }));
}
for (const product of arkelProducts.sort((left, right) => left.title.localeCompare(right.title))) {
  entries.push(await normalizeProduct({ brandKey: "arkel", product }));
}
for (const target of tailfinTargets) {
  entries.push(buildTailfinCatalogEntry({
    html: await readFile(join(pagesDir, "tailfin", `${target.handle}.html`), "utf8"),
    sourceUrl: target.url,
    checkedAt,
  }));
}
for (const target of apiduraTargets) {
  entries.push(buildApiduraCatalogEntry({
    product: target,
    html: await readFile(join(pagesDir, "apidura", `${target.handle}.html`), "utf8"),
    sourceUrl: target.url,
    checkedAt,
  }));
}
for (const target of restrapTargets) {
  entries.push(buildRestrapCatalogEntry({
    product: target,
    html: await readFile(join(pagesDir, "restrap", `${target.handle}.html`), "utf8"),
    sourceUrl: target.url,
    checkedAt,
  }));
}
for (const target of revelateTargets) {
  entries.push(buildRevelateCatalogEntry({
    html: await readFile(join(pagesDir, "revelate-designs", `${target.handle}.html`), "utf8"),
    sourceUrl: target.url,
    checkedAt,
  }));
}

const normalizedEntries = assertManufacturerBagCatalogSkuModels(splitManufacturerBagCatalogSkuModels(entries));
let outputEntries = normalizedEntries;
let catalogCheckedAt = checkedAt;
if (approvedCatalogPath) {
  const approvedModule = await import(`${pathToFileURL(approvedCatalogPath).href}?approved=${Date.now()}`);
  const approvedEntries = approvedModule.MANUFACTURER_BAG_CATALOG
    || approvedModule.MANUFACTURER_BAG_CATALOG_GENERATED
    || [];
  if (requestedManufacturers.size) {
    const brandId = (entry) => String(entry?.brand || "").trim().toLowerCase();
    const approvedBrandOrder = [...new Set(approvedEntries.map(brandId).filter(Boolean))];
    const freshBrands = new Set(normalizedEntries.map(brandId).filter(Boolean));
    outputEntries = approvedBrandOrder.flatMap((id) => {
      if (!requestedManufacturers.has(id)) return approvedEntries.filter((entry) => brandId(entry) === id);
      freshBrands.delete(id);
      return normalizedEntries
        .filter((entry) => brandId(entry) === id)
        .sort((left, right) => String(left.name || "").localeCompare(String(right.name || ""))
          || String(left.id || "").localeCompare(String(right.id || "")));
    });
    for (const id of freshBrands) {
      outputEntries.push(...normalizedEntries.filter((entry) => brandId(entry) === id));
    }
    outputEntries = assertManufacturerBagCatalogSkuModels(outputEntries);
    catalogCheckedAt = checkedAt;
  } else {
    const freshById = new Map(normalizedEntries.map((entry) => [entry.id, entry]));
    outputEntries = approvedEntries.map((approvedEntry) => {
      const freshEntry = freshById.get(approvedEntry.id);
      if (!freshEntry) throw new Error(`Approved catalog entry is missing from current manufacturer source: ${approvedEntry.id}`);
      const { imageUrl, imageUrls, ...approvedData } = approvedEntry;
      return {
        ...approvedData,
        imageAssetPath: freshEntry.imageAssetPath,
        imageAssetPaths: [...freshEntry.imageAssetPaths],
        sourceImageUrl: freshEntry.sourceImageUrl,
        sourceImageUrls: [...freshEntry.sourceImageUrls],
        imagesCheckedAt: checkedAt
      };
    });
  }
  if (!requestedManufacturers.size) {
    catalogCheckedAt = String(outputEntries[0]?.sourceCheckedAt || "previous approved snapshot");
  }
}

const imageManifest = [...new Map(outputEntries.flatMap((entry) => {
  const outputs = Array.isArray(entry.imageAssetPaths) ? entry.imageAssetPaths : [entry.imageAssetPath];
  const urls = Array.isArray(entry.sourceImageUrls) ? entry.sourceImageUrls : [entry.sourceImageUrl];
  return outputs.map((output, index) => [output, {
    id: entry.id,
    output,
    url: urls[index],
    referer: entry.sourceUrl
  }]);
}).filter(([output, item]) => output && item.url)).values()];

const imageDeclarations = outputEntries.map((entry) => {
  const imageAssetPaths = Array.isArray(entry.imageAssetPaths) && entry.imageAssetPaths.length
    ? entry.imageAssetPaths
    : [entry.imageAssetPath].filter(Boolean);
  const declarations = imageAssetPaths.map((imageAssetPath) =>
    `new URL(${JSON.stringify(`../../${imageAssetPath}`)}, import.meta.url).href`
  ).join(", ");
  return `  ${JSON.stringify(entry.id)}: [${declarations}]`;
}).join(",\n");

const runtimeEntries = outputEntries.map((entry) => ({
  ...entry,
  imageUrls: `__IMAGE_URLS__${entry.id}`,
  imageUrl: `__IMAGE_URL__${entry.id}`
}));

const serializedEntries = JSON.stringify(runtimeEntries, null, 2)
  .replace(/"__IMAGE_URLS__([^\"]+)"/g, (_, id) => `MANUFACTURER_BAG_IMAGE_URLS[${JSON.stringify(id)}]`)
  .replace(/"__IMAGE_URL__([^\"]+)"/g, (_, id) => `MANUFACTURER_BAG_IMAGE_URLS[${JSON.stringify(id)}]`);

const output = `// Generated by scripts/build-manufacturer-catalog.mjs from official manufacturer catalogs.\n`
  + `// Catalog data checked: ${catalogCheckedAt}. Image gallery checked: ${checkedAt}. Do not edit by hand.\n\n`
  + `const MANUFACTURER_BAG_IMAGE_URLS = {\n${imageDeclarations}\n};\n\n`
  + `export const MANUFACTURER_BAG_CATALOG_GENERATED = ${serializedEntries.replace(
    /MANUFACTURER_BAG_IMAGE_URLS\[("[^"]+")\](?=,?\n\s+"imageUrl")/g,
    "MANUFACTURER_BAG_IMAGE_URLS[$1]"
  ).replace(
    /"imageUrl": MANUFACTURER_BAG_IMAGE_URLS\[("[^"]+")\]/g,
    '"imageUrl": MANUFACTURER_BAG_IMAGE_URLS[$1][0] || ""'
  )};\n`;

await writeFile(outputPath, output, "utf8");
await writeFile(imageManifestPath, `${JSON.stringify(imageManifest, null, 2)}\n`, "utf8");

const counts = Object.fromEntries([...new Set(outputEntries.map((entry) => entry.brand))]
  .map((brand) => [brand, outputEntries.filter((entry) => entry.brand === brand).length]));
process.stdout.write(`${JSON.stringify({ output: basename(outputPath), entries: outputEntries.length, images: imageManifest.length, counts, imageManifest: basename(imageManifestPath) })}\n`);
