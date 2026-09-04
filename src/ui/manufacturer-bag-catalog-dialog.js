import {
  filterManufacturerBagCatalog,
  manufacturerBagCatalogCount,
  manufacturerBagCatalogEntry,
  manufacturerBagCatalogVolumeMetrics,
  manufacturerBagCatalogWeightMetrics,
  manufacturerBagCatalogVariantChoices,
  manufacturerBagCatalogVariantEntry
} from "../state/manufacturer-bag-catalog.js";
import { bindHorizontalTouchScroll } from "./horizontal-touch-scroll.js";
import {
  bindManufacturerCatalogPhotoLoading,
  renderManufacturerCatalogPhotoGallery
} from "./manufacturer-catalog-photo-gallery.js";
import { renderManufacturerBrandMark } from "./manufacturer-brand-mark.js";

const PRODUCT_BATCH_SIZE = 12;

function metricRange(values = []) {
  const normalized = [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0))].sort((left, right) => left - right);
  if (!normalized.length) return "";
  return normalized.length === 1 ? String(normalized[0]) : `${normalized[0]}–${normalized.at(-1)}`;
}

function catalogMetricText(metrics, unit, t) {
  const total = metricRange(metrics.total);
  if (!total) return "";
  const perBag = metricRange(metrics.perBag);
  return perBag
    ? t("bagCatalog.setTotalWithPerBag", { total, perBag, quantity: metrics.quantity, unit })
    : `${total} ${unit}`;
}

function localizedDescription(entry, language = "en") {
  if (!entry?.description || typeof entry.description !== "object") return "";
  return entry.description[language] || entry.description.en || entry.description.ru || "";
}

function dimensionText(dimensions = {}) {
  const values = [dimensions.width, dimensions.height, dimensions.depth].map((value) => Number(value || 0));
  return values.every(Boolean) ? values.join(" × ") : "";
}

function safeCatalogUrl(value, { localAsset = false } = {}) {
  const normalized = String(value || "").trim();
  if (localAsset && /^(?:\.\/|\/)[^\s]+$/.test(normalized)) return normalized;
  try {
    const url = new URL(normalized, globalThis.location?.href);
    if (localAsset && globalThis.location?.origin && url.origin === globalThis.location.origin) return url.toString();
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function createManufacturerBagCatalogDialogController({
  bindGalleries = () => null,
  bindOpenButton = true,
  canEdit = () => false,
  catalog = [],
  catalogIndex = [],
  brands = [],
  categories = [],
  escapeHtml = (value) => String(value || ""),
  families = [],
  language = () => "en",
  loadCatalog = async () => {},
  onCatalogLoadError = () => {},
  onCompareCategory = () => {},
  onSelect = async () => {},
  onSelectError = () => {},
  onUpdate = () => {},
  openModalDialog = (dialog) => dialog?.showModal?.(),
  refs,
  t = (key) => key
} = {}) {
  let family = "";
  let category = "";
  let manufacturer = "";
  let query = "";
  let editingId = "";
  let selectingId = "";
  let photoGalleryBinding = null;
  let productPhotoLoadingBinding = null;
  let productLimit = PRODUCT_BATCH_SIZE;
  let productListSignature = "";
  let productPagingObserver = null;
  let catalogLoadRequest = 0;
  let searchLoadTimer = null;
  const selectedVariantSkuByEntry = new Map();

  function catalogRows() {
    const rows = typeof catalog === "function" ? catalog() : catalog;
    return Array.isArray(rows) ? rows : [];
  }

  function catalogCountRows() {
    const rows = typeof catalogIndex === "function" ? catalogIndex() : catalogIndex;
    return Array.isArray(rows) && rows.length ? rows : catalogRows();
  }

  function renderCatalogLoading() {
    if (!refs?.bagCatalogResults) return;
    refs.bagCatalogResults.innerHTML = `
      <div class="manufacturer-catalog-empty manufacturer-catalog-loading" role="status">
        <strong>${escapeHtml(t("bagCatalog.loading"))}</strong>
      </div>
    `;
  }

  async function loadCurrentCatalogAndRender() {
    const request = ++catalogLoadRequest;
    const loadingTimer = globalThis.setTimeout?.(() => {
      if (request === catalogLoadRequest) renderCatalogLoading();
    }, 120);
    try {
      await loadCatalog({ brand: manufacturer });
      if (request !== catalogLoadRequest) return false;
      render();
      return true;
    } catch (error) {
      if (request !== catalogLoadRequest) return false;
      refs.bagCatalogResults.innerHTML = `
        <div class="manufacturer-catalog-empty" role="alert">
          <strong>${escapeHtml(t("bagCatalog.loadError"))}</strong>
        </div>
      `;
      onCatalogLoadError(error);
      return false;
    } finally {
      if (loadingTimer != null) globalThis.clearTimeout?.(loadingTimer);
    }
  }

  function setImportAvailable(available) {
    if (!refs?.openBagCatalogBtn) return;
    refs.openBagCatalogBtn.hidden = !available;
    refs.openBagCatalogBtn.textContent = t("bagCatalog.open");
  }

  function resetNavigation() {
    catalogLoadRequest += 1;
    if (searchLoadTimer != null) globalThis.clearTimeout?.(searchLoadTimer);
    searchLoadTimer = null;
    family = "";
    category = "";
    manufacturer = "";
    query = "";
    selectingId = "";
    if (refs?.bagCatalogSearch) refs.bagCatalogSearch.value = "";
  }

  function cancelPendingCatalogLoad() {
    catalogLoadRequest += 1;
    if (searchLoadTimer != null) globalThis.clearTimeout?.(searchLoadTimer);
    searchLoadTimer = null;
  }

  function open() {
    if (!refs?.bagCatalogDialog) return;
    resetNavigation();
    render();
    openModalDialog(refs.bagCatalogDialog);
  }

  function render() {
    if (!refs?.bagCatalogResults) return;
    productPagingObserver?.disconnect?.();
    productPagingObserver = null;
    productPhotoLoadingBinding?.destroy?.();
    productPhotoLoadingBinding = null;
    photoGalleryBinding?.destroy?.();
    photoGalleryBinding = null;
    const hasQuery = Boolean(query.trim());
    refs.bagCatalogTitle.textContent = t("bagCatalog.title");
    refs.bagCatalogSearch.placeholder = t("bagCatalog.searchPlaceholder");
    refs.bagCatalogSearch.setAttribute("aria-label", t("bagCatalog.searchLabel"));
    refs.bagCatalogBackBtn.textContent = t("bagCatalog.back");
    refs.bagCatalogAdminNotice.hidden = !canEdit();
    refs.bagCatalogAdminNotice.textContent = t("bagCatalog.adminLocalNotice");
    refs.bagCatalogBackBtn.hidden = hasQuery || (!manufacturer && !family && !category);
    refs.bagCatalogPath.textContent = currentPath(hasQuery);
    renderBrandPicker();
    refs.bagCatalogResults.innerHTML = hasQuery
      ? renderProductList(filterManufacturerBagCatalog(catalogRows(), { brand: manufacturer, query }))
      : category
        ? renderProductList(filterManufacturerBagCatalog(catalogRows(), { brand: manufacturer, category, family }))
        : family
          ? renderCategoryList()
          : renderFamilyList();
    productPhotoLoadingBinding = bindManufacturerCatalogPhotoLoading(refs.bagCatalogResults);
    photoGalleryBinding = bindGalleries(refs.bagCatalogResults);
    bindProductPaging();
  }

  function currentPath(hasQuery = false) {
    const brandPrefix = manufacturer ? `${manufacturer} / ` : "";
    if (hasQuery) return `${brandPrefix}${t("bagCatalog.searchResults")}`;
    const familyEntry = families.find((entry) => entry.id === family);
    const categoryEntry = categories.find((entry) => entry.id === category);
    if (categoryEntry) return `${brandPrefix}${t(familyEntry?.labelKey || "")} / ${t(categoryEntry.labelKey)}`;
    if (familyEntry) return `${brandPrefix}${t(familyEntry.labelKey)}`;
    if (manufacturer) return manufacturer;
    return t("bagCatalog.chooseSection");
  }

  function renderBrandPicker() {
    if (!refs?.bagCatalogBrands) return;
    const scrollLeft = refs.bagCatalogBrands.scrollLeft;
    const activeBrands = brands.filter((entry) => entry.status === "active");
    const plannedBrands = brands.filter((entry) => entry.status === "planned");
    refs.bagCatalogBrands.setAttribute("aria-label", t("bagCatalog.brands.label"));
    refs.bagCatalogBrands.innerHTML = `
      <button class="manufacturer-brand-choice manufacturer-brand-choice-all ${manufacturer ? "" : "is-selected"}" type="button" data-bag-catalog-brand="all" aria-pressed="${manufacturer ? "false" : "true"}">
        <span>${escapeHtml(t("bagCatalog.brands.all"))}</span>
      </button>
      ${activeBrands.map((entry) => {
        const count = manufacturerBagCatalogCount(catalogCountRows(), { brand: entry.catalogBrand });
        const selected = manufacturer === entry.catalogBrand;
        return `
          <button class="manufacturer-brand-choice ${selected ? "is-selected" : ""}" type="button" data-bag-catalog-brand="${escapeHtml(entry.id)}" aria-pressed="${selected ? "true" : "false"}" aria-label="${escapeHtml(t("bagCatalog.brands.filter", { brand: entry.name, count }))}">
            ${renderManufacturerBrandMark({ brand: entry.catalogBrand, brands, escapeHtml })}
            <small>${escapeHtml(t("bagCatalog.models", { count }))}</small>
          </button>
        `;
      }).join("")}
      ${plannedBrands.map((entry) => `
        <span class="manufacturer-brand-choice is-planned" aria-label="${escapeHtml(t("bagCatalog.brands.plannedHelp", { brand: entry.name }))}">
          ${renderManufacturerBrandMark({ brand: entry.name, brands, escapeHtml })}
          <small>${escapeHtml(t("bagCatalog.brands.planned"))}</small>
        </span>
      `).join("")}
    `;
    refs.bagCatalogBrands.scrollLeft = scrollLeft;
  }

  function renderFamilyList() {
    return `
      <div class="manufacturer-catalog-sections">
        ${families.map((entry) => {
          const count = manufacturerBagCatalogCount(catalogCountRows(), { brand: manufacturer, family: entry.id });
          if (!count) return "";
          return `
            <button class="manufacturer-catalog-section" type="button" data-bag-catalog-family="${escapeHtml(entry.id)}">
              <span class="manufacturer-catalog-section-title">${escapeHtml(t(entry.labelKey))}</span>
              <span class="manufacturer-catalog-section-count">${escapeHtml(t("bagCatalog.models", { count }))}</span>
              <span class="manufacturer-catalog-section-description">${escapeHtml(t(entry.descriptionKey))}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderCategoryList() {
    const rows = categories.filter((entry) => entry.family === family
      && manufacturerBagCatalogCount(catalogCountRows(), { brand: manufacturer, family, category: entry.id }));
    return `
      <div class="manufacturer-catalog-sections manufacturer-catalog-categories">
        ${rows.map((entry) => {
          const count = manufacturerBagCatalogCount(catalogCountRows(), { brand: manufacturer, family, category: entry.id });
          const comparisonCount = manufacturerBagCatalogCount(catalogCountRows(), { family, category: entry.id });
          return `
            <article class="manufacturer-catalog-section manufacturer-catalog-category-section">
              <button class="manufacturer-catalog-category-open" type="button" data-bag-catalog-category="${escapeHtml(entry.id)}">
                <span class="manufacturer-catalog-section-title">${escapeHtml(t(entry.labelKey))}</span>
                <span class="manufacturer-catalog-section-count">${escapeHtml(t("bagCatalog.models", { count }))}</span>
                <span class="manufacturer-catalog-section-description">${escapeHtml(t(entry.descriptionKey))}</span>
              </button>
              <button class="ghost manufacturer-catalog-compare-button" type="button" data-bag-catalog-compare-category="${escapeHtml(entry.id)}" ${comparisonCount < 2 ? "disabled" : ""}>${escapeHtml(t("bagCatalog.compare.open"))}</button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderProductList(entries) {
    if (!entries.length) {
      return `
        <div class="manufacturer-catalog-empty">
          <strong>${escapeHtml(t("bagCatalog.emptyTitle"))}</strong>
          <span>${escapeHtml(t("bagCatalog.emptyText"))}</span>
        </div>
      `;
    }
    const signature = entries.map((entry) => entry.id).join("|");
    if (signature !== productListSignature) {
      productListSignature = signature;
      productLimit = PRODUCT_BATCH_SIZE;
    }
    const visibleEntries = entries.slice(0, productLimit);
    const remaining = Math.max(0, entries.length - visibleEntries.length);
    return `<div class="manufacturer-catalog-products">${visibleEntries.map(renderProductCard).join("")}</div>
      ${remaining ? `<button class="ghost manufacturer-catalog-load-more" type="button" data-bag-catalog-load-more>${escapeHtml(t("bagCatalog.models", { count: remaining }))} ↓</button>` : ""}`;
  }

  function loadNextProductBatch() {
    productLimit += PRODUCT_BATCH_SIZE;
    render();
  }

  function bindProductPaging() {
    const button = refs?.bagCatalogResults?.querySelector?.("[data-bag-catalog-load-more]");
    if (!button || typeof globalThis.IntersectionObserver !== "function") return;
    productPagingObserver = new globalThis.IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      productPagingObserver?.disconnect?.();
      loadNextProductBatch();
    }, { root: refs.bagCatalogResults, rootMargin: "120px 0px" });
    productPagingObserver.observe(button);
  }

  function renderProductCard(entry) {
    const variantChoices = manufacturerBagCatalogVariantChoices(entry);
    const selectedEntry = manufacturerBagCatalogVariantEntry(entry, selectedVariantSkuByEntry.get(entry.id));
    const volumeText = catalogMetricText(manufacturerBagCatalogVolumeMetrics(selectedEntry), t("bagCatalog.liters"), t);
    const weightText = catalogMetricText(manufacturerBagCatalogWeightMetrics(selectedEntry), t("bagCatalog.grams"), t);
    const loadText = selectedEntry.totalLoadKg && selectedEntry.loadPerBagKg
      ? t("bagCatalog.setTotalWithPerBag", {
          total: selectedEntry.totalLoadKg,
          perBag: selectedEntry.loadPerBagKg,
          quantity: selectedEntry.setQuantity,
          unit: t("bagCatalog.kilograms")
        })
      : selectedEntry.loadKg ? t("bagCatalog.load", { value: selectedEntry.loadKg }) : "";
    const dimensions = dimensionText(selectedEntry.dimensions);
    const locale = language() === "ru" ? "ru" : "en";
    const sourceUrl = safeCatalogUrl(entry.sourceUrl);
    const selecting = selectingId === entry.id;
    return `
      <article class="manufacturer-catalog-product">
        ${renderManufacturerCatalogPhotoGallery(entry, {
          className: "manufacturer-catalog-product-image",
          deferImages: true,
          escapeHtml,
          safeImageUrl: (value) => safeCatalogUrl(value, { localAsset: true }),
          t
        })}
        <div class="manufacturer-catalog-product-body">
          <div class="manufacturer-catalog-product-heading">
            <div>
              ${renderManufacturerBrandMark({ brand: entry.brand, brands, className: "manufacturer-catalog-brand", escapeHtml })}
              <h3>${escapeHtml(entry.name)}</h3>
            </div>
            ${selectedEntry.sku ? `<span class="manufacturer-catalog-sku" title="${escapeHtml(t("bagCatalog.field.skuHelp"))}" aria-label="${escapeHtml(`${t("bagCatalog.field.skuHelp")} ${selectedEntry.sku}`)}">${escapeHtml(selectedEntry.sku)}</span>` : ""}
          </div>
          <p class="manufacturer-catalog-variant">${escapeHtml(entry.variant)}</p>
          <p class="manufacturer-catalog-description">${escapeHtml(localizedDescription(entry, locale))}</p>
          ${variantChoices.length > 1 ? `
            <label class="manufacturer-catalog-variant-picker">
              <span>${escapeHtml(t("bagCatalog.variantPicker"))}</span>
              <select data-bag-catalog-variant-select="${escapeHtml(entry.id)}">
                ${variantChoices.map((variant) => {
                  const labelParts = [
                    variant.volume
                      ? catalogMetricText(manufacturerBagCatalogVolumeMetrics({ ...selectedEntry, volume: variant.volume }), t("bagCatalog.liters"), t)
                      : volumeText,
                    variant.mounting || "",
                    variant.setKind === "pair" ? t("bagCatalog.compare.pair") : "",
                    variant.available ? "" : t("bagCatalog.compare.unavailable")
                  ].filter(Boolean);
                  return `<option value="${escapeHtml(variant.sku)}" ${variant.sku === selectedEntry.sku ? "selected" : ""}>${escapeHtml(labelParts.join(" · ") || variant.title || variant.sku)}</option>`;
                }).join("")}
              </select>
            </label>
          ` : ""}
          <div class="manufacturer-catalog-specs">
            ${weightText ? `<span>${escapeHtml(weightText)}</span>` : ""}
            ${volumeText ? `<span>${escapeHtml(volumeText)}</span>` : ""}
            ${dimensions ? `<span>${escapeHtml(dimensions)} ${escapeHtml(t("bagCatalog.centimeters"))}${selectedEntry.specificationBasis === "per-bag" ? ` · ${escapeHtml(t("bagCatalog.perBag"))}` : ""}</span>` : ""}
            ${loadText ? `<span>${escapeHtml(loadText)}</span>` : ""}
            ${selectedEntry.waterproof ? `<span>${escapeHtml(selectedEntry.waterproof)}</span>` : ""}
            ${selectedEntry.mounting ? `<span>${escapeHtml(selectedEntry.mounting)}</span>` : ""}
          </div>
          <div class="manufacturer-catalog-product-actions">
            ${sourceUrl ? `<a class="ghost manufacturer-catalog-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("bagCatalog.source"))}</a>` : ""}
            ${canEdit() ? `<button class="ghost" type="button" data-bag-catalog-edit="${escapeHtml(entry.id)}" ${selectingId ? "disabled" : ""}>${escapeHtml(t("bagCatalog.edit"))}</button>` : ""}
            <button type="button" data-bag-catalog-select="${escapeHtml(entry.id)}" title="${escapeHtml(t("bagCatalog.useHelp"))}" aria-label="${escapeHtml(t("bagCatalog.useHelp"))}" ${selectingId ? "disabled" : ""}>${escapeHtml(selecting ? t("bagCatalog.copying") : t("bagCatalog.use"))}</button>
          </div>
        </div>
      </article>
    `;
  }

  function navigateBack() {
    if (selectingId) return;
    cancelPendingCatalogLoad();
    if (category) category = "";
    else family = "";
    if (!family && !category && manufacturer) manufacturer = "";
    render();
  }

  async function handleResultsClick(event) {
    const loadMoreButton = event.target.closest("[data-bag-catalog-load-more]");
    if (loadMoreButton) {
      loadNextProductBatch();
      return;
    }
    const familyButton = event.target.closest("[data-bag-catalog-family]");
    if (familyButton) {
      cancelPendingCatalogLoad();
      family = familyButton.dataset.bagCatalogFamily || "";
      category = "";
      render();
      return;
    }
    const categoryButton = event.target.closest("[data-bag-catalog-category]");
    if (categoryButton) {
      category = categoryButton.dataset.bagCatalogCategory || "";
      await loadCurrentCatalogAndRender();
      return;
    }
    const compareButton = event.target.closest("[data-bag-catalog-compare-category]");
    if (compareButton) {
      const comparisonCategory = compareButton.dataset.bagCatalogCompareCategory || "";
      await loadCatalog({ brand: "" }).then(
        () => onCompareCategory(comparisonCategory),
        onCatalogLoadError
      );
      return;
    }
    const editButton = event.target.closest("[data-bag-catalog-edit]");
    if (editButton && canEdit() && !selectingId) {
      openEditor(editButton.dataset.bagCatalogEdit);
      return;
    }
    const selectButton = event.target.closest("[data-bag-catalog-select]");
    if (!selectButton || selectingId) return;
    const catalogEntry = manufacturerBagCatalogEntry(catalogRows(), selectButton.dataset.bagCatalogSelect);
    if (!catalogEntry) return;
    const entry = manufacturerBagCatalogVariantEntry(catalogEntry, selectedVariantSkuByEntry.get(catalogEntry.id));
    selectingId = entry.id;
    render();
    try {
      await onSelect(entry);
      refs.bagCatalogDialog.close();
    } catch (error) {
      onSelectError(error, entry);
    } finally {
      selectingId = "";
      if (refs.bagCatalogDialog.open) render();
    }
  }

  async function handleBrandClick(event) {
    const button = event.target.closest("[data-bag-catalog-brand]");
    if (!button || selectingId) return;
    cancelPendingCatalogLoad();
    const requested = button.dataset.bagCatalogBrand || "all";
    const definition = brands.find((entry) => entry.id === requested && entry.status === "active");
    const nextManufacturer = requested === "all" || manufacturer === definition?.catalogBrand
      ? ""
      : String(definition?.catalogBrand || "");
    manufacturer = nextManufacturer;
    const keepsFamily = Boolean(family && manufacturerBagCatalogCount(catalogCountRows(), {
      brand: manufacturer,
      family
    }));
    const keepsCategory = Boolean(keepsFamily && category && manufacturerBagCatalogCount(catalogCountRows(), {
      brand: manufacturer,
      family,
      category
    }));
    if (!keepsFamily) family = "";
    if (!keepsCategory) category = "";
    query = "";
    if (refs?.bagCatalogSearch) refs.bagCatalogSearch.value = "";
    if (category) await loadCurrentCatalogAndRender();
    else render();
  }

  function openEditor(id) {
    const entry = manufacturerBagCatalogEntry(catalogRows(), id);
    if (!entry || !refs?.bagCatalogEditDialog) return;
    editingId = entry.id;
    refs.bagCatalogEditTitle.textContent = t("bagCatalog.editTitle");
    refs.bagCatalogEditLocalNotice.textContent = t("bagCatalog.adminLocalNotice");
    refs.bagCatalogEditName.value = entry.name || "";
    refs.bagCatalogEditVariant.value = entry.variant || "";
    refs.bagCatalogEditSku.value = entry.sku || "";
    refs.bagCatalogEditWeight.value = Number(entry.weight || 0);
    refs.bagCatalogEditVolume.value = Number(entry.volume || 0);
    refs.bagCatalogEditLoad.value = Number(entry.loadKg || 0);
    refs.bagCatalogEditWidth.value = Number(entry.dimensions?.width || 0);
    refs.bagCatalogEditHeight.value = Number(entry.dimensions?.height || 0);
    refs.bagCatalogEditDepth.value = Number(entry.dimensions?.depth || 0);
    refs.bagCatalogEditColor.value = entry.color || "";
    refs.bagCatalogEditWaterproof.value = entry.waterproof || "";
    refs.bagCatalogEditMaterial.value = entry.material || "";
    refs.bagCatalogEditMounting.value = entry.mounting || "";
    refs.bagCatalogEditDescriptionRu.value = entry.description?.ru || "";
    refs.bagCatalogEditDescriptionEn.value = entry.description?.en || "";
    refs.bagCatalogEditImageUrl.value = entry.imageUrl || "";
    refs.bagCatalogEditSourceUrl.value = entry.sourceUrl || "";
    refs.bagCatalogEditSaveBtn.textContent = t("bagCatalog.saveChanges");
    applyEditorLabels();
    openModalDialog(refs.bagCatalogEditDialog);
  }

  function applyEditorLabels() {
    const labels = [
      [refs.bagCatalogEditName, "bagCatalog.field.name"],
      [refs.bagCatalogEditVariant, "bagCatalog.field.variant"],
      [refs.bagCatalogEditSku, "bagCatalog.field.sku"],
      [refs.bagCatalogEditWeight, "bagCatalog.field.weight"],
      [refs.bagCatalogEditVolume, "bagCatalog.field.volume"],
      [refs.bagCatalogEditLoad, "bagCatalog.field.load"],
      [refs.bagCatalogEditWidth, "bagCatalog.field.width"],
      [refs.bagCatalogEditHeight, "bagCatalog.field.height"],
      [refs.bagCatalogEditDepth, "bagCatalog.field.depth"],
      [refs.bagCatalogEditColor, "bagCatalog.field.color"],
      [refs.bagCatalogEditWaterproof, "bagCatalog.field.waterproof"],
      [refs.bagCatalogEditMaterial, "bagCatalog.field.material"],
      [refs.bagCatalogEditMounting, "bagCatalog.field.mounting"],
      [refs.bagCatalogEditDescriptionRu, "bagCatalog.field.descriptionRu"],
      [refs.bagCatalogEditDescriptionEn, "bagCatalog.field.descriptionEn"],
      [refs.bagCatalogEditImageUrl, "bagCatalog.field.imageUrl"],
      [refs.bagCatalogEditSourceUrl, "bagCatalog.field.sourceUrl"]
    ];
    labels.forEach(([input, key]) => {
      const text = input?.closest?.("label")?.querySelector?.(".bag-catalog-edit-label");
      if (text) text.textContent = t(key);
    });
  }

  function saveEditor(event) {
    event.preventDefault();
    if (!editingId || !canEdit()) return;
    const number = (input) => Math.max(0, Number(String(input?.value || "0").replace(",", ".")) || 0);
    onUpdate({
      id: editingId,
      name: refs.bagCatalogEditName.value,
      variant: refs.bagCatalogEditVariant.value,
      sku: refs.bagCatalogEditSku.value,
      weight: number(refs.bagCatalogEditWeight),
      volume: number(refs.bagCatalogEditVolume),
      loadKg: number(refs.bagCatalogEditLoad),
      dimensions: {
        width: number(refs.bagCatalogEditWidth),
        height: number(refs.bagCatalogEditHeight),
        depth: number(refs.bagCatalogEditDepth)
      },
      color: refs.bagCatalogEditColor.value,
      waterproof: refs.bagCatalogEditWaterproof.value,
      material: refs.bagCatalogEditMaterial.value,
      mounting: refs.bagCatalogEditMounting.value,
      description: {
        ru: refs.bagCatalogEditDescriptionRu.value,
        en: refs.bagCatalogEditDescriptionEn.value
      },
      imageUrl: refs.bagCatalogEditImageUrl.value,
      sourceUrl: refs.bagCatalogEditSourceUrl.value
    });
    refs.bagCatalogEditDialog.close();
    editingId = "";
    render();
  }

  if (bindOpenButton) refs?.openBagCatalogBtn?.addEventListener("click", open);
  refs?.bagCatalogBackBtn?.addEventListener("click", navigateBack);
  refs?.bagCatalogSearch?.addEventListener("input", () => {
    cancelPendingCatalogLoad();
    query = refs.bagCatalogSearch.value || "";
    if (!query.trim()) {
      render();
      return;
    }
    searchLoadTimer = globalThis.setTimeout?.(() => {
      searchLoadTimer = null;
      loadCurrentCatalogAndRender();
    }, 180);
  });
  refs?.bagCatalogResults?.addEventListener("change", (event) => {
    const select = event.target.closest("[data-bag-catalog-variant-select]");
    if (!select || selectingId) return;
    selectedVariantSkuByEntry.set(select.dataset.bagCatalogVariantSelect || "", select.value || "");
    render();
  });
  refs?.bagCatalogResults?.addEventListener("click", handleResultsClick);
  refs?.bagCatalogBrands?.addEventListener("click", handleBrandClick);
  bindHorizontalTouchScroll(refs?.bagCatalogBrands);
  refs?.bagCatalogEditForm?.addEventListener("submit", saveEditor);

  return { open, render, resetNavigation, setImportAvailable };
}
