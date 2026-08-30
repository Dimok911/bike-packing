export function shouldUseCompactStickyControls({
  mobile = false,
  searchEditing = false,
  sticky = false
} = {}) {
  return Boolean(sticky && mobile && !searchEditing);
}

export function createStickyFilterControlsController({
  documentRef = document,
  isSearchEditing = () => false,
  refs = {},
  shouldKeepStable = () => false,
  shouldUseSticky = () => false,
  windowRef = window
} = {}) {
  const updateHeights = () => {
    const experimentBanner = documentRef.querySelector?.(".experiment-banner");
    const bannerHeight = experimentBanner
      && experimentBanner.offsetParent !== null
      && windowRef.getComputedStyle?.(experimentBanner).position === "sticky"
      ? Math.ceil(experimentBanner.getBoundingClientRect().height)
      : 0;
    const bannerOffset = bannerHeight
      ? Math.max(bannerHeight, Math.ceil(experimentBanner.getBoundingClientRect().bottom))
      : 0;
    const controlsHeight = shouldUseSticky() && refs.controls && !refs.controls.hidden
      ? Math.ceil(refs.controls.getBoundingClientRect().height)
      : 0;
    const tabsRow = documentRef.querySelector?.(".tabs-row");
    const tabsHeight = tabsRow && tabsRow.offsetParent !== null
      ? Math.ceil(tabsRow.getBoundingClientRect().height)
      : 0;
    documentRef.documentElement?.style?.setProperty?.("--sticky-banner-height", `${bannerHeight}px`);
    documentRef.documentElement?.style?.setProperty?.("--sticky-banner-offset", `${bannerOffset}px`);
    documentRef.documentElement?.style?.setProperty?.("--sticky-controls-height", `${controlsHeight}px`);
    documentRef.documentElement?.style?.setProperty?.("--sticky-tabs-height", `${tabsHeight}px`);
  };

  const update = () => {
    const searchEditing = shouldKeepStable() && isSearchEditing();
    const sticky = shouldUseSticky();
    const compact = shouldUseCompactStickyControls({
      mobile: shouldKeepStable(),
      searchEditing,
      sticky
    });
    documentRef.body?.classList?.toggle?.("filter-sticky-controls", Boolean(sticky));
    documentRef.body?.classList?.toggle?.("compact-sticky-controls", compact);
    documentRef.body?.classList?.toggle?.("search-input-focused", Boolean(searchEditing));
    updateHeights();
  };

  return {
    update,
    updateHeights
  };
}
