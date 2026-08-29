import {
  manufacturerBagComparisonDimensions,
  manufacturerBagComparisonRange,
  manufacturerBagComparisonRows
} from "../state/manufacturer-bag-comparison.js";

function safeHttpsUrl(value = "") {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function createManufacturerBagComparisonDialogController({
  catalog = [],
  categories = [],
  escapeHtml = (value) => String(value || ""),
  openModalDialog = (dialog) => dialog?.showModal?.(),
  refs,
  t = (key) => key
} = {}) {
  let category = "";

  function catalogRows() {
    const rows = typeof catalog === "function" ? catalog() : catalog;
    return Array.isArray(rows) ? rows : [];
  }

  function categoryEntry() {
    return categories.find((entry) => entry.id === category) || null;
  }

  function valueOrUnknown(value) {
    return value ? escapeHtml(value) : `<span class="manufacturer-comparison-unknown">${escapeHtml(t("bagCatalog.compare.unknown"))}</span>`;
  }

  function renderRow(entry) {
    const sourceUrl = safeHttpsUrl(entry.sourceUrl);
    const volume = manufacturerBagComparisonRange(entry.volumeOptions, t("bagCatalog.liters"));
    const weight = manufacturerBagComparisonRange(entry.weightOptions, t("bagCatalog.grams"));
    const dimensions = manufacturerBagComparisonDimensions(entry.dimensions);
    const availability = entry.available
      ? t("bagCatalog.compare.available", { count: entry.availableVariantCount || 0 })
      : t("bagCatalog.compare.unavailable");
    return `
      <tr>
        <td class="manufacturer-comparison-model">
          ${entry.imageUrl ? `<img src="${escapeHtml(entry.imageUrl)}" alt="" loading="lazy" />` : ""}
          <span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.brand)}</small></span>
        </td>
        <td>${valueOrUnknown(volume)}</td>
        <td>${valueOrUnknown(weight)}</td>
        <td>${valueOrUnknown(dimensions ? `${dimensions} ${t("bagCatalog.centimeters")}` : "")}</td>
        <td>${valueOrUnknown(entry.waterproof)}</td>
        <td>${valueOrUnknown((entry.mountingOptions || []).join(" / ") || entry.mounting)}</td>
        <td>${escapeHtml(entry.soldAsSet ? t("bagCatalog.compare.pair") : t("bagCatalog.compare.single"))}</td>
        <td>${escapeHtml(availability)}</td>
        <td>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("bagCatalog.compare.openSource"))}</a>` : ""}</td>
      </tr>
    `;
  }

  function render() {
    if (!refs?.bagCatalogCompareBody) return;
    const type = categoryEntry();
    const rows = manufacturerBagComparisonRows(catalogRows(), category);
    refs.bagCatalogCompareTitle.textContent = t("bagCatalog.compare.title", {
      type: t(type?.labelKey || "")
    });
    refs.bagCatalogCompareSummary.textContent = t("bagCatalog.compare.summary", { count: rows.length });
    refs.bagCatalogCompareModelHeading.textContent = t("bagCatalog.compare.model");
    refs.bagCatalogCompareVolumeHeading.textContent = t("bagCatalog.compare.volume");
    refs.bagCatalogCompareWeightHeading.textContent = t("bagCatalog.compare.weight");
    refs.bagCatalogCompareDimensionsHeading.textContent = t("bagCatalog.compare.dimensions");
    refs.bagCatalogCompareWaterproofHeading.textContent = t("bagCatalog.compare.waterproof");
    refs.bagCatalogCompareMountingHeading.textContent = t("bagCatalog.compare.mounting");
    refs.bagCatalogCompareSetHeading.textContent = t("bagCatalog.compare.set");
    refs.bagCatalogCompareAvailabilityHeading.textContent = t("bagCatalog.compare.availability");
    refs.bagCatalogCompareSourceHeading.textContent = t("bagCatalog.compare.source");
    refs.bagCatalogCompareBody.innerHTML = rows.map(renderRow).join("");
  }

  function open(categoryId) {
    category = String(categoryId || "");
    if (!categoryEntry() || !refs?.bagCatalogCompareDialog) return;
    render();
    openModalDialog(refs.bagCatalogCompareDialog);
  }

  return { open, render };
}
