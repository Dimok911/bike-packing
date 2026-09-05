const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost straps", aliases: ["seat bag", "saddle bag", "подседельная", "седельная"] },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar / stem straps", aliases: ["handlebar bag", "bar bag", "feed bag", "рулевая", "на руль", "кормушка"] },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps", aliases: ["frame bag", "corner bag", "нарамная", "в раму", "рамная"] },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / direct mount", aliases: ["top tube", "toptube", "bolt-on", "на верхнюю трубу", "бензобак"] },
  fork: { family: "bikepacking", en: "fork or cargo-cage bag", ru: "сумка на вилку или грузовую клетку", mounting: "Fork / frame cargo cage", aliases: ["fork bag", "cargo bag", "cargo cage", "на вилку", "вилочная"] },
  pannier: { family: "panniers", en: "pannier", ru: "панир", mounting: "Rear rack hooks", aliases: ["pannier", "rear pannier", "панир", "задний панир"] },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", mounting: "Rear rack straps", aliases: ["rack top", "trunk bag", "сумка на багажник", "багажная сумка"] },
});

const CATEGORY_BY_HANDLE = Object.freeze({
  "local-grocery-bag": "pannier",
  "local-saddle-bag": "pannier",
  "local-trunk-bag": "rack-top",
  "grid-handlebar-bag": "handlebar",
  "grid-large-seat-bag": "saddle",
  "outpost-seat-pack-dry-bag": "saddle",
  "outpost-corner-bag": "frame",
  "outpost-top-tube-bag": "top-tube",
  "grid-sl-frame-bag": "frame",
  "outpost-elite-cargo-bag": "fork",
  "outpost-frame-bag-small": "frame",
  "local-plus-top-tube-bag": "top-tube",
  "outpost-carryall-bag": "handlebar",
  "grid-medium-seat-bag": "saddle",
  "outpost-frame-bag-medium": "frame",
  "outpost-frame-bag-large": "frame",
  "local-rear-pannier": "pannier",
});

// These values remain on Blackburn's official indexed product cards/manuals even
// where the current Bell storefront only renders the descriptive accordion.
const OFFICIAL_SPECS = Object.freeze({
  "outpost-frame-bag-medium": { volumes: [4.3, 5.8], weights: [360], waterproof: "Water resistant" },
  "outpost-seat-pack-dry-bag": { volumes: [11], weights: [475], dimensions: { widthCm: 15.2, heightCm: 20.3, lengthCm: 42, lengthMaxCm: 56 }, waterproof: "Waterproof" },
  "outpost-top-tube-bag": { volumes: [0.5], weights: [185], dimensions: { lengthCm: 23.5, widthCm: 8, heightCm: 12 }, waterproof: "Water resistant" },
  "outpost-elite-cargo-bag": { volumes: [6.5], dimensions: { heightCm: 47.5, widthMinCm: 15, widthMaxCm: 17.5 }, waterproof: "Waterproof" },
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
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function plainText(value = "") {
  return decodeHtml(String(value)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(?:p|li|h\d|section|dd|dt)>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeHandle(value = "") {
  let decoded = String(value || "");
  try { decoded = decodeURIComponent(decoded); } catch {}
  return decoded.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .replace("outpost-seat-pack-and-dry-bag", "outpost-seat-pack-dry-bag");
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))].sort((left, right) => left - right);
}

function pageName(html = "") {
  return plainText(String(html).match(/<h1\b[^>]*class=["'][^"']*product-name[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
}

function accordionDetails(html = "") {
  const start = String(html).indexOf('<div class="accordion">');
  if (start < 0) return "";
  const section = String(html).slice(start, start + 18000);
  const blocks = [];
  for (const match of section.matchAll(/<div class="accordion-item">([\s\S]*?)<div class="accordion-content">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi)) {
    const title = plainText(match[1].match(/<div class="accordion-header[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    const content = plainText(match[2]);
    if (content) blocks.push(`${title || "Details"}\n${content}`);
  }
  return blocks.join("\n\n");
}

function productImages(html = "") {
  const source = String(html);
  const start = source.indexOf('<div class="primary-images">');
  const end = source.indexOf('<div class="product-data">', start);
  const gallery = start >= 0 ? source.slice(start, end > start ? end : start + 30000) : "";
  const images = new Map();
  for (const match of gallery.matchAll(/\b(?:src|imagesrcset)=["'](https:\/\/vault\.widen\.net\/content\/[^"']+)["']/gi)) {
    const imageUrl = new URL(decodeHtml(match[1]));
    imageUrl.protocol = "https:";
    imageUrl.searchParams.set("w", "900");
    imageUrl.searchParams.set("h", "900");
    const key = imageUrl.pathname.toLowerCase();
    if (!images.has(key)) images.set(key, imageUrl.toString());
  }
  return [...images.values()];
}

function inlineVolumes(details = "") {
  return uniqueNumbers([
    ...[...details.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(?:l|liters?)\b/gi)].map((match) => Number(match[1].replace(",", "."))),
    ...[...details.matchAll(/\b(\d+(?:[.,]\d+)?)L\s+VOLUME\b/gi)].map((match) => Number(match[1].replace(",", "."))),
  ]).filter((value) => value <= 100);
}

function productMaterial(details = "") {
  if (/420d coated nylon upper[\s\S]*840d coated nylon/i.test(details)) return "420D coated nylon upper / 840D coated nylon bottom";
  if (/210t nylon ripstop[\s\S]*210d polyester/i.test(details)) return "210T nylon ripstop / 210D polyester";
  if (/coated (?:70d|210) ripstop nylon/i.test(details)) return "Coated ripstop nylon";
  const composition = details.match(/Material Composition\s+([^\n]+)/i)?.[1];
  return String(composition || "Technical fabric").trim().slice(0, 400);
}

function selectedAttribute(html = "", label = "") {
  const pattern = new RegExp(`<span class=["']display-name["']>\\s*${label}\\s*<\\/span>[\\s\\S]{0,900}?<span class=["']display-value["']>([\\s\\S]*?)<\\/span>`, "i");
  const legacy = plainText(String(html).match(pattern)?.[1] || "");
  if (legacy) return legacy;
  const selected = new RegExp(`<span class=["'][^"']*\\b${label.toLowerCase()}\\b[^"']*["'][^>]*>\\s*${label}\\s*-\\s*<span class=["']selected-value["']>([\\s\\S]*?)<\\/span>`, "i");
  return plainText(String(html).match(selected)?.[1] || "");
}

function normalizedColor(value = "", productName = "") {
  const escapedName = String(productName).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cleaned = String(value).replace(new RegExp(escapedName, "gi"), "").replace(/\s+/g, " ").trim();
  const words = cleaned.split(" ").filter(Boolean);
  const middle = words.length / 2;
  if (Number.isInteger(middle) && words.slice(0, middle).join(" ").toLowerCase() === words.slice(middle).join(" ").toLowerCase()) {
    return words.slice(0, middle).join(" ");
  }
  return cleaned;
}

export function blackburnCatalogTargets(html = "") {
  const targets = new Map();
  for (const match of String(html).matchAll(/<a\b[^>]*href=["']([^"']*\/product\/([^/"']+)\/(\d+)\.html(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const name = plainText(match[4]);
    const handle = safeHandle(match[2]);
    if (!CATEGORY_BY_HANDLE[handle] || !/\b(?:bag|pack|pannier)\b/i.test(name)) continue;
    const path = `/product/${match[2]}/${match[3]}.html`;
    targets.set(handle, { handle, name, url: new URL(path, "https://www.bellhelmets.com/").toString() });
  }
  return [...targets.values()].sort((left, right) => left.handle.localeCompare(right.handle));
}

export function blackburnProductPageIsValid(html = "") {
  return Boolean(pageName(html) && /product-wrapper"\s+data-pid=/i.test(String(html)) && productImages(html).length);
}

export function buildBlackburnCatalogEntry({ html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = new URL(sourceUrl || "https://www.bellhelmets.com/product/unknown/0.html");
  if (!/(?:^|\.)(?:bellhelmets|blackburndesign)\.com$/i.test(url.hostname)) throw new Error(`Unsupported Blackburn product URL: ${sourceUrl || "missing"}`);
  const rawHandle = url.pathname.match(/\/product\/([^/]+)\/[^/]+\.html$/i)?.[1] || "";
  const handle = safeHandle(rawHandle);
  const category = CATEGORY_BY_HANDLE[handle];
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported Blackburn product: ${handle || sourceUrl}`);
  const name = pageName(html);
  if (!name) throw new Error(`Missing Blackburn product name: ${url}`);
  const details = accordionDetails(html);
  const official = OFFICIAL_SPECS[handle] || {};
  const volumeOptions = uniqueNumbers([...(official.volumes || []), ...inlineVolumes(details)]);
  const weightOptions = uniqueNumbers(official.weights || []);
  const images = productImages(html);
  if (!images.length) throw new Error(`Missing Blackburn product images: ${url}`);
  const imageAssetPaths = images.map((_, index) => `assets/manufacturer-catalog/blackburn/${handle}${index ? `-${index + 1}` : ""}.webp`);
  const sku = String(html).match(/product-wrapper"\s+data-pid=["']([^"']+)/i)?.[1] || "";
  const color = normalizedColor(selectedAttribute(html, "Color"), name) || (/\bblack\b/i.test(details) ? "Black" : "");
  const size = selectedAttribute(html, "Size") || "One Size";
  const button = String(html).match(/<button\b[^>]*class=["'][^"']*\badd-to-cart\b[^"']*["'][^>]*>/i)?.[0] || "";
  const available = Boolean(button && !/\bdisabled\b/i.test(button));
  const mounting = handle === "outpost-top-tube-bag" ? "Bolt-on / top-tube straps" : meta.mounting;
  const waterproof = official.waterproof || (/\bwaterproof\b/i.test(details) ? "Waterproof" : /\bwater[- ]resistant\b/i.test(details) ? "Water resistant" : "");
  const primaryVolume = volumeOptions[0] || 0;
  const primaryWeight = weightOptions[0] || 0;
  const volumeSummary = volumeOptions.length ? `${volumeOptions.join(" / ")} L` : "";
  url.search = "";
  url.hash = "";
  return {
    id: `blackburn-${handle}`,
    sourceProductId: sku || url.pathname.split("/").at(-1)?.replace(/\.html$/i, "") || `blackburn-${handle}`,
    manufacturerId: "blackburn",
    brand: "Blackburn",
    provider: "blackburndesign.com / bellhelmets.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || size || "Manufacturer model"} · 1 SKU`,
    sku,
    weight: primaryWeight,
    weightOptions,
    volume: primaryVolume,
    volumeOptions,
    loadKg: 0,
    dimensions: official.dimensions || {},
    color,
    waterproof,
    material: productMaterial(details),
    mounting,
    mountingOptions: [mounting],
    soldAsSet: false,
    available,
    variantCount: 1,
    availableVariantCount: available ? 1 : 0,
    variantWeightsAuthoritative: weightOptions.length > 0,
    variants: [{ sku, title: [size, color].filter(Boolean).join(" · ") || "Manufacturer model", color, volume: primaryVolume, weight: primaryWeight, mounting, available }],
    imageAssetPath: imageAssetPaths[0],
    imageAssetPaths,
    sourceImageUrl: images[0],
    sourceImageUrls: images,
    sourceUrl: url.toString(),
    sourceCheckedAt: checkedAt,
    manufacturerDetails: details,
    description: {
      en: `${name} is a Blackburn ${meta.en}${volumeSummary ? ` in ${volumeSummary}` : ""}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Blackburn${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["Blackburn", meta.en, meta.ru, ...meta.aliases, handle.replaceAll("-", " "), name])],
  };
}
