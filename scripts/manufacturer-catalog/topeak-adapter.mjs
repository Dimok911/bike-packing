import { extname } from "node:path";

const CATEGORY_META = Object.freeze({
  saddle: { family: "bikepacking", en: "saddle bag", ru: "подседельная сумка", mounting: "Saddle rails / seatpost", aliases: ["seat bag", "saddle bag", "seatpost pack", "подседельная", "седельная"] },
  handlebar: { family: "bikepacking", en: "handlebar bag", ru: "рулевая сумка", mounting: "Handlebar / stem", aliases: ["handlebar bag", "bar bag", "stem bag", "рулевая", "на руль", "кормушка"] },
  frame: { family: "bikepacking", en: "frame bag", ru: "нарамная сумка", mounting: "Frame straps", aliases: ["frame bag", "нарамная", "в раму", "рамная"] },
  "top-tube": { family: "bikepacking", en: "top-tube bag", ru: "сумка на верхнюю трубу", mounting: "Top-tube straps / direct mount", aliases: ["top tube", "toptube", "bolt-on", "на верхнюю трубу", "бензобак"] },
  fork: { family: "bikepacking", en: "fork or cargo-cage bag", ru: "сумка на вилку или грузовую клетку", mounting: "Fork / bottle cage", aliases: ["fork bag", "bottle cage bag", "cargo cage", "на вилку", "вилочная"] },
  pannier: { family: "panniers", en: "pannier", ru: "панир", mounting: "Rear rack hooks", aliases: ["pannier", "rear pannier", "панир", "задний панир"] },
  "rack-top": { family: "panniers", en: "rack-top bag", ru: "сумка на багажник", mounting: "Rear rack / QuickTrack", aliases: ["rack bag", "trunk bag", "сумка на багажник", "багажная сумка"] },
});

const SECTION_CATEGORY = Object.freeze({
  "Rack Bags": "rack-top",
  "Saddle Bags": "saddle",
  "Seatpost Packs": "saddle",
  "Handlebar Bags": "handlebar",
  "Top Tube Bags": "top-tube",
  "Bottle Cage Bags": "fork",
  "Fork Bags": "fork",
});

const EXCLUDED_SECTIONS = new Set([
  "Phone Bags & Wallets",
  "Pakgo Series",
  "Rain Cover",
  "Frame Tube & Seatpost Mount Straps",
]);

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
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeHandle(value = "") {
  let decoded = decodeHtml(String(value || ""));
  try { decoded = decodeURIComponent(decoded); } catch {}
  return decoded.toLowerCase().replace(/\+/g, " plus ").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.round(value * 100) / 100))].sort((left, right) => left - right);
}

function categorySections(html = "") {
  return [...String(html).matchAll(/<div class=["']category-section["']>([\s\S]*?)(?=<div class=["']category-section["']>|<\/main>|<footer\b)/gi)]
    .map((match) => ({
      title: plainText(match[1].match(/category-section__title["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ""),
      html: match[1],
    }));
}

function targetCategory(section, name) {
  if (EXCLUDED_SECTIONS.has(section)) return "";
  if (/\brain cover\b|\btrunklock\b/i.test(name)) return "";
  if (section === "Rack Bags" && /\bpannier\b/i.test(name)) return "pannier";
  if (section === "Top Tube Bags" && /\bmidloader\b/i.test(name)) return "frame";
  return SECTION_CATEGORY[section] || "";
}

export function topeakCatalogTargets(html = "", { baseUrl = "https://www.topeak.com/global/en/products/186-Bags" } = {}) {
  const targets = new Map();
  for (const section of categorySections(html)) {
    for (const match of section.html.matchAll(/<li\b[^>]*class=["'][^"']*product-card__item[^"']*["'][^>]*>([\s\S]*?)(?=<li\b[^>]*class=["'][^"']*product-card__item|<\/ul>\s*<\/div>\s*(?:<button|<\/div>))/gi)) {
      const card = match[1];
      const rawUrl = decodeHtml(card.match(/<a\b[^>]*href=["']([^"']*\/global\/en\/product\/([^"']+))["']/i)?.[1] || "");
      const name = plainText(card.match(/product-card__title["'][^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "");
      const category = targetCategory(section.title, name);
      if (!rawUrl || !name || !category) continue;
      const pathPart = rawUrl.match(/\/product\/([^/?#]+)/i)?.[1] || "";
      const productId = pathPart.match(/^(\d+)-/)?.[1] || "";
      const handle = safeHandle(pathPart);
      if (!handle || !productId) continue;
      targets.set(productId, {
        handle,
        productId,
        name,
        category,
        section: section.title,
        subtitle: plainText(card.match(/product-card__subtitle["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ""),
        url: new URL(rawUrl, baseUrl).toString(),
      });
    }
  }
  return [...targets.values()].sort((left, right) => Number(left.productId) - Number(right.productId));
}

function pageName(html = "") {
  return plainText(String(html).match(/<meta\b[^>]*itemprop=["']name["'][^>]*content=["']([^"']+)["']/i)?.[1]
    || String(html).match(/product-content__heading["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1]
    || "");
}

function pageDescription(html = "") {
  return plainText(String(html).match(/<div\b[^>]*class=["'][^"']*product-content__description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]
    || String(html).match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1]
    || "");
}

function specificationMap(html = "") {
  const table = String(html).match(/<div\b[^>]*class=["'][^"']*product-info[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] || "";
  const specifications = {};
  for (const match of table.matchAll(/<td\b[^>]*class=["'][^"']*table-border__caption[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*class=["'][^"']*table-border__description[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)) {
    const key = plainText(match[1]).toUpperCase();
    const value = plainText(match[2]);
    if (key && value) specifications[key] = value;
  }
  return specifications;
}

function productImages(html = "") {
  const source = String(html);
  const start = source.indexOf('<div class="product-content__presentation');
  const end = source.indexOf('<div class="product-content__details', start);
  const gallery = start >= 0 ? source.slice(start, end > start ? end : start + 45000) : "";
  const images = new Map();
  for (const match of gallery.matchAll(/\b(?:data-src|src)=["'](https:\/\/www\.topeak\.com\/storage\/app\/media\/product\/[^"']+)["']/gi)) {
    const url = new URL(decodeHtml(match[1]));
    url.protocol = "https:";
    const key = url.pathname.toLowerCase();
    if (!images.has(key)) images.set(key, url.toString());
  }
  return [...images.values()];
}

function volumeOptionsFromText(value = "") {
  const normalized = String(value).replace(/(\d)\s*,\s*(?=\d)/g, "$1 / ");
  const litres = [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:l|liters?)\b/gi)].map((match) => Number(match[1]));
  const cubicCentimetres = [...normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:cc|cm³)\b/gi)].map((match) => Number(match[1]) / 1000);
  return uniqueNumbers([...litres, ...cubicCentimetres]).filter((value) => value <= 100);
}

function weightOptionsFromText(value = "") {
  const weights = [];
  for (const match of String(value).matchAll(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/gi)) {
    const amount = Number(match[1]);
    weights.push(match[2].toLowerCase() === "kg" ? amount * 1000 : amount);
  }
  return uniqueNumbers(weights).filter((value) => value < 5000);
}

function volumeFromSize(value = "") {
  return volumeOptionsFromText(value)[0] || 0;
}

function variantWeight(value = "", volume = 0, color = "", size = "", fallback = 0) {
  const lines = String(value).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const volumeLine = volume ? lines.find((line) => new RegExp(`(?:^|\\D)${String(volume).replace(".", "\\.")}\\s*L\\s*:` , "i").test(line)) : "";
  const escapedSize = String(size).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sizeLine = escapedSize ? lines.find((line) => new RegExp(`\\(${escapedSize}\\)`, "i").test(line)) : "";
  const scope = volumeLine || sizeLine || String(value);
  if (color) {
    const escapedColor = String(color).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const colorMatch = scope.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*g\\b[^,;\\n]{0,60}\\(${escapedColor}\\)`, "i"));
    if (colorMatch) return Number(colorMatch[1]);
  }
  return weightOptionsFromText(scope)[0] || fallback;
}

function productVariants(html = "", volumeOptions = [], weightOptions = [], mounting = "", artNo = "", weightText = "") {
  const raw = [];
  for (const match of String(html).matchAll(/<li\b[^>]*class=["'][^"']*\bsize-option\b[^"']*["'][^>]*data-size=["']([^"']*)["'][^>]*data-color=["']([^"']*)["'][^>]*data-(?:quiver-id=["'][^"']*["'][^>]*data-)?mod-id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi)) {
    const rawColor = plainText(match[2]);
    raw.push({ size: plainText(match[1]) || plainText(match[4]), color: rawColor === "-" ? "" : rawColor, modId: plainText(match[3]) });
  }
  const byModId = [...new Map(raw.map((variant) => [variant.modId, variant])).values()];
  const sizes = [...new Set(byModId.map(({ size }) => size).filter(Boolean))];
  const sizeVolume = new Map(sizes.map((size, index) => [size, volumeFromSize(size) || (sizes.length === volumeOptions.length ? volumeOptions[index] : volumeOptions[0] || 0)]));
  if (byModId.length) return byModId.map((variant) => {
    const volume = sizeVolume.get(variant.size) || volumeOptions[0] || 0;
    const fallbackWeight = weightOptions.length === volumeOptions.length ? weightOptions[volumeOptions.indexOf(volume)] || 0 : 0;
    return {
      sku: variant.modId ? `TOPEAK-${variant.modId}` : artNo,
      title: [variant.size, variant.color].filter(Boolean).join(" · ") || "Manufacturer model",
      color: variant.color,
      volume,
      weight: variantWeight(weightText, volume, variant.color, variant.size, fallbackWeight),
      mounting,
      available: true,
    };
  });
  const colors = [...String(html).matchAll(/<li\b[^>]*class=["'][^"']*\bcolor-option\b[^"']*["'][^>]*data-display-name=["']([^"']+)["'][^>]*data-mod-id=["']([^"']*)["']/gi)]
    .map((match) => ({ color: plainText(match[1]), modId: plainText(match[2]) }));
  const uniqueColors = [...new Map(colors.map((item) => [`${item.color}|${item.modId}`, item])).values()];
  return (uniqueColors.length ? uniqueColors : [{ color: "", modId: "" }]).map(({ color, modId }) => ({
    sku: modId ? `TOPEAK-${modId}` : artNo,
    title: color || "Manufacturer model",
    color,
    volume: volumeOptions[0] || 0,
    weight: weightOptions[0] || 0,
    mounting,
    available: true,
  }));
}

function dimensionsFromText(value = "") {
  const match = String(value).match(/\b(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm\b/i);
  return match ? { lengthCm: Number(match[1]), widthCm: Number(match[2]), heightCm: Number(match[3]) } : {};
}

export function topeakProductPageIsValid(html = "") {
  return Boolean(pageName(html) && /\bART NO:/i.test(String(html)) && productImages(html).length);
}

export function buildTopeakCatalogEntry({ target = {}, html = "", sourceUrl = "", checkedAt = "" } = {}) {
  const url = new URL(sourceUrl || target.url || "https://www.topeak.com/global/en/product/0-unknown");
  if (!/(?:^|\.)topeak\.com$/i.test(url.hostname)) throw new Error(`Unsupported Topeak product URL: ${sourceUrl || target.url || "missing"}`);
  const category = target.category;
  const meta = CATEGORY_META[category];
  if (!meta) throw new Error(`Unsupported Topeak product category: ${target.handle || url}`);
  const name = pageName(html) || target.name;
  if (!name) throw new Error(`Missing Topeak product name: ${url}`);
  const specifications = specificationMap(html);
  const description = pageDescription(html);
  const volumeOptions = volumeOptionsFromText(specifications.CAPACITY || target.subtitle || "");
  const weightOptions = weightOptionsFromText(specifications.WEIGHT || "");
  const artNo = plainText(String(html).match(/ART NO:\s*<span\b[^>]*id=["']product-id["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] || "");
  const mounting = specifications["BAG ATTACHMENT"] || meta.mounting;
  const variants = productVariants(html, volumeOptions, weightOptions, mounting, artNo, specifications.WEIGHT || "");
  const images = productImages(html);
  if (!images.length) throw new Error(`Missing Topeak product images: ${url}`);
  const handle = target.handle || safeHandle(url.pathname.split("/").at(-1));
  const imageAssetPaths = images.map((imageUrl, index) => {
    const extension = extname(new URL(imageUrl).pathname).toLowerCase();
    const safeExtension = extension === ".jpeg" ? ".jpg" : ([".jpg", ".png", ".webp"].includes(extension) ? extension : ".jpg");
    return `assets/manufacturer-catalog/topeak/${handle}${index ? `-${index + 1}` : ""}${safeExtension}`;
  });
  const waterproofSource = `${specifications["WATERPROOF RATING"] || ""} ${target.subtitle || ""} ${description}`;
  const waterproof = /\bwaterproof\b/i.test(waterproofSource) ? "Waterproof" : /\b(?:weatherproof|water repellent|water resistant)\b/i.test(waterproofSource) ? "Weather resistant" : "";
  const primaryVolume = volumeOptions[0] || 0;
  const primaryWeight = weightOptions[0] || 0;
  const volumeSummary = volumeOptions.length ? `${volumeOptions.join(" / ")} L` : "";
  const primaryVariant = variants[0] || {};
  const details = [description, ...Object.entries(specifications).map(([key, value]) => `${key}\n${value}`)].filter(Boolean).join("\n\n");
  url.search = "";
  url.hash = "";
  return {
    id: `topeak-${handle}`,
    sourceProductId: `topeak-${target.productId || handle.split("-")[0]}`,
    manufacturerId: "topeak",
    brand: "Topeak",
    provider: "topeak.com",
    family: meta.family,
    category,
    name,
    variant: `${volumeSummary || "Manufacturer model"} · ${variants.length} SKU`,
    sku: String(primaryVariant.sku || artNo || ""),
    weight: primaryWeight,
    weightOptions,
    volume: primaryVolume,
    volumeOptions,
    loadKg: uniqueNumbers([...(specifications["MAX LOAD"] || "").matchAll(/(\d+(?:\.\d+)?)\s*kg\b/gi)].map((match) => match[1]))[0] || 0,
    dimensions: dimensionsFromText(specifications.SIZE || ""),
    color: String(primaryVariant.color || ""),
    waterproof,
    material: specifications.MATERIAL || "Technical fabric",
    mounting,
    mountingOptions: [mounting],
    soldAsSet: false,
    available: true,
    variantCount: variants.length,
    availableVariantCount: variants.length,
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
      en: `${name} is a Topeak ${meta.en}${volumeSummary ? ` in ${volumeSummary}` : ""}. Specifications are from the manufacturer's official product page.`,
      ru: `${meta.ru[0].toLocaleUpperCase()}${meta.ru.slice(1)} Topeak${volumeSummary ? ` объёмом ${volumeSummary}` : ""}. Характеристики взяты с официальной страницы производителя.`,
    },
    aliases: [...new Set(["Topeak", meta.en, meta.ru, ...meta.aliases, handle.replaceAll("-", " "), name])],
  };
}
