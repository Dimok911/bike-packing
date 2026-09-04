const MANUFACTURER_BRAND_LOGOS = {
  apidura: new URL("../../assets/manufacturer-brands/apidura.svg", import.meta.url).href,
  arkel: new URL("../../assets/manufacturer-brands/arkel.png", import.meta.url).href,
  blackburn: new URL("../../assets/manufacturer-brands/blackburn.svg", import.meta.url).href,
  cyclite: new URL("../../assets/manufacturer-brands/cyclite.svg", import.meta.url).href,
  "miss-grape": new URL("../../assets/manufacturer-brands/miss-grape.png", import.meta.url).href,
  ortlieb: new URL("../../assets/manufacturer-brands/ortlieb.png", import.meta.url).href,
  "revelate-designs": new URL("../../assets/manufacturer-brands/revelate-designs.png", import.meta.url).href,
  restrap: new URL("../../assets/manufacturer-brands/restrap.svg", import.meta.url).href,
  tailfin: new URL("../../assets/manufacturer-brands/tailfin.svg", import.meta.url).href,
  topeak: new URL("../../assets/manufacturer-brands/topeak.svg", import.meta.url).href,
  rockgeist: new URL("../../assets/manufacturer-brands/rockgeist.png", import.meta.url).href
};

export const MANUFACTURER_BAG_CATALOG_BRANDS = [
  { id: "ortlieb", name: "ORTLIEB", catalogBrand: "ORTLIEB", logoUrl: MANUFACTURER_BRAND_LOGOS.ortlieb, status: "active" },
  { id: "apidura", name: "Apidura", catalogBrand: "Apidura", logoUrl: MANUFACTURER_BRAND_LOGOS.apidura, status: "active" },
  { id: "restrap", name: "Restrap", catalogBrand: "Restrap", logoUrl: MANUFACTURER_BRAND_LOGOS.restrap, status: "active" },
  { id: "tailfin", name: "Tailfin", catalogBrand: "Tailfin", logoUrl: MANUFACTURER_BRAND_LOGOS.tailfin, status: "active" },
  { id: "arkel", name: "Arkel", catalogBrand: "Arkel", logoUrl: MANUFACTURER_BRAND_LOGOS.arkel, status: "active" },
  { id: "revelate-designs", name: "Revelate Designs", catalogBrand: "Revelate Designs", logoUrl: MANUFACTURER_BRAND_LOGOS["revelate-designs"], status: "active" },
  { id: "miss-grape", name: "Miss Grape", catalogBrand: "Miss Grape", logoUrl: MANUFACTURER_BRAND_LOGOS["miss-grape"], status: "active" },
  { id: "cyclite", name: "CYCLITE", catalogBrand: "CYCLITE", logoUrl: MANUFACTURER_BRAND_LOGOS.cyclite, status: "active" },
  { id: "blackburn", name: "Blackburn", catalogBrand: "Blackburn", logoUrl: MANUFACTURER_BRAND_LOGOS.blackburn, status: "active" },
  { id: "topeak", name: "Topeak", catalogBrand: "Topeak", logoUrl: MANUFACTURER_BRAND_LOGOS.topeak, status: "active" },
  { id: "rockgeist", name: "Rockgeist", catalogBrand: "Rockgeist", logoUrl: MANUFACTURER_BRAND_LOGOS.rockgeist, status: "active" }
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
