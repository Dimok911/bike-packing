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
]);

export function manufacturerCatalogSource(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return MANUFACTURER_CATALOG_SOURCES.find((item) => item.id === normalized) || null;
}
