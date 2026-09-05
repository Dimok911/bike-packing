import { extname } from "node:path";

const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost", aliases: ["seat bag", "saddle bag", "подседельная", "седельная"] },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar / stem / harness", aliases: ["handlebar bag", "bar bag", "feed bag", "рулевая", "на руль", "кормушка"] },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps / bolt-on", aliases: ["frame bag", "нарамная", "в раму", "рамная"] },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / bolt-on", aliases: ["top tube", "toptube", "на верхнюю трубу", "бензобак"] },
  pannier: { family: "panniers", en: "pannier", ru: "панир", mounting: "Rack straps", aliases: ["pannier", "rack bag", "панир"] },
  "rack-top": { family: "panniers", en: "rack or basket bag", ru: "сумка на багажник или корзину", mounting: "Rack / basket straps", aliases: ["rack bag", "basket bag", "сумка на багажник", "сумка в корзину"] },
  "shoulder-waist": { family: "carry", en: "waist bag", ru: "поясная сумка", mounting: "Waist belt", aliases: ["hip pack", "waist bag", "поясная", "набедренная"] },
});

const UNIVERSAL_CATEGORY_BY_HANDLE = Object.freeze({
  "barjam-cradle": "handlebar",
  "cache-top-tube-bag": "top-tube",
  "cache-top-tube-bag-bolt-on": "top-tube",
  "dr-jones-bag": "handlebar",
  "dumpling-hip-pack": "shoulder-waist",
  "foxglove": "saddle",
  "gondola": "saddle",
  "honeypot": "handlebar",
  "horton-front-pouch": "handlebar",
  "jones-bag": "handlebar",
  "meanwhile-wald-basket-bag": "rack-top",
  "microwave-panniers": "pannier",
  "mr-fusion-seat-pack": "saddle",
  "ultra-pe-dry-bag": "handlebar",
  "waterproof-handlebar-bag": "handlebar",
});

function decodeHtml(value = "") {
  return String(value)
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&amp;|&#38;/gi, "&")
    .replace(/&times;/gi, "×")
    .replace(/&ndash;|&#8211;/gi, "–")
    .replace(/&mdash;|&#8212;/gi, "—")
    .replace(/&reg;/gi, "®")
    .replace(/&trade;/gi, "™")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(?:p|li|h\d|section|dd|dt|td|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[\/?et_pb_[^\]]*\]/gi, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeHandle(value = "") {
  return decodeHtml(String(value || "")).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function categoryForProduct(product = {}) {
  const handle = safeHandle(new URL(product.permalink || "https://rockgeist.com/product/unknown/").pathname.split("/").filter(Boolean).at(-1));
  const categories = new Set((product.categories || []).map(({ slug }) => String(slug || "").toLowerCase()));
  if (categories.has("all-custom") || categories.has("by-model") || categories.has("waterproof-framebags")) return "frame";
  return UNIVERSAL_CATEGORY_BY_HANDLE[handle] || "";
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))].sort((left, right) => left - right);
}

function volumeOptionsFromText(value = "") {
  return uniqueNumbers([...String(value).matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:L\b|lit(?:er|re)s?\b)/gi)]
    .map((match) => Number(match[1].replace(",", "."))))
    .filter((volume) => volume <= 100);
}

function weightOptionsFromText(value = "") {
  const snippets = [...String(value).matchAll(/(?:bag\s+)?weight[^\n]{0,180}/gi)].map((match) => match[0]);
  const source = snippets.length ? snippets.join("\n") : String(value);
  return uniqueNumbers([
    ...[...source.matchAll(/\b(\d+(?:[.,]\d+)?)\s*g\b/gi)].map((match) => Number(match[1].replace(",", "."))),
    ...[...source.matchAll(/\b(\d+(?:[.,]\d+)?)\s*oz\b/gi)].map((match) => Math.round(Number(match[1].replace(",", ".")) * 28.3495)),
  ]).filter((weight) => weight >= 20 && weight < 5000);
}

function dimensionsFromText(value = "") {
  const match = String(value).match(/\b(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)\s*(cm|in(?:ches)?|\")/i);
  if (!match) return {};
  const scale = /^cm$/i.test(match[4]) ? 1 : 2.54;
  const values = [match[1], match[2], match[3]].map((raw) => Math.round(Number(raw.replace(",", ".")) * scale * 10) / 10);
  return { lengthCm: values[0], widthCm: values[1], heightCm: values[2] };
}

function productImages(product = {}) {
  const images = new Map();
  for (const image of Array.isArray(product.images) ? product.images : []) {
    const candidate = image?.thumbnail || image?.src || "";
    if (!candidate) continue;
    const url = new URL(candidate, "https://rockgeist.com/");
    if (url.hostname !== "rockgeist.com" || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) continue;
    const key = url.pathname.toLowerCase();
    if (!images.has(key)) images.set(key, url.toString());
  }
  return [...images.values()];
}

function safeImageExtension(url = "") {
  const extension = extname(new URL(url).pathname).toLowerCase();
  return extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
}

function productMaterial(details = "") {
  const materials = [];
  if (/Ultra[- ]PE|UHMWPE|Ultra[- ]\d+/i.test(details)) materials.push("Ultra-PE");
  if (/ECOPAK/i.test(details)) materials.push("ECOPAK™");
  if (/X[- ]?Pac/i.test(details)) materials.push("X-Pac®");
  if (/Hypalon/i.test(details)) materials.push("Hypalon");
  if (/TPU[- ]coated nylon/i.test(details)) materials.push("TPU-coated nylon");
  if (/PU[- ]coated nylon/i.test(details)) materials.push("PU-coated nylon");
  return [...new Set(materials)].join(" / ") || "Rockgeist technical fabric";
}

function volumeVariants(product = {}, volumeOptions = [], weightOptions = [], mounting = "") {
  const sizeTerms = (product.attributes || [])
    .filter(({ name }) => /^(?:bag |frame )?(?:size|volume|capacity)$/i.test(String(name || "").trim()))
    .flatMap(({ terms }) => (terms || []).map(({ name }) => plainText(name)))
    .filter(Boolean);
  const candidates = sizeTerms.length ? sizeTerms : volumeOptions.map((volume) => `${volume} L`);
  const values = candidates.length ? candidates : ["Manufacturer model"];
  return values.map((title, index) => ({
    sku: `ROCKGEIST-${product.id}${values.length > 1 ? `-${index + 1}` : ""}`,
    title,
    color: "",
    volume: volumeOptionsFromText(title)[0] || (values.length === volumeOptions.length ? volumeOptions[index] : volumeOptions[0] || 0),
    weight: values.length === weightOptions.length ? weightOptions[index] : weightOptions[0] || 0,
    mounting,
    available: product.is_in_stock !== false,
  }));
}

export function rockgeistCatalogTargets(products = []) {
  const targets = new Map();
  for (const product of Array.isArray(products) ? products : []) {
    const sourceUrl = String(product?.permalink || "");
    let url;
    try { url = new URL(sourceUrl); } catch { continue; }
    if (url.hostname !== "rockgeist.com" || !/^\/product\/[^/]+\/?$/i.test(url.pathname)) continue;
    const category = categoryForProduct(product);
    if (!category) continue;
    const handle = safeHandle(url.pathname.split("/").filter(Boolean).at(-1));
    if (!handle || !product.id) continue;
    targets.set(String(product.id), {
      ...product,
      handle,
      category,
      sourceUrl: url.toString(),
      url: `https://rockgeist.com/wp-json/wc/store/v1/products/${product.id}?_fields=id,name,permalink,description,short_description,images,categories,attributes,prices,is_purchasable,is_in_stock`,
    });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

export function rockgeistProductPageIsValid(value = "") {
  try {
    const product = JSON.parse(String(value));
    return Boolean(product?.id && product?.name && productImages(product).length);
  } catch {
    return false;
  }
}

export function buildRockgeistCatalogEntry({ target = {}, json = "", checkedAt = "" } = {}) {
  const product = typeof json === "string" ? JSON.parse(json) : json;
  const sourceUrl = String(product.permalink || target.sourceUrl || "");
  const url = new URL(sourceUrl);
  if (url.hostname !== "rockgeist.com" || !/^\/product\/[^/]+\/?$/i.test(url.pathname)) throw new Error(`Unsupported Rockgeist product URL: ${sourceUrl || "missing"}`);
  const handle = target.handle || safeHandle(url.pathname.split("/").filter(Boolean).at(-1));
  const category = target.category || categoryForProduct(product);
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported Rockgeist product category: ${handle}`);
  const name = plainText(product.name || target.name || "");
  if (!name) throw new Error(`Missing Rockgeist product name: ${url}`);
  const details = plainText(`${product.short_description || ""}\n${product.description || ""}`).slice(0, 2000);
  const attributeText = (product.attributes || []).flatMap(({ name: attributeName, terms }) =>
    (terms || []).map(({ name: termName }) => `${attributeName}: ${termName}`)).join("\n");
  const volumeOptions = volumeOptionsFromText(`${name}\n${attributeText}\n${details}`);
  const weightOptions = weightOptionsFromText(details);
  const images = productImages(product);
  if (!images.length) throw new Error(`Missing Rockgeist product images: ${handle}`);
  const imageAssetPaths = images.map((imageUrl, index) =>
    `assets/manufacturer-catalog/rockgeist/${handle}${index ? `-${index + 1}` : ""}${safeImageExtension(imageUrl)}`);
  const mounting = handle === "ultra-pe-dry-bag" ? "Handlebar harness / rack" : meta.mounting;
  const variants = volumeVariants(product, volumeOptions, weightOptions, mounting);
  const volumeSummary = volumeOptions.length ? `${volumeOptions.join(" / ")} L` : "";
  const waterproofModel = /52hz|mr-fusion|microwave|meanwhile|horton|waterproof|ultra-pe-dry-bag|barjam/i.test(handle);
  const waterproof = /(?:100%|fully|completely)\s+waterproof|welded[^.]{0,80}waterproof/i.test(details)
    || (waterproofModel && /\bwaterproof\b/i.test(details))
    ? "Waterproof"
    : /waterproof fabric|water resistant/i.test(details) ? "Water resistant" : "";
  url.search = "";
  url.hash = "";
  return {
    id: `rockgeist-${handle}`,
    sourceProductId: `rockgeist-${handle}`,
    manufacturerId: "rockgeist",
    brand: "Rockgeist",
    provider: "rockgeist.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} SKU`,
    sku: variants[0]?.sku || `ROCKGEIST-${product.id}`,
    weight: weightOptions[0] || 0,
    weightOptions,
    volume: volumeOptions[0] || 0,
    volumeOptions,
    loadKg: 0,
    dimensions: dimensionsFromText(details),
    color: "",
    waterproof,
    material: productMaterial(`${attributeText}\n${details}`),
    mounting,
    mountingOptions: [mounting],
    soldAsSet: handle === "microwave-panniers",
    available: product.is_in_stock !== false,
    variantCount: variants.length,
    availableVariantCount: product.is_in_stock === false ? 0 : variants.length,
    variantWeightsAuthoritative: weightOptions.length > 0,
    variants,
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: `${name} is a Rockgeist ${meta.en}${volumeSummary ? ` in ${volumeSummary}` : ""}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Rockgeist${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["Rockgeist", meta.en, meta.ru, ...meta.aliases, handle.replaceAll("-", " "), name])],
  };
}
