import { COLLAPSE_DEFAULTS_VERSION } from "../config/constants.js";

export function createBlankBikePackingState() {
  return {
    locations: [],
    categories: [],
    containers: {},
    items: {},
    layouts: {},
    activeLayoutId: "",
    collapsedContainers: {},
    collapseDefaultsVersion: COLLAPSE_DEFAULTS_VERSION,
    itemDisplayMode: "none",
    showItemMeta: false,
    showFilterContext: false,
    collectionMode: false,
    showOnlyUnpacked: false,
    packedItems: {}
  };
}
