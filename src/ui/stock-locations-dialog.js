import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";
import { itemStockLocations, normalizeStockLocations } from "../state/item-stock.js";

const text = (en, ru) => currentDocumentLanguage() === "en" ? en : ru;

export function createStockLocationsDialog({ openDialog, getLocations, canAddLocations = () => true }) {
  let dialog;
  let rows = [];
  let save;
  let itemName = "";

  const read = () => [...dialog.querySelectorAll("[data-stock-location-row]")].map((row) => ({
    location: row.querySelector("[data-stock-location-name]").value.trim(),
    quantity: row.querySelector("[data-stock-location-quantity]").value
  }));
  function updateTotal() {
    const values = normalizeStockLocations(read());
    dialog.querySelector("[data-stock-total]").textContent = values
      ? String(values.reduce((sum, row) => sum + row.quantity, 0)) : "—";
    dialog.querySelectorAll("[data-stock-location-row]").forEach((row) => {
      const quantity = Number(row.querySelector("[data-stock-location-quantity]").value);
      row.querySelector("[data-stock-remove]").disabled = quantity !== 0 || rows.length === 1;
    });
  }
  function validRows() {
    for (const input of dialog.querySelectorAll("[data-stock-location-quantity]")) if (!input.reportValidity()) return null;
    const values = normalizeStockLocations(read());
    if (!values) dialog.querySelector("[data-stock-error]").textContent = text("Check the quantities and total.", "Проверьте количества и общий остаток.");
    return values;
  }
  function render() {
    const labels = new Map(getLocations());
    const options = [...new Set(["", ...labels.keys(), ...rows.map((row) => row.location)])];
    dialog.innerHTML = `<form method="dialog" class="dialog-card stock-locations-dialog-card">
      <header><h2>${text("Stock by storage place", "Запасы по местам хранения")}</h2><button type="button" class="icon-button" data-stock-cancel aria-label="${text("Close", "Закрыть")}">×</button></header>
      <p class="stock-item-name">${escapeHtml(itemName)}</p>
      <p class="stock-locations-total">${text("Total available", "Всего в наличии")}: <strong data-stock-total></strong> ${text("pcs.", "шт.")}</p>
      <div class="stock-location-rows">${rows.map((row, index) => `<div class="stock-location-row" data-stock-location-row>
        <label>${text("Storage place", "Место хранения")}<select data-stock-location-name>${options.map((location) => `<option value="${escapeHtml(location)}"${location === row.location ? " selected" : ""}>${escapeHtml(labels.get(location) || location || text("Not specified", "Не указано"))}</option>`).join("")}</select></label>
        <div class="stock-location-quantity"><span>${text("Available, pcs.", "В наличии, шт.")}</span><div class="quantity-stepper">
          <button type="button" class="ghost" data-stock-delta="-1" data-row="${index}" aria-label="${text("Decrease stock", "Уменьшить остаток")}">−</button>
          <input data-stock-location-quantity type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" required value="${row.quantity}" aria-label="${text("Available, pcs.", "В наличии, шт.")}" />
          <button type="button" class="ghost" data-stock-delta="1" data-row="${index}" aria-label="${text("Increase stock", "Увеличить остаток")}">+</button>
        </div></div>
        <button type="button" class="ghost stock-remove" data-stock-remove="${index}" title="${text("Only an empty place can be removed", "Можно убрать только место с нулевым остатком")}" aria-label="${text("Remove storage place", "Убрать место хранения")}">×</button>
      </div>`).join("")}</div>
      <button type="button" class="ghost" data-stock-add>${text("+ Add storage place", "+ Добавить место хранения")}</button>
      <p data-stock-error role="alert"></p>
      <footer><button type="button" data-stock-cancel class="ghost">${text("Cancel", "Отмена")}</button><button type="submit" formnovalidate data-stock-save>${text("Save", "Сохранить")}</button></footer>
    </form>`;
    dialog.querySelectorAll("[data-stock-location-name], [data-stock-location-quantity]").forEach((input) => input.addEventListener("input", updateTotal));
    dialog.querySelectorAll("[data-stock-delta]").forEach((button) => button.addEventListener("click", () => {
      const values = read();
      const row = values[Number(button.dataset.row)];
      const next = Number(row.quantity) + Number(button.dataset.stockDelta);
      if (!Number.isSafeInteger(next) || next < 0) return;
      row.quantity = next;
      if (!normalizeStockLocations(values)) return;
      rows = values;
      render();
    }));
    dialog.querySelector("[data-stock-add]").addEventListener("click", () => {
      if (!validRows()) return;
      rows = read();
      rows.push({ location: "", quantity: 0 });
      render();
      dialog.querySelectorAll("[data-stock-location-name]")[rows.length - 1].focus();
    });
    dialog.querySelectorAll("[data-stock-remove]").forEach((button) => button.addEventListener("click", () => {
      if (!validRows()) return;
      rows = read().filter((_, index) => index !== Number(button.dataset.stockRemove));
      render();
    }));
    dialog.querySelectorAll("[data-stock-cancel]").forEach((button) => button.addEventListener("click", () => dialog.close("cancel")));
    dialog.querySelector("form").addEventListener("submit", (event) => {
      event.preventDefault();
      const values = validRows();
      if (!values || !canAddLocations(values.map((row) => row.location))) return;
      if (save(values) !== false) dialog.close("saved");
    });
    updateTotal();
  }
  return {
    open(item, onSave) {
      if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "stockLocationsDialog"; document.body.append(dialog); }
      rows = itemStockLocations(item);
      itemName = item.name || "";
      save = onSave;
      render();
      openDialog(dialog);
    }
  };
}
