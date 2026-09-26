import { escapeHtml } from "../utils/html.js";
import { itemStockQuantity, itemStockLocations } from "../state/item-stock.js";
import { PREPARATION_ACTIONS } from "../state/layout-preparation.js";

export function renderPreparationButtons(tasks, t) {
  return `<div class="preparation-actions" aria-label="${escapeHtml(t("preparation.title"))}">
    ${PREPARATION_ACTIONS.map((action) => `<button type="button" class="ghost preparation-action preparation-${action} ${tasks[action].length ? "has-tasks" : ""}" data-preparation-action="${action}">
      <span>${escapeHtml(t(`preparation.${action}`))}</span><strong>${tasks[action].length}</strong>
    </button>`).join("")}
    <small>${escapeHtml(t("preparation.countHint"))}</small>
  </div>`;
}

export function renderPreparationBadges({ missing = 0, buyHint = "", repair = false, charge = false }, t) {
  return `<div class="preparation-badges">${[
    missing > 0 ? `<span class="preparation-badge preparation-buy"${buyHint ? ` title="${escapeHtml(buyHint)}" aria-label="${escapeHtml(buyHint)}"` : ""}>${escapeHtml(t("preparation.missing", { count: missing }))}</span>` : "",
    repair ? `<span class="preparation-badge preparation-repair">${escapeHtml(t("preparation.repair"))}</span>` : "",
    charge ? `<span class="preparation-badge preparation-charge">${escapeHtml(t("preparation.charge"))}</span>` : ""
  ].join("")}</div>`;
}

export function renderStockControl(item, t) {
  const count = itemStockQuantity(item);
  const rows = itemStockLocations(item);
  if (rows.length > 1) return `<div class="item-stock-control"><span>${escapeHtml(t("stock.available"))}</span><button type="button" class="ghost stock-by-place-button" data-stock-locations="${escapeHtml(item.id)}" title="${escapeHtml(rows.map((row) => `${row.location || t("stock.unspecified")}: ${row.quantity}`).join("\n"))}"><strong>${count}</strong><span>${escapeHtml(t("stock.byPlace"))}</span></button></div>`;
  return `<div class="item-stock-control">
    <span>${escapeHtml(t("stock.available"))}</span>
    <div class="quantity-stepper">
      <button type="button" class="ghost" data-stock-step="-1" data-stock-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(t("stock.decrease"))}" ${count === 0 ? "disabled" : ""}>−</button>
      <input type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" data-stock-input="${escapeHtml(item.id)}" value="${count}" aria-label="${escapeHtml(t("stock.available"))}" />
      <button type="button" class="ghost" data-stock-step="1" data-stock-item="${escapeHtml(item.id)}" aria-label="${escapeHtml(t("stock.increase"))}">+</button>
    </div>
  </div>`;
}

export function createPreparationDialogController({ getContext, openDialog, openItem, purchase, renderThumbnail, hydratePhotos, t }) {
  let dialog;
  let activeAction = "buy";
  let layoutId = "";

  function refresh() {
    if (!dialog?.open) return;
    const context = getContext();
    if (!context || context.layout.id !== layoutId) {
      dialog.close();
      return;
    }
    const rows = context.tasks[activeAction];
    dialog.querySelector("[data-preparation-title]").textContent = `${t(`preparation.${activeAction}`)} · ${rows.length}`;
    dialog.querySelector("[data-preparation-layout]").textContent = context.layout.name;
    dialog.querySelector("[data-preparation-list]").innerHTML = rows.length ? rows.map(({ item, required, available, missing }) => `
      <article class="preparation-row" data-preparation-item="${escapeHtml(item.id)}">
        <button type="button" class="add-item-result with-thumbnail preparation-item-name" data-preparation-edit="${escapeHtml(item.id)}">
          ${renderThumbnail(item)}
          <span class="picker-list-result-copy"><strong>${escapeHtml(item.name)}</strong></span>
        </button>
        ${activeAction === "buy" ? `
          <div class="preparation-quantities">
            <span>${escapeHtml(t("preparation.required"))}<strong>${required}</strong></span>
            <span>${escapeHtml(t("stock.available"))}<strong>${available}</strong></span>
            <span class="preparation-shortage">${escapeHtml(t("preparation.buy"))}<strong>${missing}</strong></span>
          </div>
          <form class="preparation-purchase" data-purchase-item="${escapeHtml(item.id)}">
            <label>${escapeHtml(t("stock.storePurchase"))}<select data-purchase-location>${purchaseLocationOptions(item, context.locations || [], t)}</select></label>
            <label>${escapeHtml(t("preparation.purchasedCount"))}<input type="number" min="1" max="${Number.MAX_SAFE_INTEGER - available}" step="1" inputmode="numeric" value="${missing}" required /></label>
            <button type="submit">${escapeHtml(t("preparation.purchased"))}</button>
          </form>` : `<small>${escapeHtml(t("preparation.editHint"))}</small>`}
      </article>`).join("") : `<p class="preparation-empty" role="status">${escapeHtml(t(`preparation.empty.${activeAction}`))}</p>`;
    hydratePhotos(dialog.querySelector("[data-preparation-list]"));
    dialog.querySelectorAll("[data-preparation-edit]").forEach((button) => button.addEventListener("click", () => {
      openItem(button.dataset.preparationEdit);
    }));
    dialog.querySelectorAll("[data-purchase-item]").forEach((form) => form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('[type="submit"]');
      if (submit.disabled) return;
      submit.disabled = true;
      try { await purchase(form.dataset.purchaseItem, form.querySelector("input").value, layoutId, form.querySelector("[data-purchase-location]").value); }
      finally { submit.disabled = false; }
    }));
  }

  function open(action) {
    const context = getContext();
    if (!context || !PREPARATION_ACTIONS.includes(action)) return;
    activeAction = action;
    layoutId = context.layout.id;
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "preparationDialog";
      dialog.setAttribute("aria-labelledby", "preparationDialogTitle");
      dialog.innerHTML = `<div class="dialog-card preparation-dialog-card">
        <header><h2 id="preparationDialogTitle" data-preparation-title></h2><button type="button" class="dialog-close-button" data-preparation-close>×</button></header>
        <p class="preparation-layout-name" data-preparation-layout></p>
        <div class="preparation-list" data-preparation-list></div>
      </div>`;
      document.body.append(dialog);
      dialog.querySelector("[data-preparation-close]").addEventListener("click", () => dialog.close());
    }
    dialog.querySelector("[data-preparation-close]").setAttribute("aria-label", t("buttons.close"));
    openDialog(dialog);
    refresh();
    dialog.querySelector("[data-preparation-close]").focus();
  }

  return { open, refresh };
}

export function bindStockField(refs, onChange) {
  const input = refs.itemStockQuantity;
  const minus = refs.itemStockMinus;
  const plus = refs.itemStockPlus;
  if (!input || input.dataset.stockBound) return;
  input.dataset.stockBound = "true";
  const update = (delta = 0) => {
    if (input.readOnly || input.disabled) return;
    input.value = Math.max(0, itemStockQuantity({ stockQuantity: input.value }) + delta);
    minus.disabled = Number(input.value) === 0 || input.disabled;
    onChange();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  minus.addEventListener("click", () => update(-1));
  plus.addEventListener("click", () => update(1));
  input.addEventListener("change", () => update());
  input.addEventListener("input", () => { minus.disabled = Number(input.value) === 0 || input.disabled; });
}

function purchaseLocationOptions(item, locations, t) {
  const labels = new Map(locations);
  const own = itemStockLocations(item).map((row) => row.location);
  return [...new Set([...own, ...labels.keys()])].map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(labels.get(location) || location || t("stock.unspecified"))}</option>`).join("");
}
