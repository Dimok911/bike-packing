import {
  filterManufacturerBagCatalog,
  manufacturerBagCatalogCount,
  manufacturerBagCatalogEntry
} from "../state/manufacturer-bag-catalog.js";

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
  canEdit = () => false,
  catalog = [],
  categories = [],
  escapeHtml = (value) => String(value || ""),
  families = [],
  language = () => "en",
  onSelect = async () => {},
  onSelectError = () => {},
  onUpdate = () => {},
  openModalDialog = (dialog) => dialog?.showModal?.(),
  refs,
  t = (key) => key
} = {}) {
  let family = "";
  let category = "";
  let query = "";
  let editingId = "";
  let selectingId = "";

  function catalogRows() {
    const rows = typeof catalog === "function" ? catalog() : catalog;
    return Array.isArray(rows) ? rows : [];
  }

  function setImportAvailable(available) {
    if (!refs?.openBagCatalogBtn) return;
    refs.openBagCatalogBtn.hidden = !available;
    refs.openBagCatalogBtn.textContent = t("bagCatalog.open");
  }

  function resetNavigation() {
    family = "";
    category = "";
    query = "";
    selectingId = "";
    if (refs?.bagCatalogSearch) refs.bagCatalogSearch.value = "";
  }

  function open() {
    if (!refs?.bagCatalogDialog) return;
    resetNavigation();
    render();
    openModalDialog(refs.bagCatalogDialog);
  }

  function render() {
    if (!refs?.bagCatalogResults) return;
    const hasQuery = Boolean(query.trim());
    refs.bagCatalogTitle.textContent = t("bagCatalog.title");
    refs.bagCatalogSearch.placeholder = t("bagCatalog.searchPlaceholder");
    refs.bagCatalogSearch.setAttribute("aria-label", t("bagCatalog.searchLabel"));
    refs.bagCatalogBackBtn.textContent = t("bagCatalog.back");
    refs.bagCatalogAdminNotice.hidden = !canEdit();
    refs.bagCatalogAdminNotice.textContent = t("bagCatalog.adminLocalNotice");
    refs.bagCatalogBackBtn.hidden = hasQuery || (!family && !category);
    refs.bagCatalogPath.textContent = currentPath(hasQuery);
    refs.bagCatalogResults.innerHTML = hasQuery
      ? renderProductList(filterManufacturerBagCatalog(catalogRows(), { query }))
      : category
        ? renderProductList(filterManufacturerBagCatalog(catalogRows(), { category, family }))
        : family === "bikepacking"
          ? renderCategoryList()
          : family === "panniers"
            ? renderProductList(filterManufacturerBagCatalog(catalogRows(), { family }))
            : renderFamilyList();
  }

  function currentPath(hasQuery = false) {
    if (hasQuery) return t("bagCatalog.searchResults");
    const familyEntry = families.find((entry) => entry.id === family);
    const categoryEntry = categories.find((entry) => entry.id === category);
    if (categoryEntry) return `${t(familyEntry?.labelKey || "")} / ${t(categoryEntry.labelKey)}`;
    if (familyEntry) return t(familyEntry.labelKey);
    return t("bagCatalog.chooseSection");
  }

  function renderFamilyList() {
    return `
      <div class="manufacturer-catalog-sections">
        ${families.map((entry) => {
          const count = manufacturerBagCatalogCount(catalogRows(), { family: entry.id });
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
    const rows = categories.filter((entry) => entry.family === family);
    return `
      <div class="manufacturer-catalog-sections manufacturer-catalog-categories">
        ${rows.map((entry) => {
          const count = manufacturerBagCatalogCount(catalogRows(), { family, category: entry.id });
          return `
            <button class="manufacturer-catalog-section" type="button" data-bag-catalog-category="${escapeHtml(entry.id)}">
              <span class="manufacturer-catalog-section-title">${escapeHtml(t(entry.labelKey))}</span>
              <span class="manufacturer-catalog-section-count">${escapeHtml(t("bagCatalog.models", { count }))}</span>
              <span class="manufacturer-catalog-section-description">${escapeHtml(t(entry.descriptionKey))}</span>
            </button>
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
    return `<div class="manufacturer-catalog-products">${entries.map(renderProductCard).join("")}</div>`;
  }

  function renderProductCard(entry) {
    const dimensions = dimensionText(entry.dimensions);
    const locale = language() === "ru" ? "ru" : "en";
    const sourceUrl = safeCatalogUrl(entry.sourceUrl);
    const imageUrl = safeCatalogUrl(entry.imageUrl, { localAsset: true });
    const selecting = selectingId === entry.id;
    return `
      <article class="manufacturer-catalog-product">
        ${sourceUrl
          ? `<a class="manufacturer-catalog-product-image" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${entry.brand} ${entry.name}`)}" loading="lazy" />` : ""}</a>`
          : `<div class="manufacturer-catalog-product-image">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(`${entry.brand} ${entry.name}`)}" loading="lazy" />` : ""}</div>`}
        <div class="manufacturer-catalog-product-body">
          <div class="manufacturer-catalog-product-heading">
            <div>
              <span class="manufacturer-catalog-brand">${escapeHtml(entry.brand)}</span>
              <h3>${escapeHtml(entry.name)}</h3>
            </div>
            <span class="manufacturer-catalog-sku">${escapeHtml(entry.sku)}</span>
          </div>
          <p class="manufacturer-catalog-variant">${escapeHtml(entry.variant)}</p>
          <p class="manufacturer-catalog-description">${escapeHtml(localizedDescription(entry, locale))}</p>
          <div class="manufacturer-catalog-specs">
            <span>${escapeHtml(entry.weight)} ${escapeHtml(t("bagCatalog.grams"))}</span>
            <span>${escapeHtml(entry.volume)} ${escapeHtml(t("bagCatalog.liters"))}</span>
            ${dimensions ? `<span>${escapeHtml(dimensions)} ${escapeHtml(t("bagCatalog.centimeters"))}</span>` : ""}
            ${entry.loadKg ? `<span>${escapeHtml(t("bagCatalog.load", { value: entry.loadKg }))}</span>` : ""}
            ${entry.waterproof ? `<span>${escapeHtml(entry.waterproof)}</span>` : ""}
            ${entry.mounting ? `<span>${escapeHtml(entry.mounting)}</span>` : ""}
          </div>
          <div class="manufacturer-catalog-product-actions">
            ${sourceUrl ? `<a class="ghost manufacturer-catalog-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("bagCatalog.source"))}</a>` : ""}
            ${canEdit() ? `<button class="ghost" type="button" data-bag-catalog-edit="${escapeHtml(entry.id)}" ${selectingId ? "disabled" : ""}>${escapeHtml(t("bagCatalog.edit"))}</button>` : ""}
            <button type="button" data-bag-catalog-select="${escapeHtml(entry.id)}" ${selectingId ? "disabled" : ""}>${escapeHtml(selecting ? t("bagCatalog.copying") : t("bagCatalog.use"))}</button>
          </div>
        </div>
      </article>
    `;
  }

  function navigateBack() {
    if (selectingId) return;
    if (category) category = "";
    else family = "";
    render();
  }

  async function handleResultsClick(event) {
    const familyButton = event.target.closest("[data-bag-catalog-family]");
    if (familyButton) {
      family = familyButton.dataset.bagCatalogFamily || "";
      category = "";
      render();
      return;
    }
    const categoryButton = event.target.closest("[data-bag-catalog-category]");
    if (categoryButton) {
      category = categoryButton.dataset.bagCatalogCategory || "";
      render();
      return;
    }
    const editButton = event.target.closest("[data-bag-catalog-edit]");
    if (editButton && canEdit() && !selectingId) {
      openEditor(editButton.dataset.bagCatalogEdit);
      return;
    }
    const selectButton = event.target.closest("[data-bag-catalog-select]");
    if (!selectButton || selectingId) return;
    const entry = manufacturerBagCatalogEntry(catalogRows(), selectButton.dataset.bagCatalogSelect);
    if (!entry) return;
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

  refs?.openBagCatalogBtn?.addEventListener("click", open);
  refs?.bagCatalogBackBtn?.addEventListener("click", navigateBack);
  refs?.bagCatalogSearch?.addEventListener("input", () => {
    query = refs.bagCatalogSearch.value || "";
    render();
  });
  refs?.bagCatalogResults?.addEventListener("click", handleResultsClick);
  refs?.bagCatalogEditForm?.addEventListener("submit", saveEditor);

  return { open, render, resetNavigation, setImportAvailable };
}
