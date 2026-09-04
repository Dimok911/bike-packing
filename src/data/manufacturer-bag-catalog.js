import { MANUFACTURER_BAG_CATALOG_GENERATED } from "./manufacturer-bag-catalog.generated.js";
import {
  assertManufacturerBagCatalogSkuModels,
  splitManufacturerBagCatalogSkuModels
} from "./manufacturer-bag-catalog-variants.js";
export {
  MANUFACTURER_BAG_CATALOG_BRANDS,
  MANUFACTURER_BAG_CATALOG_CATEGORIES,
  MANUFACTURER_BAG_CATALOG_FAMILIES
} from "./manufacturer-bag-catalog-meta.js";

export const MANUFACTURER_BAG_CATALOG = assertManufacturerBagCatalogSkuModels(
  splitManufacturerBagCatalogSkuModels(MANUFACTURER_BAG_CATALOG_GENERATED)
);
