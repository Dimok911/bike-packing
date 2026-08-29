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
]);

export function manufacturerCatalogSource(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return MANUFACTURER_CATALOG_SOURCES.find((item) => item.id === normalized) || null;
}
