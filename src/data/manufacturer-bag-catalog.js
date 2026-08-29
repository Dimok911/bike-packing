import { MANUFACTURER_BAG_CATALOG_GENERATED } from "./manufacturer-bag-catalog.generated.js";

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
    id: "rear-pannier",
    family: "panniers",
    labelKey: "bagCatalog.category.rearPannier",
    descriptionKey: "bagCatalog.category.rearPannierDescription"
  },
  {
    id: "front-pannier",
    family: "panniers",
    labelKey: "bagCatalog.category.frontPannier",
    descriptionKey: "bagCatalog.category.frontPannierDescription"
  },
  {
    id: "universal-pannier",
    family: "panniers",
    labelKey: "bagCatalog.category.universalPannier",
    descriptionKey: "bagCatalog.category.universalPannierDescription"
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
    id: "messenger",
    family: "carry",
    labelKey: "bagCatalog.category.messenger",
    descriptionKey: "bagCatalog.category.messengerDescription"
  },
  {
    id: "tote-sling",
    family: "carry",
    labelKey: "bagCatalog.category.toteSling",
    descriptionKey: "bagCatalog.category.toteSlingDescription"
  }
];

export const MANUFACTURER_BAG_CATALOG = MANUFACTURER_BAG_CATALOG_GENERATED;
