export const MANUFACTURER_CATALOG_SOURCES = Object.freeze([
  Object.freeze({
    id: "ortlieb",
    name: "ORTLIEB",
    productBaseUrl: "https://us.ortlieb.com/products/",
    collections: Object.freeze([
      ["ortlieb-bikepacking.json", "https://us.ortlieb.com/collections/bikepacking/products.json?limit=250"],
      ["ortlieb-frame-bags.json", "https://us.ortlieb.com/collections/frame-bags/products.json?limit=250"],
      ["ortlieb-handlebar-bags.json", "https://us.ortlieb.com/collections/handlebar-bags/products.json?limit=250"],
      ["ortlieb-panniers.json", "https://us.ortlieb.com/collections/panniers-and-bike-bags/products.json?limit=250"],
      ["ortlieb-rack-top-bags.json", "https://us.ortlieb.com/collections/rack-top-bags/products.json?limit=250"],
      ["ortlieb-saddle-bags.json", "https://us.ortlieb.com/collections/saddle-bags/products.json?limit=250"],
    ]),
  }),
  Object.freeze({
    id: "arkel",
    name: "Arkel",
    productBaseUrl: "https://arkel.ca/products/",
    collections: Object.freeze([
      ["arkel-products.json", "https://arkel.ca/collections/all-bags-and-panniers/products.json?limit=250"],
    ]),
  }),
  Object.freeze({
    id: "tailfin",
    name: "Tailfin",
    adapter: "tailfin-html",
    productBaseUrl: "https://www.tailfin.cc/us/",
    collections: Object.freeze([
      ["tailfin-shop.html", "https://www.tailfin.cc/us/shop/"],
    ]),
  }),
  Object.freeze({
    id: "apidura",
    name: "Apidura",
    adapter: "apidura-sitemap",
    productBaseUrl: "https://www.apidura.com/shop/",
    collections: Object.freeze([
      ["apidura-product-sitemap.xml", "https://www.apidura.com/product-sitemap.xml"],
    ]),
  }),
  Object.freeze({
    id: "restrap",
    name: "Restrap",
    adapter: "restrap-shopify",
    productBaseUrl: "https://restrap.com/products/",
    collections: Object.freeze([
      ["restrap-cockpit.json", "https://restrap.com/collections/cockpit-bags/products.json?limit=250"],
      ["restrap-frame.json", "https://restrap.com/collections/frame-bags/products.json?limit=250"],
      ["restrap-bar.json", "https://restrap.com/collections/bar-bags/products.json?limit=250"],
      ["restrap-panniers-fork.json", "https://restrap.com/collections/panniers-fork-bags/products.json?limit=250"],
      ["restrap-rack.json", "https://restrap.com/collections/rack-and-basket-bags/products.json?limit=250"],
      ["restrap-saddle.json", "https://restrap.com/collections/saddle-bags/products.json?limit=250"],
      ["restrap-on-body.json", "https://restrap.com/collections/on-body-bags/products.json?limit=250"],
    ]),
  }),
  Object.freeze({
    id: "revelate-designs",
    name: "Revelate Designs",
    adapter: "revelate-product-chart",
    productBaseUrl: "https://revelatedesigns.com/product/",
    collections: Object.freeze([
      ["revelate-product-chart.html", "https://revelatedesigns.com/product-chart/"],
    ]),
  }),
  Object.freeze({
    id: "miss-grape",
    name: "Miss Grape",
    adapter: "miss-grape-wordpress",
    productBaseUrl: "https://missgrape.net/en/",
    collections: Object.freeze([
      ["miss-grape-products.json", "https://missgrape.net/wp-json/wp/v2/product?per_page=100&_fields=id,slug,link,title,featured_media,product_cat,product_tag"],
    ]),
  }),
  Object.freeze({
    id: "cyclite",
    name: "CYCLITE",
    adapter: "cyclite-collection",
    productBaseUrl: "https://cyclite.cc/en/products/",
    collections: Object.freeze([
      ["cyclite-bikepacking.html", "https://cyclite.cc/en/collections/bikepacking-bags"],
    ]),
  }),
  Object.freeze({
    id: "blackburn",
    name: "Blackburn",
    adapter: "blackburn-sfcc",
    productBaseUrl: "https://www.bellhelmets.com/product/",
    collections: Object.freeze([
      ["blackburn-bags.html", "https://www.blackburndesign.com/c/bags/"],
    ]),
  }),
  Object.freeze({
    id: "topeak",
    name: "Topeak",
    adapter: "topeak-html",
    productBaseUrl: "https://www.topeak.com/global/en/product/",
    collections: Object.freeze([
      ["topeak-bags.html", "https://www.topeak.com/global/en/products/186-Bags"],
    ]),
  }),
]);

export function manufacturerCatalogSource(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return MANUFACTURER_CATALOG_SOURCES.find((item) => item.id === normalized) || null;
}

export function selectManufacturerCatalogSources(requestedIds = []) {
  const requested = new Set(Array.from(requestedIds)
    .map((id) => String(id || "").trim().toLowerCase())
    .filter(Boolean));
  if (!requested.size) return MANUFACTURER_CATALOG_SOURCES;
  const selected = MANUFACTURER_CATALOG_SOURCES.filter(({ id }) => requested.has(id));
  if (selected.length !== requested.size) {
    const known = new Set(selected.map(({ id }) => id));
    const unknown = [...requested].filter((id) => !known.has(id));
    throw new Error(`Unknown manufacturer id: ${unknown.join(", ")}`);
  }
  return selected;
}
