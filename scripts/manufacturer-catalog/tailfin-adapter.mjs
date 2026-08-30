import { extname } from "node:path";

const ROOT_PRODUCT_PATHS = new Set([
  "/us/cargopack/",
  "/us/speedpack/",
  "/us/bar-bag-system/",
]);

const PRODUCT_PATH_PREFIXES = Object.freeze([
  "/us/product/frame-bags/",
  "/us/product/top-tube-cockpit/",
  "/us/product/pannier-rack-top-bags/rear-pannier-bags/",
  "/us/product/pannier-rack-top-bags/rack-top-bags/",
  "/us/product/pannier-rack-top-bags/fork-packs/",
  "/us/product/cargo-cage-system/cage-packs/",
  "/us/product/bar-systems/bar-cage/",
  "/us/product/bar-systems/bar-bags/",
]);

const EXCLUDED_PRODUCT_HANDLES = new Set([
  "long-top-tube-bag-accessory-pack",
  "bar-bag-system-accessories",
]);

const CATEGORY_META = Object.freeze({
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Tailfin V-Mount straps" },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Tailfin V-Mount straps / bolt-on" },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Tailfin handlebar mount" },
  fork: { family: "bikepacking", en: "fork or cargo-cage bag", ru: "сумка на вилку или грузовую клетку", mounting: "Tailfin Cargo Cage / straps" },
  "rear-pannier": { family: "panniers", en: "rear pannier", ru: "задний панир", mounting: "Tailfin X-Clamp" },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", mounting: "Tailfin rack / integrated rear system" },
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h\d|tr|section|article)>/gi, "\n")
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

function normalizedProductUrl(rawUrl, baseUrl = "https://www.tailfin.cc/us/shop/") {
  try {
    const url = new URL(decodeHtml(rawUrl), baseUrl);
    if (!/(^|\.)tailfin\.cc$/i.test(url.hostname)) return null;
    url.hash = "";
    url.search = "";
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return url;
  } catch {
    return null;
  }
}

function isTailfinBagProductPath(pathname = "") {
  const normalized = String(pathname || "").toLowerCase();
  return ROOT_PRODUCT_PATHS.has(normalized)
    || PRODUCT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function handleFromUrl(url) {
  return url.pathname.split("/").filter(Boolean).at(-1) || "";
}

export function tailfinCatalogTargets(indexHtml = "", {
  baseUrl = "https://www.tailfin.cc/us/shop/",
} = {}) {
  const targets = new Map();
  const hrefPattern = /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;
  for (const match of String(indexHtml || "").matchAll(hrefPattern)) {
    const url = normalizedProductUrl(match[1] || match[2] || match[3], baseUrl);
    if (!url || !isTailfinBagProductPath(url.pathname)) continue;
    const handle = handleFromUrl(url);
    if (!handle || EXCLUDED_PRODUCT_HANDLES.has(handle)) continue;
    targets.set(handle, { handle, url: url.toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

function jsonLdProducts(html = "") {
  const products = [];
  const collect = (value) => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (!value || typeof value !== "object") return;
    const types = Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]];
    if (types.some((type) => String(type || "").toLowerCase() === "product")) products.push(value);
    Object.values(value).forEach(collect);
  };
  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || "").matchAll(pattern)) {
    try {
      collect(JSON.parse(decodeHtml(match[1]).trim()));
    } catch {
      // A malformed analytics schema must not hide the valid product page.
    }
  }
  return products;
}

function metaContent(html = "", name = "") {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"),
    new RegExp(`<meta\\b[^>]*content\\s*=\\s*(?:"([^"]*)"|'([^']*)')[^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match) return decodeHtml(match[1] || match[2] || "").trim();
  }
  return "";
}

function productName(html = "", schema = {}) {
  const heading = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const raw = plainText(heading || schema.name || metaContent(html, "og:title"));
  return raw.replace(/\s*[|–-]\s*Tailfin Cycling\s*$/i, "").trim();
}

function productDescription(html = "", schema = {}, name = "") {
  const raw = plainText(schema.description || metaContent(html, "description") || metaContent(html, "og:description"));
  if (!raw || raw.toLowerCase() === name.toLowerCase()) return "";
  return raw.slice(0, 1200);
}

function mainHtml(html = "") {
  const main = String(html || "").match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  return main || String(html || "");
}

function specificationsHtml(html = "") {
  const source = mainHtml(html);
  const markers = [...source.matchAll(/Specifications?/gi)];
  if (!markers.length) return source.slice(0, 60_000);
  const candidate = markers.map(({ index = 0 }) => {
    const fragment = source.slice(index, index + 80_000);
    const text = plainText(fragment);
    const score = (text.match(/\b(?:weight|volume|construction|dimensions?|waterproof)\b/gi) || []).length
      + (text.match(/\d+(?:[.,]\d+)?\s*(?:g|kg|L|lit(?:er|re)s?)\b/gi) || []).length;
    return { fragment, score };
  }).sort((left, right) => right.score - left.score)[0];
  const remainder = candidate.fragment;
  const end = remainder.search(/(?:Media Reviews|Other riders|Product Videos|Spares\s*&\s*Accessories|Frequently Asked Questions|<footer\b)/i);
  return end > 0 ? remainder.slice(0, end) : remainder;
}

function volumeValues(value = "") {
  return uniqueNumbers([...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", ".")))
    .filter((value) => value <= 80));
}

function weightValues(value = "") {
  return uniqueNumbers([
    ...[...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)]
      .map((match) => Number(match[1].replace(",", "."))),
    ...[...String(value || "").matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/gi)]
      .map((match) => Number(match[1].replace(",", ".")) * 1000),
  ].filter((value) => value >= 20 && value < 10_000));
}

function maximumLoadKg(value = "") {
  const fragments = [...String(value || "").matchAll(/(?:Carrying Load|Maximum Load|Load Capacity)[\s\S]{0,220}/gi)]
    .map((match) => match[0]);
  const values = fragments.flatMap((fragment) => [
    ...[...fragment.matchAll(/(\d+(?:[.,]\d+)?)\s*kg\b/gi)].map((match) => Number(match[1].replace(",", "."))),
    ...[...fragment.matchAll(/(\d+(?:[.,]\d+)?)\s*lb\b/gi)].map((match) => Math.round(Number(match[1].replace(",", ".")) * 0.453592 * 10) / 10),
  ]);
  return uniqueNumbers(values).at(-1) || 0;
}

function materialFromSpecs(value = "") {
  const text = plainText(value);
  const match = text.match(/(?:Bag construction(?: and Hardware)?|Construction)\s*[:\n]?\s*([^\n]{3,220})/i);
  return String(match?.[1] || "").replace(/\s{2,}/g, " ").trim();
}

function oneMetricDimension(text = "", labels = []) {
  const values = [];
  labels.forEach((label) => {
    const pattern = new RegExp(`${label}[^\\n]{0,50}?(\\d+(?:[.,]\\d+)?)\\s*(mm|cm)\\b`, "gi");
    for (const match of String(text || "").matchAll(pattern)) {
      const raw = Number(match[1].replace(",", "."));
      values.push(match[2].toLowerCase() === "mm" ? raw / 10 : raw);
    }
  });
  const unique = uniqueNumbers(values);
  return unique.length === 1 ? unique[0] : 0;
}

function dimensionsFromSpecs(value = "") {
  const text = plainText(value);
  return Object.fromEntries(Object.entries({
    width: oneMetricDimension(text, ["Width", "Length"]),
    height: oneMetricDimension(text, ["Height"]),
    depth: oneMetricDimension(text, ["Depth"]),
  }).filter(([, number]) => number > 0));
}

function tailfinCategory(url, handle) {
  const path = url.pathname.toLowerCase();
  if (path.includes("/frame-bags/") && handle !== "downtube-packs") return "frame";
  if (path.includes("/top-tube-cockpit/")) return "top-tube";
  if (path.includes("/rear-pannier-bags/")) return "rear-pannier";
  if (path.includes("/rack-top-bags/") || ROOT_PRODUCT_PATHS.has(path) && handle !== "bar-bag-system") return "rack-top";
  if (path.includes("/fork-packs/") || path.includes("/cage-packs/") || handle === "downtube-packs") return "fork";
  return "handlebar";
}

function schemaImages(schema = {}) {
  const values = [];
  const collect = (value) => {
    if (Array.isArray(value)) return value.forEach(collect);
    if (typeof value === "string") values.push(value);
    else if (value && typeof value === "object") collect(value.url || value.contentUrl || value.src);
  };
  collect(schema.image);
  return values;
}

function normalizedImageUrl(rawUrl, pageUrl) {
  try {
    const decoded = decodeHtml(rawUrl).trim().replace(/^url\((['"]?)(.*?)\1\)$/i, "$2");
    const url = new URL(decoded, pageUrl);
    if (!/(^|\.)tailfin\.cc$/i.test(url.hostname)) return null;
    if (!/\.(?:jpe?g|png|webp)(?:$|\?)/i.test(url.href)) return null;
    if (/(?:logo|favicon|icon|avatar|payment|flag|trustpilot|youtube|placeholder|sprite|review[-_ ]?logo|stars?)[^/]*\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null;
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i, "");
    return url;
  } catch {
    return null;
  }
}

function productImages(html = "", pageUrl, schema = {}) {
  const source = mainHtml(html);
  const raw = [...schemaImages(schema)];
  const attributePattern = /\b(?:data-large_image|data-large-image|data-src|src|href)\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of source.matchAll(attributePattern)) raw.push(match[1] || match[2]);
  const srcsetPattern = /\bsrcset\s*=\s*(?:"([^"]+)"|'([^']+)')/gi;
  for (const match of source.matchAll(srcsetPattern)) {
    String(match[1] || match[2] || "").split(",").forEach((candidate) => raw.push(candidate.trim().split(/\s+/)[0]));
  }
  for (const match of source.matchAll(/url\((['"]?)(https?:\/\/[^)'"\s]+)\1\)/gi)) raw.push(match[2]);
  const images = new Map();
  raw.forEach((candidate) => {
    const url = normalizedImageUrl(candidate, pageUrl);
    if (url) images.set(url.toString().toLowerCase(), url.toString());
  });
  return [...images.values()];
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function availableFromSchema(schema = {}) {
  const offers = Array.isArray(schema.offers) ? schema.offers : [schema.offers];
  const states = offers.map((offer) => String(offer?.availability || "").toLowerCase()).filter(Boolean);
  return !states.length || states.some((state) => state.includes("instock") || state.includes("preorder"));
}

function variantRows(volumes, weights, sku, mounting, available) {
  const normalizedVolumes = volumes.length ? volumes : [0];
  const alignedWeights = weights.length === normalizedVolumes.length ? weights : [];
  return normalizedVolumes.map((volume, index) => ({
    sku: normalizedVolumes.length > 1 && sku ? `${sku}-${String(volume).replace(".", "-")}L` : sku,
    title: volume ? `${volume} L` : "Manufacturer model",
    color: "",
    volume,
    weight: alignedWeights[index] || 0,
    mounting,
    available,
  }));
}

export function buildTailfinCatalogEntry({ html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = normalizedProductUrl(sourceUrl, "https://www.tailfin.cc/us/");
  if (!url || !isTailfinBagProductPath(url.pathname)) throw new Error(`Unsupported Tailfin product URL: ${sourceUrl}`);
  const handle = handleFromUrl(url);
  const schema = jsonLdProducts(html)[0] || {};
  const name = productName(html, schema);
  if (!name) throw new Error(`Missing Tailfin product name: ${url}`);
  const specsHtml = specificationsHtml(html);
  const specsText = plainText(specsHtml);
  const volumes = volumeValues(specsText || name);
  const weights = weightValues(specsText);
  const category = tailfinCategory(url, handle);
  const meta = CATEGORY_META[category];
  const images = productImages(html, url, schema);
  if (!images.length) throw new Error(`Missing Tailfin product images: ${url}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/tailfin/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`
  );
  const sku = String(schema.sku || schema.mpn || "").trim();
  const available = availableFromSchema(schema);
  const variants = variantRows(volumes, weights, sku, meta.mounting, available);
  const volumeSummary = volumes.length ? `${volumes.join(" / ")} L` : "";
  const manufacturerDescription = productDescription(html, schema, name);
  const waterproof = /(?:100\s*%\s*)?waterproof/i.test(specsText) ? "Waterproof" : "";
  const technicalDetails = specsText.slice(0, 3500);
  return {
    id: `tailfin-${handle}`,
    sourceProductId: `tailfin-${handle}`,
    brand: "Tailfin",
    provider: "tailfin.cc",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} size option${variants.length === 1 ? "" : "s"}`,
    sku,
    weight: weights[0] || 0,
    weightOptions: weights,
    volume: volumes[0] || 0,
    volumeOptions: volumes,
    ...(volumes.length > 1 ? { volumeMin: volumes[0], volumeMax: volumes.at(-1) } : {}),
    loadKg: maximumLoadKg(specsText),
    dimensions: dimensionsFromSpecs(specsHtml),
    color: "",
    waterproof,
    material: materialFromSpecs(specsHtml) || "Tailfin technical fabric",
    mounting: meta.mounting,
    mountingOptions: [meta.mounting],
    soldAsSet: false,
    available,
    variantCount: variants.length,
    availableVariantCount: variants.filter((variant) => variant.available).length,
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: technicalDetails,
    description: {
      en: manufacturerDescription || `${name} is a Tailfin ${meta.en}. Technical data is normalized from the official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Tailfin${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики нормализованы по официальной карточке товара.`,
    },
    aliases: [...new Set([
      "Tailfin",
      meta.en,
      meta.ru,
      handle.replace(/-/g, " "),
      name,
    ])],
  };
}
