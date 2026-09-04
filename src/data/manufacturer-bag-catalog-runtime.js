import { MANUFACTURER_BAG_CATALOG_INDEX } from "./manufacturer-catalog-runtime/index.generated.js";
export {
  MANUFACTURER_BAG_CATALOG_BRANDS,
  MANUFACTURER_BAG_CATALOG_CATEGORIES,
  MANUFACTURER_BAG_CATALOG_FAMILIES
} from "./manufacturer-bag-catalog-meta.js";

const LOADERS = new Map([
  ["ORTLIEB", () => import("./manufacturer-catalog-runtime/ortlieb.generated.js")],
  ["Apidura", () => import("./manufacturer-catalog-runtime/apidura.generated.js")],
  ["Restrap", () => import("./manufacturer-catalog-runtime/restrap.generated.js")],
  ["Tailfin", () => import("./manufacturer-catalog-runtime/tailfin.generated.js")],
  ["Arkel", () => import("./manufacturer-catalog-runtime/arkel.generated.js")],
  ["Revelate Designs", () => import("./manufacturer-catalog-runtime/revelate-designs.generated.js")],
  ["Miss Grape", () => import("./manufacturer-catalog-runtime/miss-grape.generated.js")],
  ["CYCLITE", () => import("./manufacturer-catalog-runtime/cyclite.generated.js")],
  ["Blackburn", () => import("./manufacturer-catalog-runtime/blackburn.generated.js")],
  ["Topeak", () => import("./manufacturer-catalog-runtime/topeak.generated.js")],
  ["Rockgeist", () => import("./manufacturer-catalog-runtime/rockgeist.generated.js")]
]);
const loadedByBrand = new Map();
const loadingByBrand = new Map();

export { MANUFACTURER_BAG_CATALOG_INDEX };

export function loadedManufacturerBagCatalog() {
  return [...LOADERS.keys()].flatMap((brandName) => loadedByBrand.get(brandName) || []);
}

export async function loadManufacturerBagCatalog({ brand = "" } = {}) {
  const requestedBrands = brand ? [brand] : [...LOADERS.keys()];
  await Promise.all(requestedBrands.map(async (brandName) => {
    if (loadedByBrand.has(brandName)) return;
    const loader = LOADERS.get(brandName);
    if (!loader) return;
    if (!loadingByBrand.has(brandName)) {
      loadingByBrand.set(brandName, loader()
        .then((module) => {
          loadedByBrand.set(brandName, module.MANUFACTURER_BAG_CATALOG_BRAND || []);
        })
        .finally(() => loadingByBrand.delete(brandName)));
    }
    await loadingByBrand.get(brandName);
  }));
  return loadedManufacturerBagCatalog();
}
