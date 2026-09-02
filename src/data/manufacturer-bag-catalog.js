import { MANUFACTURER_BAG_CATALOG_GENERATED } from "./manufacturer-bag-catalog.generated.js";
import {
  assertManufacturerBagCatalogSkuModels,
  splitManufacturerBagCatalogSkuModels
} from "./manufacturer-bag-catalog-variants.js";

const MANUFACTURER_BRAND_LOGOS = {
  apidura: new URL("../../assets/manufacturer-brands/apidura.svg", import.meta.url).href,
  arkel: new URL("../../assets/manufacturer-brands/arkel.png", import.meta.url).href,
  ortlieb: new URL("../../assets/manufacturer-brands/ortlieb.png", import.meta.url).href,
  "revelate-designs": new URL("../../assets/manufacturer-brands/revelate-designs.png", import.meta.url).href,
  restrap: new URL("../../assets/manufacturer-brands/restrap.svg", import.meta.url).href,
  tailfin: new URL("../../assets/manufacturer-brands/tailfin.svg", import.meta.url).href
};

export const MANUFACTURER_BAG_CATALOG_BRANDS = [
  { id: "ortlieb", name: "ORTLIEB", catalogBrand: "ORTLIEB", logoUrl: MANUFACTURER_BRAND_LOGOS.ortlieb, status: "active" },
  { id: "apidura", name: "Apidura", catalogBrand: "Apidura", logoUrl: MANUFACTURER_BRAND_LOGOS.apidura, status: "active" },
  { id: "restrap", name: "Restrap", catalogBrand: "Restrap", logoUrl: MANUFACTURER_BRAND_LOGOS.restrap, status: "active" },
  { id: "tailfin", name: "Tailfin", catalogBrand: "Tailfin", logoUrl: MANUFACTURER_BRAND_LOGOS.tailfin, status: "active" },
  { id: "arkel", name: "Arkel", catalogBrand: "Arkel", logoUrl: MANUFACTURER_BRAND_LOGOS.arkel, status: "active" },
  { id: "revelate-designs", name: "Revelate Designs", catalogBrand: "Revelate Designs", logoUrl: MANUFACTURER_BRAND_LOGOS["revelate-designs"], status: "active" },
  { id: "miss-grape", name: "Miss Grape", status: "planned" },
  { id: "cyclite", name: "CYCLITE", status: "planned" },
  { id: "blackburn", name: "Blackburn", status: "planned" },
  { id: "topeak", name: "Topeak", status: "planned" },
  { id: "rockgeist", name: "Rockgeist", status: "planned" }
];

export const MANUFACTURER_BAG_CATALOG_FAMILIES = [
  {
    id: "bikepacking",
    labelKey: "bagCatalog.family.bikepacking",
    descriptionKey: "bagCatalog.family.bikepackingDescription"
  },
  {
    id: "panniers",
    labelKey: "bagCatalog.family.panniers",
    descriptionKey: "bagCatalog.family.panniersDescription"
  },
  {
    id: "carry",
    labelKey: "bagCatalog.family.carry",
    descriptionKey: "bagCatalog.family.carryDescription"
  }
];

export const MANUFACTURER_BAG_CATALOG_CATEGORIES = [
  {
    id: "saddle",
    family: "bikepacking",
    labelKey: "bagCatalog.category.saddle",
    descriptionKey: "bagCatalog.category.saddleDescription"
  },
  {
    id: "handlebar",
    family: "bikepacking",
    labelKey: "bagCatalog.category.handlebar",
    descriptionKey: "bagCatalog.category.handlebarDescription"
  },
  {
    id: "frame",
    family: "bikepacking",
    labelKey: "bagCatalog.category.frame",
    descriptionKey: "bagCatalog.category.frameDescription"
  },
  {
    id: "top-tube",
    family: "bikepacking",
    labelKey: "bagCatalog.category.topTube",
    descriptionKey: "bagCatalog.category.topTubeDescription"
  },
  {
    id: "fork",
    family: "bikepacking",
    labelKey: "bagCatalog.category.fork",
    descriptionKey: "bagCatalog.category.forkDescription"
  },
  {
    id: "pannier",
    family: "panniers",
    labelKey: "bagCatalog.category.pannier",
    descriptionKey: "bagCatalog.category.pannierDescription"
  },
  {
    id: "hybrid-pannier",
    family: "panniers",
    labelKey: "bagCatalog.category.hybridPannier",
    descriptionKey: "bagCatalog.category.hybridPannierDescription"
  },
  {
    id: "rack-top",
    family: "panniers",
    labelKey: "bagCatalog.category.rackTop",
    descriptionKey: "bagCatalog.category.rackTopDescription"
  },
  {
    id: "backpack",
    family: "carry",
    labelKey: "bagCatalog.category.backpack",
    descriptionKey: "bagCatalog.category.backpackDescription"
  },
  {
    id: "shoulder-waist",
    family: "carry",
    labelKey: "bagCatalog.category.shoulderWaist",
    descriptionKey: "bagCatalog.category.shoulderWaistDescription"
  }
];

export const MANUFACTURER_BAG_CATALOG = assertManufacturerBagCatalogSkuModels(
  splitManufacturerBagCatalogSkuModels(MANUFACTURER_BAG_CATALOG_GENERATED)
);
