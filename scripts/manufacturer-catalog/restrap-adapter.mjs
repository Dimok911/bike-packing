import { extname } from "node:path";

const EXCLUDED_HANDLES = new Set([
  "custom-frame-bag-design-kit",
  "yorkshire-dales-charity-musette",
]);

const CATEGORY_META = Object.freeze({
  saddle: {
    family: "bikepacking",
    en: "saddle bag",
    ru: "подседельная сумка",
    mounting: "Saddle rails / seatpost straps",
    aliases: ["seat bag", "saddle bag", "подседельная", "седельная"],
  },
  handlebar: {
    family: "bikepacking",
    en: "handlebar bag",
    ru: "рулевая сумка",
    mounting: "Handlebar straps / holster",
    aliases: ["handlebar bag", "bar bag", "рулевая", "на руль"],
  },
  frame: {
    family: "bikepacking",
    en: "frame bag",
    ru: "нарамная сумка",
    mounting: "Frame straps",
    aliases: ["frame bag", "нарамная", "в раму", "рамная"],
  },
  "top-tube": {
    family: "bikepacking",
    en: "top-tube bag",
    ru: "сумка на верхнюю трубу",
    mounting: "Top-tube straps / direct mount",
    aliases: ["top tube", "toptube", "на верхнюю трубу", "бензобак"],
  },
  fork: {
    family: "bikepacking",
    en: "fork bag",
    ru: "сумка на вилку",
    mounting: "Fork cage straps",
    aliases: ["fork bag", "cargo cage", "на вилку", "вилочная"],
  },
  "rear-pannier": {
    family: "panniers",
    en: "rear pannier",
    ru: "задний панир",
    mounting: "Rack hooks",
    aliases: ["rear pannier", "pannier", "задний панир", "задний багажник"],
  },
  "universal-pannier": {
    family: "panniers",
    en: "front/rear pannier",
    ru: "универсальный панир",
    mounting: "Restrap Switch Multi-Mount",
    aliases: ["pannier", "front rear pannier", "универсальный панир"],
  },
  "rack-top": {
    family: "panniers",
    en: "rack-top bag",
    ru: "сумка на багажник",
    mounting: "Rack straps / Switch system",
    aliases: ["rack top", "rack bag", "сумка на багажник", "багажная сумка"],
  },
  backpack: {
    family: "carry",
    en: "backpack",
    ru: "рюкзак",
    mounting: "Shoulder straps",
    aliases: ["backpack", "hydration vest", "rucksack", "рюкзак"],
  },
  "tote-sling": {
    family: "carry",
    en: "tote or sling bag",
    ru: "переносная сумка",
    mounting: "Carry strap / handlebar straps",
    aliases: ["musette", "hip pack", "sling", "переносная сумка", "слинг"],
  },
});

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
    .replace(/<\/(?:p|div|li|h\d|tr|section|article|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function uniqueNumbers(values = []) {
  return [...new Set(values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))]
    .sort((left, right) => left - right);
}

function volumeValues(value = "") {
  return uniqueNumbers([...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((number) => number <= 50));
}

function productVolumes(product = {}, details = "") {
  const title = volumeValues(product.title || "");
  if (title.length) return title;
  const tags = volumeValues((product.tags || []).join(" "));
  if (tags.length) return tags;
  const capacity = uniqueNumbers([...String(details).matchAll(/(?:sealed\s+)?capacity\s*[-:–—]?\s*(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", "."))));
  return capacity.length ? capacity : volumeValues(details).slice(0, 1);
}

function productWeights(details = "", product = {}) {
  const handle = String(product.handle || "").toLowerCase();
  if (handle === "custom-frame-bag") return [];
  const weightBlock = String(details).match(/(?:product\s+)?weight\s*[-:–—][\s\S]{0,180}/i)?.[0]
    ?.replace(/bladder\s+weight\s*[-:–—]?\s*\d+(?:[.,]\d+)?\s*g\b/gi, "") || "";
  const explicit = uniqueNumbers([...weightBlock.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((number) => number >= 20 && number < 10_000));
  if (/hydration-vest/.test(handle) && explicit.length >= 2) return explicit.slice(0, 2);
  if (/pannier/.test(handle) && explicit.length >= 2) {
    return [/large/.test(handle) ? explicit.at(-1) : explicit[0]];
  }
  if (explicit.length) return [explicit[0]];
  return uniqueNumbers((product.variants || [])
    .map((variant) => Number(variant.grams || 0))
    .filter((number) => number >= 20 && number < 10_000));
}

function categoryForProduct(product = {}) {
  const handle = String(product.handle || "").toLowerCase();
  const type = String(product.product_type || product.type || "").toLowerCase();
  if (/top-tube/.test(handle)) return "top-tube";
  if (/frame-bag/.test(handle)) return "frame";
  if (/switch-pannier/.test(handle)) return "universal-pannier";
  if (/switch-top-bag/.test(handle)) return "rack-top";
  if (/fork-bag/.test(handle)) return "fork";
  if (/pannier/.test(handle) || type === "pannier") return "rear-pannier";
  if (/rolltop-backpack|hydration-vest/.test(handle)) return "backpack";
  if (/musette|utility-hip-pack/.test(handle)) return "tote-sling";
  if (/saddle|tool-pouch/.test(handle) || type === "saddle bags") return "saddle";
  if (/bar-bag|bar-pack|canister-bag|stem-bag/.test(handle) || type === "bar bags") return "handlebar";
  return "";
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function resizedShopifyImage(rawUrl = "") {
  const url = new URL(rawUrl, "https://restrap.com/");
  if (!/(^|\.)shopify\.com$/i.test(url.hostname) && !/(^|\.)restrap\.com$/i.test(url.hostname)) return null;
  url.searchParams.set("width", "700");
  return url;
}

function productImages(product = {}) {
  const images = new Map();
  const candidates = [
    ...(Array.isArray(product.images) ? product.images.map((image) => image?.src || image) : []),
    product.image?.src,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const url = resizedShopifyImage(candidate);
    if (!url || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) continue;
    const key = url.pathname.toLowerCase();
    if (!images.has(key)) images.set(key, url.toString());
  }
  return [...images.values()];
}

function productMaterial(details = "") {
  const materials = [];
  if (/1000D(?:\s+textured)?\s+nylon/i.test(details)) materials.push("1000D nylon");
  if (/TPU[- ]coated\s+nylon/i.test(details)) materials.push("TPU-coated nylon");
  if (/\b(?:X21|X-Pac|XPac)\b/i.test(details)) materials.push("X21 technical laminate");
  if (/Hypalon/i.test(details)) materials.push("Hypalon reinforcements");
  if (/waterproof coated nylon/i.test(details)) materials.push("Waterproof coated nylon");
  return [...new Set(materials)].join(" / ") || "Restrap technical fabric";
}

function productColor(variant = {}) {
  const title = String(variant.title || "").trim();
  if (!title || /^Default Title$/i.test(title) || /^(?:small|medium|large|s\/m|l\/xl)/i.test(title)) return "";
  return title;
}

function compactVariants(product = {}, volumes = [], weights = [], mounting = "") {
  const source = Array.isArray(product.variants) && product.variants.length ? product.variants : [{}];
  const alignedWeights = weights.length === source.length ? weights : [];
  return source.map((variant, index) => ({
    sku: String(variant.sku || ""),
    title: String(variant.title || "Manufacturer model"),
    color: productColor(variant),
    volume: volumes[0] || 0,
    weight: alignedWeights[index] || weights[0] || 0,
    mounting,
    available: variant.available !== false,
  }));
}

export function restrapCatalogTargets(products = []) {
  const targets = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const handle = String(product?.handle || "").trim().toLowerCase();
    if (!handle || EXCLUDED_HANDLES.has(handle) || !categoryForProduct(product)) continue;
    if (product.vendor && !/^Restrap$/i.test(String(product.vendor))) continue;
    targets.set(handle, { ...product, handle, url: `https://restrap.com/products/${handle}` });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

export function buildRestrapCatalogEntry({ product = {}, html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const handle = String(product.handle || "").trim().toLowerCase();
  const url = new URL(sourceUrl || `/products/${handle}`, "https://restrap.com/");
  if (!handle || url.hostname !== "restrap.com" || !/^\/products\/[a-z0-9-]+\/?$/i.test(url.pathname)) {
    throw new Error(`Unsupported Restrap product URL: ${sourceUrl || handle || "missing"}`);
  }
  url.hash = "";
  url.search = "";
  const category = categoryForProduct(product);
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported Restrap product category: ${handle}`);
  const name = plainText(product.title || "");
  if (!name) throw new Error(`Missing Restrap product name: ${url}`);
  const details = plainText(product.body_html || html).slice(0, 5000);
  const volumes = productVolumes(product, details);
  const weights = productWeights(details, product);
  const weightsAreOfficialSpecs = /(?:product\s+)?weight\s*[-:–—]/i.test(details);
  const variants = compactVariants(product, volumes, weights, meta.mounting);
  const availableVariants = variants.filter(({ available }) => available);
  const primaryVariant = availableVariants[0] || variants[0] || {};
  const images = productImages(product);
  if (!images.length) throw new Error(`Missing Restrap product images: ${handle}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/restrap/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const tags = Array.isArray(product.tags) ? product.tags.map(String) : [];
  const waterproofRating = tags.find((tag) => /^IP[0-9A-Z]+$/i.test(tag))?.toUpperCase() || "";
  const waterproof = waterproofRating || (/\bwaterproof\b/i.test(`${tags.join(" ")} ${details}`) ? "Waterproof" : "");
  const volumeSummary = volumes.length ? `${volumes.join(" / ")} L` : "";
  return {
    id: `restrap-${handle}`,
    sourceProductId: `restrap-${handle}`,
    brand: "Restrap",
    provider: "restrap.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} SKU`,
    sku: primaryVariant.sku || "",
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    loadKg: 0,
    dimensions: {},
    color: primaryVariant.color || "",
    waterproof,
    ...(waterproofRating ? { waterproofRating } : {}),
    material: productMaterial(details),
    mounting: meta.mounting,
    mountingOptions: [meta.mounting],
    soldAsSet: false,
    available: availableVariants.length > 0,
    variantCount: variants.length,
    availableVariantCount: availableVariants.length,
    variantWeightsAuthoritative: weights.length > 0 && weightsAreOfficialSpecs,
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: `${name} is a Restrap ${meta.en}${volumeSummary ? ` in ${volumeSummary}` : ""}. Technical data is normalized from the official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Restrap${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики нормализованы по официальной карточке товара.`,
    },
    aliases: [...new Set(["Restrap", meta.en, meta.ru, ...meta.aliases, ...tags, handle.replaceAll("-", " "), name])],
  };
}
