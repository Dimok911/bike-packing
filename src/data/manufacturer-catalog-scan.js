const CATALOG_COMPARE_FIELDS = Object.freeze([
  "name",
  "family",
  "category",
  "volume",
  "volumeOptions",
  "volumeMin",
  "volumeMax",
  "volumePerBag",
  "volumePerBagOptions",
  "volumeTotal",
  "totalVolume",
  "totalVolumeOptions",
  "specificationBasis",
  "setQuantity",
  "volumeSetBasis",
  "weight",
  "weightOptions",
  "weightMin",
  "weightMax",
  "weightPerBag",
  "weightPerBagOptions",
  "weightTotal",
  "totalWeight",
  "totalWeightOptions",
  "dimensions",
  "waterproofRating",
  "mounting",
  "mountingOptions",
  "soldAsSet",
  "available",
  "variants",
  "sourceImageUrl",
  "sourceImageUrls",
]);

const cloneJson = (value) => value == null ? null : JSON.parse(JSON.stringify(value));

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
};

const sameValue = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));

export const manufacturerIdForEntry = (entry) => String(entry?.manufacturerId || entry?.brand || "")
  .trim()
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

const productEvidence = (entry) => ({
  id: String(entry?.id || ""),
  name: String(entry?.name || ""),
  brand: String(entry?.brand || ""),
  sourceUrl: String(entry?.sourceUrl || ""),
  sourceCheckedAt: String(entry?.sourceCheckedAt || ""),
  ...Object.fromEntries(CATALOG_COMPARE_FIELDS.map((field) => [field, cloneJson(entry?.[field])])),
});

const changeId = (manufacturerId, type, productId) => `${manufacturerId}:${type}:${productId}`.slice(0, 255);

export function compareManufacturerCatalogSnapshots(approvedEntries = [], scannedEntries = []) {
  const approved = new Map((Array.isArray(approvedEntries) ? approvedEntries : []).map((entry) => [String(entry?.id || ""), entry]).filter(([id]) => id));
  const scanned = new Map((Array.isArray(scannedEntries) ? scannedEntries : []).map((entry) => [String(entry?.id || ""), entry]).filter(([id]) => id));
  const changes = [];
  let unchanged = 0;

  [...new Set([...approved.keys(), ...scanned.keys()])].sort().forEach((productId) => {
    const before = approved.get(productId);
    const after = scanned.get(productId);
    const source = after || before;
    const manufacturerId = manufacturerIdForEntry(source);
    if (!before && after) {
      changes.push({
        id: changeId(manufacturerId, "added", productId),
        manufacturerId,
        manufacturer: String(after.brand || ""),
        productId,
        productName: String(after.name || productId),
        type: "added",
        sourceUrl: String(after.sourceUrl || ""),
        fields: [],
        before: null,
        after: productEvidence(after),
      });
      return;
    }
    if (before && !after) {
      changes.push({
        id: changeId(manufacturerId, "missing", productId),
        manufacturerId,
        manufacturer: String(before.brand || ""),
        productId,
        productName: String(before.name || productId),
        type: "missing",
        sourceUrl: String(before.sourceUrl || ""),
        fields: [],
        before: productEvidence(before),
        after: null,
      });
      return;
    }
    const fields = CATALOG_COMPARE_FIELDS
      .filter((field) => !sameValue(before?.[field], after?.[field]))
      .map((field) => ({ field, before: cloneJson(before?.[field]), after: cloneJson(after?.[field]) }));
    if (!fields.length) {
      unchanged += 1;
      return;
    }
    changes.push({
      id: changeId(manufacturerId, "changed", productId),
      manufacturerId,
      manufacturer: String(after.brand || before.brand || ""),
      productId,
      productName: String(after.name || before.name || productId),
      type: "changed",
      sourceUrl: String(after.sourceUrl || before.sourceUrl || ""),
      fields,
      before: productEvidence(before),
      after: productEvidence(after),
    });
  });

  return { changes, unchanged, approvedCount: approved.size, scannedCount: scanned.size };
}

export function buildManufacturerCatalogScanReport({
  approvedEntries = [],
  scannedEntries = [],
  manufacturers = [],
  scannedAt = new Date().toISOString(),
  errors = {},
} = {}) {
  const comparison = compareManufacturerCatalogSnapshots(approvedEntries, scannedEntries);
  const normalizedManufacturers = manufacturers.map((manufacturer) => {
    const manufacturerErrors = Array.isArray(errors[manufacturer.id]) ? errors[manufacturer.id] : [];
    return {
      id: manufacturer.id,
      name: manufacturer.name,
      status: manufacturerErrors.length ? "partial" : "complete",
      sourceCount: manufacturer.collections?.length || 0,
      productCount: scannedEntries.filter((entry) => manufacturerIdForEntry(entry) === manufacturer.id).length,
      errors: manufacturerErrors,
    };
  });
  const status = normalizedManufacturers.some((item) => item.status === "partial") ? "partial" : "complete";
  const stamp = scannedAt.slice(0, 19).replace(/[-:T]/g, "");
  return {
    schemaVersion: 1,
    id: `catalog-scan-${stamp}`,
    scannedAt,
    status,
    manufacturers: normalizedManufacturers,
    summary: {
      manufacturers: normalizedManufacturers.length,
      products: comparison.scannedCount,
      unchanged: comparison.unchanged,
      added: comparison.changes.filter((item) => item.type === "added").length,
      changed: comparison.changes.filter((item) => item.type === "changed").length,
      missing: comparison.changes.filter((item) => item.type === "missing").length,
      errors: normalizedManufacturers.reduce((sum, item) => sum + item.errors.length, 0),
    },
    changes: comparison.changes,
  };
}

export function manufacturerCatalogScanMarkdown(report) {
  const summary = report?.summary || {};
  const lines = [
    `# Manufacturer catalog scan · ${String(report?.scannedAt || "").slice(0, 10)}`,
    "",
    `- Manufacturers: ${summary.manufacturers || 0}`,
    `- Products checked: ${summary.products || 0}`,
    `- Unchanged: ${summary.unchanged || 0}`,
    `- Added: ${summary.added || 0}`,
    `- Changed: ${summary.changed || 0}`,
    `- Missing: ${summary.missing || 0}`,
    `- Scan errors: ${summary.errors || 0}`,
  ];
  if (report?.changes?.length) {
    lines.push("", "## Review required", "");
    report.changes.forEach((change) => {
      const fields = change.fields?.length ? ` · ${change.fields.map((item) => item.field).join(", ")}` : "";
      lines.push(`- **${change.type}** · ${change.manufacturer} ${change.productName}${fields}`);
    });
  }
  return `${lines.join("\n")}\n`;
}
