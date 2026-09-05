import {
  manufacturerBagComparisonDimensions,
  manufacturerBagComparisonFilterKey,
  manufacturerBagComparisonFilterOptions,
  manufacturerBagComparisonRange,
  manufacturerBagComparisonRows,
  manufacturerBagComparisonViewRows
} from "../state/manufacturer-bag-comparison.js";
import {
  manufacturerBagCatalogVolumeMetrics,
  manufacturerBagCatalogWeightMetrics
} from "../state/manufacturer-bag-catalog.js";
import { renderManufacturerCatalogPhotoGallery } from "./manufacturer-catalog-photo-gallery.js";
import { plainManufacturerCatalogDescription } from "./manufacturer-catalog-description.js";
import { renderManufacturerBrandMark } from "./manufacturer-brand-mark.js";

const TABLE_COLUMNS = [
  "model",
  "volume",
  "weight",
  "dimensions",
  "waterproof",
  "mounting",
  "set",
  "availability",
  "source"
];

const NUMERIC_RANGE_COLUMNS = new Set(["volume", "weight"]);

function safeHttpsUrl(value = "") {
  try {
    const url = new URL(String(value || ""), globalThis.location?.href);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeLocalImageUrl(value = "") {
  const normalized = String(value || "").trim();
  if (/^(?:\.\/|\/)[^\s]+$/.test(normalized)) return normalized;
  try {
    const url = new URL(normalized, globalThis.location?.href);
    if (globalThis.location?.origin && url.origin === globalThis.location.origin) return url.toString();
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function localizedDescription(entry, language = "en") {
  if (!entry?.description || typeof entry.description !== "object") return "";
  return plainManufacturerCatalogDescription(
    entry.description[language] || entry.description.en || entry.description.ru || ""
  );
}

function parseDecimal(value) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function comparisonMetricText(totalValues, perBagValues, quantity, unit, t) {
  const total = manufacturerBagComparisonRange(totalValues, "");
  if (!total) return "";
  const perBag = manufacturerBagComparisonRange(perBagValues, "");
  return perBag
    ? t("bagCatalog.setTotalWithPerBag", { total, perBag, quantity, unit })
    : `${total} ${unit}`;
}

function comparisonVolumeText(perBagValues, totalValues, quantity, unit, t) {
  const perBag = manufacturerBagComparisonRange(perBagValues, "");
  const total = manufacturerBagComparisonRange(totalValues, "");
  if (!perBag && Number(quantity || 1) > 1 && total) {
    return t("bagCatalog.compare.setTotalNotComparable", { total, unit });
  }
  if (!perBag) return "";
  return Number(quantity || 1) > 1 && total
    ? t("bagCatalog.compare.perBagWithSetTotal", { perBag, total, quantity, unit })
    : `${perBag} ${unit}`;
}

export function createManufacturerBagComparisonDialogController({
  bindGalleries = () => null,
  brands = [],
  catalog = [],
  categories = [],
  escapeHtml = (value) => String(value || ""),
  language = () => "en",
  openModalDialog = (dialog) => dialog?.showModal?.(),
  refs,
  t = (key) => key
} = {}) {
  let category = "";
  let filters = {};
  let sort = { column: "model", direction: "asc" };
  let activeFilterColumn = "";
  let activeFilterAnchor = null;
  let detailPhotoGalleryBinding = null;

  function catalogRows() {
    const rows = typeof catalog === "function" ? catalog() : catalog;
    return Array.isArray(rows) ? rows : [];
  }

  function comparisonRows() {
    return manufacturerBagComparisonRows(catalogRows(), category);
  }

  function categoryEntry() {
    return categories.find((entry) => entry.id === category) || null;
  }

  function valueOrUnknown(value) {
    return value
      ? escapeHtml(value)
      : `<span class="manufacturer-comparison-unknown">${escapeHtml(t("bagCatalog.compare.unknown"))}</span>`;
  }

  function availabilityText(entry) {
    if (!entry.available) return t("bagCatalog.compare.unavailable");
    const count = Math.max(0, Number(entry.availableVariantCount || 0));
    return count
      ? t("bagCatalog.compare.availableSku", { count })
      : t("bagCatalog.compare.noAvailableSku");
  }

  function setKindText(entry) {
    if (entry.volumeSetBasis === "composite-set") return t("bagCatalog.compare.compositeSet");
    return entry.soldAsSet ? t("bagCatalog.compare.pair") : t("bagCatalog.compare.single");
  }

  function columnLabel(column) {
    return t({
      model: "bagCatalog.compare.model",
      manufacturer: "bagCatalog.compare.manufacturer",
      volume: "bagCatalog.compare.volumePerBag",
      weight: "bagCatalog.compare.weight",
      dimensions: "bagCatalog.compare.dimensions",
      waterproof: "bagCatalog.compare.waterproof",
      mounting: "bagCatalog.compare.mounting",
      set: "bagCatalog.compare.set",
      availability: "bagCatalog.compare.availability",
      source: "bagCatalog.compare.source"
    }[column] || "");
  }

  function filterOptionLabel(entry, column) {
    if (manufacturerBagComparisonFilterKey(entry, column) === "__unknown__") {
      if (column === "volume" && entry.volumeTotalOptions?.length && entry.setQuantity > 1) {
        return comparisonVolumeText([], entry.volumeTotalOptions, entry.setQuantity, t("bagCatalog.liters"), t);
      }
      return t("bagCatalog.compare.unknown");
    }
    if (column === "model") return entry.name || "";
    if (column === "manufacturer") return entry.brand || "";
    if (column === "volume") return comparisonVolumeText(entry.volumeOptions, entry.volumeTotalOptions, entry.setQuantity, t("bagCatalog.liters"), t);
    if (column === "weight") return comparisonMetricText(entry.weightOptions, entry.weightPerBagOptions, entry.setQuantity, t("bagCatalog.grams"), t);
    if (column === "dimensions") {
      const dimensions = manufacturerBagComparisonDimensions(entry.dimensions);
      return dimensions ? `${dimensions} ${t("bagCatalog.centimeters")}` : "";
    }
    if (column === "waterproof") return entry.waterproof || "";
    if (column === "mounting") return (entry.mountingOptions || []).join(" / ") || entry.mounting || "";
    if (column === "set") return setKindText(entry);
    if (column === "availability") return availabilityText(entry);
    if (column === "source") return entry.provider || entry.brand || "";
    return "";
  }

  function renderRow(entry) {
    const sourceUrl = safeHttpsUrl(entry.sourceUrl);
    const imageUrl = safeLocalImageUrl(entry.imageUrl);
    const volume = comparisonVolumeText(entry.volumeOptions, entry.volumeTotalOptions, entry.setQuantity, t("bagCatalog.liters"), t);
    const weight = comparisonMetricText(entry.weightOptions, entry.weightPerBagOptions, entry.setQuantity, t("bagCatalog.grams"), t);
    const dimensions = manufacturerBagComparisonDimensions(entry.dimensions);
    return `
      <tr>
        <td class="manufacturer-comparison-model">
          <button type="button" data-bag-comparison-detail="${escapeHtml(entry.id)}" aria-label="${escapeHtml(t("bagCatalog.compare.openDetailsFor", { name: entry.name }))}">
            ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy" />` : ""}
            <span><strong>${escapeHtml(entry.name)}</strong>${renderManufacturerBrandMark({ brand: entry.brand, brands, className: "manufacturer-comparison-brand", escapeHtml })}</span>
          </button>
        </td>
        <td>${valueOrUnknown(volume)}</td>
        <td>${valueOrUnknown(weight)}</td>
        <td>${valueOrUnknown(dimensions ? `${dimensions} ${t("bagCatalog.centimeters")}` : "")}</td>
        <td>${valueOrUnknown(entry.waterproof)}</td>
        <td>${valueOrUnknown((entry.mountingOptions || []).join(" / ") || entry.mounting)}</td>
        <td>${escapeHtml(setKindText(entry))}</td>
        <td>${escapeHtml(availabilityText(entry))}</td>
        <td>${sourceUrl ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("bagCatalog.compare.openSource"))}</a>` : ""}</td>
      </tr>
    `;
  }

  function renderHeadings() {
    const refsByColumn = {
      model: refs.bagCatalogCompareModelHeading,
      volume: refs.bagCatalogCompareVolumeHeading,
      weight: refs.bagCatalogCompareWeightHeading,
      dimensions: refs.bagCatalogCompareDimensionsHeading,
      waterproof: refs.bagCatalogCompareWaterproofHeading,
      mounting: refs.bagCatalogCompareMountingHeading,
      set: refs.bagCatalogCompareSetHeading,
      availability: refs.bagCatalogCompareAvailabilityHeading,
      source: refs.bagCatalogCompareSourceHeading
    };
    TABLE_COLUMNS.forEach((column) => {
      if (refsByColumn[column]) refsByColumn[column].textContent = columnLabel(column);
      const heading = refs.bagCatalogCompareDialog.querySelector(`[data-bag-comparison-heading="${column}"]`);
      const button = heading?.querySelector("button");
      button?.classList.toggle("is-filtered", Boolean(filters[column]));
      button?.classList.toggle("is-sorted", sort.column === column);
      button?.setAttribute("aria-label", t("bagCatalog.compare.filterColumn", { column: columnLabel(column) }));
      heading?.setAttribute("aria-sort", sort.column === column
        ? (sort.direction === "desc" ? "descending" : "ascending")
        : "none");
    });
  }

  function renderManufacturerControl(rows) {
    const allBrands = manufacturerBagComparisonFilterOptions(rows, "manufacturer");
    const selected = filters.manufacturer?.selectedKeys;
    refs.bagCatalogCompareManufacturerLabel.textContent = t("bagCatalog.compare.manufacturers");
    refs.bagCatalogCompareManufacturerBtn.classList.toggle("is-filtered", Boolean(filters.manufacturer));
    refs.bagCatalogCompareManufacturerBtn.setAttribute("aria-label", t("bagCatalog.compare.filterManufacturers"));
    refs.bagCatalogCompareManufacturerValue.textContent = selected
      ? t("bagCatalog.compare.manufacturersSelected", { selected: selected.length, total: allBrands.length })
      : t("bagCatalog.compare.allManufacturers", { count: allBrands.length });
  }

  function render() {
    if (!refs?.bagCatalogCompareBody) return;
    const type = categoryEntry();
    const allRows = comparisonRows();
    const rows = manufacturerBagComparisonViewRows(allRows, { filters, sort });
    refs.bagCatalogCompareTitle.textContent = t("bagCatalog.compare.title", { type: t(type?.labelKey || "") });
    refs.bagCatalogCompareSummary.textContent = rows.length === allRows.length
      ? t("bagCatalog.compare.summary", { count: rows.length })
      : t("bagCatalog.compare.summaryFiltered", { count: rows.length, total: allRows.length });
    renderHeadings();
    renderManufacturerControl(allRows);
    refs.bagCatalogCompareBody.innerHTML = rows.length
      ? rows.map(renderRow).join("")
      : `<tr><td class="manufacturer-comparison-empty" colspan="9">${escapeHtml(t("bagCatalog.compare.noMatches"))}</td></tr>`;
  }

  function closeFilterPanel() {
    if (!refs?.bagCatalogCompareFilterPanel) return;
    refs.bagCatalogCompareFilterPanel.hidden = true;
    activeFilterAnchor?.setAttribute("aria-expanded", "false");
    activeFilterColumn = "";
    activeFilterAnchor = null;
  }

  function positionFilterPanel() {
    if (!activeFilterAnchor || refs.bagCatalogCompareFilterPanel.hidden) return;
    const anchor = activeFilterAnchor.getBoundingClientRect();
    const panel = refs.bagCatalogCompareFilterPanel;
    const viewport = globalThis.visualViewport;
    const viewportLeft = Number(viewport?.offsetLeft || 0);
    const viewportTop = Number(viewport?.offsetTop || 0);
    const viewportWidth = Number(viewport?.width || globalThis.innerWidth || 0);
    const viewportHeight = Number(viewport?.height || globalThis.innerHeight || 0);
    const panelWidth = Math.min(panel.offsetWidth || 340, Math.max(280, viewportWidth - 16));
    const panelHeight = panel.offsetHeight || 420;
    const left = Math.max(viewportLeft + 8, Math.min(anchor.left, viewportLeft + viewportWidth - panelWidth - 8));
    const below = anchor.bottom + 6;
    const top = below + panelHeight <= viewportTop + viewportHeight - 8
      ? below
      : Math.max(viewportTop + 8, anchor.top - panelHeight - 6);
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    // A transformed mobile dialog becomes the containing block for fixed descendants.
    // Correct the measured position so the panel still follows the visual viewport.
    const positioned = panel.getBoundingClientRect();
    const correctedLeft = left + (left - positioned.left);
    const correctedTop = top + (top - positioned.top);
    panel.style.left = `${Math.round(correctedLeft)}px`;
    panel.style.top = `${Math.round(correctedTop)}px`;
  }

  function renderFilterPanel() {
    const column = activeFilterColumn;
    if (!column) return;
    const rows = comparisonRows();
    const current = filters[column] || {};
    const selectedKeys = Array.isArray(current.selectedKeys) ? new Set(current.selectedKeys) : null;
    const options = manufacturerBagComparisonFilterOptions(rows, column)
      .map((option) => ({ ...option, label: filterOptionLabel(option.entry, column) }))
      .sort((left, right) => left.label.localeCompare(right.label, undefined, { numeric: true }));
    refs.bagCatalogCompareFilterTitle.textContent = t("bagCatalog.compare.filterTitle", { column: columnLabel(column) });
    refs.bagCatalogCompareFilterCloseBtn.setAttribute("aria-label", t("bagCatalog.compare.filterClose"));
    refs.bagCatalogCompareSortActions.hidden = column === "manufacturer";
    refs.bagCatalogCompareSortAscBtn.textContent = t("bagCatalog.compare.sortAscending");
    refs.bagCatalogCompareSortDescBtn.textContent = t("bagCatalog.compare.sortDescending");
    refs.bagCatalogCompareSortAscBtn.classList.toggle("is-active", sort.column === column && sort.direction === "asc");
    refs.bagCatalogCompareSortDescBtn.classList.toggle("is-active", sort.column === column && sort.direction === "desc");
    const hasNumericRange = NUMERIC_RANGE_COLUMNS.has(column);
    refs.bagCatalogCompareRangeFields.hidden = !hasNumericRange;
    refs.bagCatalogCompareRangeHint.textContent = t("bagCatalog.compare.rangeHint");
    refs.bagCatalogCompareRangeMinLabel.textContent = t("bagCatalog.compare.rangeFrom");
    refs.bagCatalogCompareRangeMaxLabel.textContent = t("bagCatalog.compare.rangeTo");
    refs.bagCatalogCompareRangeMin.value = current.min ?? "";
    refs.bagCatalogCompareRangeMax.value = current.max ?? "";
    refs.bagCatalogCompareFilterSearchLabel.textContent = t("bagCatalog.compare.searchValues");
    refs.bagCatalogCompareFilterSearch.placeholder = t("bagCatalog.compare.searchValues");
    refs.bagCatalogCompareFilterSearch.value = "";
    refs.bagCatalogCompareFilterSelectAllBtn.textContent = t("bagCatalog.compare.selectAll");
    refs.bagCatalogCompareFilterClearBtn.textContent = t("bagCatalog.compare.clearAll");
    refs.bagCatalogCompareFilterResetBtn.textContent = t("bagCatalog.compare.resetFilter");
    refs.bagCatalogCompareFilterApplyBtn.textContent = t("bagCatalog.compare.applyFilter");
    refs.bagCatalogCompareFilterOptions.innerHTML = options.length
      ? options.map((option) => `
          <label data-bag-comparison-option-search="${escapeHtml(option.label.toLocaleLowerCase())}">
            <input type="checkbox" data-bag-comparison-option-key="${escapeHtml(option.key)}" ${!selectedKeys || selectedKeys.has(option.key) ? "checked" : ""} />
            ${column === "manufacturer"
              ? renderManufacturerBrandMark({ brand: option.label, brands, className: "manufacturer-comparison-filter-brand", escapeHtml })
              : `<span>${escapeHtml(option.label)}</span>`}
            <small>${escapeHtml(option.count)}</small>
          </label>
        `).join("")
      : `<p class="manufacturer-comparison-unknown">${escapeHtml(t("bagCatalog.compare.noValues"))}</p>`;
  }

  function openFilterPanel(column, anchor) {
    if (!column || !refs?.bagCatalogCompareFilterPanel) return;
    activeFilterAnchor?.setAttribute("aria-expanded", "false");
    activeFilterColumn = column;
    activeFilterAnchor = anchor;
    activeFilterAnchor?.setAttribute("aria-expanded", "true");
    renderFilterPanel();
    refs.bagCatalogCompareFilterPanel.hidden = false;
    globalThis.requestAnimationFrame?.(() => {
      positionFilterPanel();
      refs.bagCatalogCompareFilterSearch?.focus();
    });
  }

  function setSort(direction) {
    if (!activeFilterColumn || activeFilterColumn === "manufacturer") return;
    sort = { column: activeFilterColumn, direction };
    render();
    closeFilterPanel();
  }

  function setAllVisibleOptions(checked) {
    refs.bagCatalogCompareFilterOptions
      ?.querySelectorAll('label:not([hidden]) input[type="checkbox"]')
      .forEach((input) => { input.checked = checked; });
  }

  function applyFilter() {
    const column = activeFilterColumn;
    if (!column) return;
    const checkboxes = [...refs.bagCatalogCompareFilterOptions.querySelectorAll('input[type="checkbox"]')];
    const selectedKeys = checkboxes.filter((input) => input.checked)
      .map((input) => input.dataset.bagComparisonOptionKey || "");
    const filter = {};
    if (selectedKeys.length !== checkboxes.length) filter.selectedKeys = selectedKeys;
    if (NUMERIC_RANGE_COLUMNS.has(column)) {
      const min = parseDecimal(refs.bagCatalogCompareRangeMin.value);
      const max = parseDecimal(refs.bagCatalogCompareRangeMax.value);
      if (min !== null && max !== null) {
        filter.min = Math.min(min, max);
        filter.max = Math.max(min, max);
      } else {
        if (min !== null) filter.min = min;
        if (max !== null) filter.max = max;
      }
    }
    if (Object.keys(filter).length) filters = { ...filters, [column]: filter };
    else {
      const { [column]: omitted, ...remaining } = filters;
      filters = remaining;
    }
    render();
    closeFilterPanel();
  }

  function resetActiveFilter() {
    if (!activeFilterColumn) return;
    const { [activeFilterColumn]: omitted, ...remaining } = filters;
    filters = remaining;
    render();
    closeFilterPanel();
  }

  function renderDetail(entry) {
    const sourceUrl = safeHttpsUrl(entry.sourceUrl);
    const locale = language() === "ru" ? "ru" : "en";
    const dimensions = manufacturerBagComparisonDimensions(entry.dimensions);
    const volumeMetrics = manufacturerBagCatalogVolumeMetrics(entry);
    const weightMetrics = manufacturerBagCatalogWeightMetrics(entry);
    const volumeText = comparisonMetricText(volumeMetrics.total, volumeMetrics.perBag, volumeMetrics.quantity, t("bagCatalog.liters"), t);
    const weightText = comparisonMetricText(weightMetrics.total, weightMetrics.perBag, weightMetrics.quantity, t("bagCatalog.grams"), t);
    const loadText = entry.totalLoadKg && entry.loadPerBagKg
      ? t("bagCatalog.setTotalWithPerBag", {
          total: entry.totalLoadKg,
          perBag: entry.loadPerBagKg,
          quantity: entry.setQuantity,
          unit: t("bagCatalog.kilograms")
        })
      : entry.loadKg ? `${entry.loadKg} ${t("bagCatalog.kilograms")}` : "";
    const detailRows = [
      [t("bagCatalog.compare.manufacturer"), entry.brand],
      [t("bagCatalog.field.volume"), volumeText],
      [t("bagCatalog.field.weight"), weightText],
      [t("bagCatalog.compare.dimensions"), dimensions ? `${dimensions} ${t("bagCatalog.centimeters")}${entry.specificationBasis === "per-bag" ? ` · ${t("bagCatalog.perBag")}` : ""}` : ""],
      [t("bagCatalog.field.load"), loadText],
      [t("bagCatalog.field.waterproof"), entry.waterproof],
      [t("bagCatalog.field.material"), entry.material],
      [t("bagCatalog.field.mounting"), (entry.mountingOptions || []).join(" / ") || entry.mounting],
      [t("bagCatalog.compare.set"), setKindText(entry)],
      [t("bagCatalog.compare.specificationBasis"), entry.specificationBasis === "per-bag" ? t("bagCatalog.compare.officialPerBag") : ""],
      [t("bagCatalog.compare.availability"), availabilityText(entry)]
    ].filter(([, value]) => value);
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    refs.bagCatalogProductDetailTitle.textContent = `${entry.brand} ${entry.name}`;
    refs.bagCatalogProductDetailBody.innerHTML = `
      <div class="manufacturer-product-detail-overview">
        ${renderManufacturerCatalogPhotoGallery(entry, {
          className: "manufacturer-product-detail-gallery",
          escapeHtml,
          safeImageUrl: safeLocalImageUrl,
          t
        })}
        <div>
          <p class="manufacturer-product-detail-description">${escapeHtml(localizedDescription(entry, locale))}</p>
          <dl>${detailRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
          ${sourceUrl ? `<a class="ghost manufacturer-catalog-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("bagCatalog.source"))}</a>` : ""}
        </div>
      </div>
      <section class="manufacturer-product-detail-variants">
        <h3>${escapeHtml(t("bagCatalog.compare.skuVariants", { count: variants.length }))}</h3>
        <div class="manufacturer-product-detail-variants-scroll">
          <table>
            <thead><tr>
              <th><abbr class="manufacturer-catalog-sku-term" title="${escapeHtml(t("bagCatalog.field.skuHelp"))}">${escapeHtml(t("bagCatalog.field.sku"))}</abbr></th>
              <th>${escapeHtml(t("bagCatalog.field.color"))}</th>
              <th>${escapeHtml(t("bagCatalog.compare.volume"))}</th>
              <th>${escapeHtml(t("bagCatalog.compare.weight"))}</th>
              <th>${escapeHtml(t("bagCatalog.compare.mounting"))}</th>
              <th>${escapeHtml(t("bagCatalog.compare.status"))}</th>
            </tr></thead>
            <tbody>${variants.map((variant) => `
              <tr>
                <td>${valueOrUnknown(variant.sku)}</td>
                <td>${valueOrUnknown(variant.color || variant.title)}</td>
                <td>${valueOrUnknown((variant.volume || entry.volume) ? `${variant.volume || entry.volume} ${t("bagCatalog.liters")}${entry.specificationBasis === "per-bag" ? ` · ${t("bagCatalog.perBag")}` : ""}` : "")}</td>
                <td>${valueOrUnknown((variant.weight || entry.weight) ? `${variant.weight || entry.weight} ${t("bagCatalog.grams")}${entry.specificationBasis === "per-bag" ? ` · ${t("bagCatalog.perBag")}` : ""}` : "")}</td>
                <td>${valueOrUnknown(variant.mounting || entry.mounting)}</td>
                <td>${escapeHtml(variant.available ? t("bagCatalog.compare.skuAvailable") : t("bagCatalog.compare.skuUnavailable"))}</td>
              </tr>
            `).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
    detailPhotoGalleryBinding?.destroy?.();
    detailPhotoGalleryBinding = bindGalleries(refs.bagCatalogProductDetailBody);
  }

  function openDetail(id) {
    const entry = catalogRows().find((row) => row.id === id);
    if (!entry || !refs?.bagCatalogProductDetailDialog) return;
    closeFilterPanel();
    renderDetail(entry);
    openModalDialog(refs.bagCatalogProductDetailDialog);
  }

  function open(categoryId) {
    category = String(categoryId || "");
    if (!categoryEntry() || !refs?.bagCatalogCompareDialog) return;
    filters = {};
    sort = { column: "model", direction: "asc" };
    closeFilterPanel();
    render();
    openModalDialog(refs.bagCatalogCompareDialog);
  }

  refs?.bagCatalogCompareDialog?.addEventListener("click", (event) => {
    const filterButton = event.target.closest("[data-bag-comparison-filter]");
    if (filterButton) {
      openFilterPanel(filterButton.dataset.bagComparisonFilter || "", filterButton);
      return;
    }
    const detailButton = event.target.closest("[data-bag-comparison-detail]");
    if (detailButton) {
      openDetail(detailButton.dataset.bagComparisonDetail || "");
      return;
    }
    if (!refs.bagCatalogCompareFilterPanel.hidden
      && !refs.bagCatalogCompareFilterPanel.contains(event.target)) closeFilterPanel();
  });
  refs?.bagCatalogCompareDialog?.addEventListener("close", closeFilterPanel);
  refs?.bagCatalogCompareFilterCloseBtn?.addEventListener("click", closeFilterPanel);
  refs?.bagCatalogCompareSortAscBtn?.addEventListener("click", () => setSort("asc"));
  refs?.bagCatalogCompareSortDescBtn?.addEventListener("click", () => setSort("desc"));
  refs?.bagCatalogCompareFilterSelectAllBtn?.addEventListener("click", () => setAllVisibleOptions(true));
  refs?.bagCatalogCompareFilterClearBtn?.addEventListener("click", () => setAllVisibleOptions(false));
  refs?.bagCatalogCompareFilterApplyBtn?.addEventListener("click", applyFilter);
  refs?.bagCatalogCompareFilterResetBtn?.addEventListener("click", resetActiveFilter);
  refs?.bagCatalogCompareFilterSearch?.addEventListener("input", () => {
    const query = String(refs.bagCatalogCompareFilterSearch.value || "").trim().toLocaleLowerCase();
    refs.bagCatalogCompareFilterOptions.querySelectorAll("[data-bag-comparison-option-search]").forEach((option) => {
      option.hidden = Boolean(query) && !String(option.dataset.bagComparisonOptionSearch || "").includes(query);
    });
  });
  globalThis.addEventListener?.("resize", positionFilterPanel);
  globalThis.visualViewport?.addEventListener?.("resize", positionFilterPanel);
  globalThis.visualViewport?.addEventListener?.("scroll", positionFilterPanel);

  return { open, openDetail, render };
}
