export function createSharedLayoutCatalogDiagnostics({
  source = "",
  records = [],
  sharedLayoutIdFromRecord = () => "",
  confirmedLayouts = [],
  visibleOptions = []
} = {}) {
  const parsedIds = records.map((record) => sharedLayoutIdFromRecord(record)).filter(Boolean);
  const confirmedIds = confirmedLayouts.map((layout) => String(layout?.id || "").trim()).filter(Boolean);
  const visibleSharedOptions = visibleOptions
    .map((option) => String(option?.[0] || ""))
    .filter((value) => value.startsWith("shared:") || value.startsWith("template:"));
  return {
    source,
    recordCount: records.length,
    parsedIdCount: parsedIds.length,
    confirmedCount: confirmedIds.length,
    visibleSharedOptionCount: visibleSharedOptions.length,
    sampleRecordIds: parsedIds.slice(0, 8),
    sampleConfirmedIds: confirmedIds.slice(0, 8),
    sampleVisibleOptions: visibleSharedOptions.slice(0, 8)
  };
}

export function shouldWarnAboutSharedLayoutCatalog(diagnostics) {
  return Boolean(
    diagnostics &&
    diagnostics.recordCount > 0 &&
    diagnostics.parsedIdCount > 0 &&
    diagnostics.confirmedCount > 0 &&
    diagnostics.visibleSharedOptionCount === 0
  );
}
