import { escapeHtml } from "../utils/html.js";
import { currentDocumentLanguage } from "../utils/language.js";
import { itemStockLocations, normalizeStockLocations, moveItemStock } from "../state/item-stock.js";

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
    const current = read();
    dialog.querySelectorAll("[data-stock-from] option, [data-stock-to] option").forEach((option) => {
      option.textContent = current[Number(option.value)].location || text("Not specified", "Не указано");
    });
  }
  function validRows() {
    for (const input of dialog.querySelectorAll("[data-stock-location-quantity]")) if (!input.reportValidity()) return null;
    const values = normalizeStockLocations(read());
    if (!values) dialog.querySelector("[data-stock-error]").textContent = text("Check the quantities and total.", "Проверьте количества и общий остаток.");
    return values;
  }
  function render() {
    const options = [...new Set([...getLocations(), ...rows.map((row) => row.location)])].filter(Boolean);
    dialog.innerHTML = `<form method="dialog" class="dialog-card stock-locations-dialog-card">
      <header><h2>${text("Stock by storage place", "Запасы по местам хранения")}</h2><button type="button" class="icon-button" data-stock-cancel aria-label="${text("Close", "Закрыть")}">×</button></header>
      <p class="stock-item-name">${escapeHtml(itemName)}</p>
      <p class="stock-locations-total">${text("Total available", "Всего в наличии")}: <strong data-stock-total></strong> ${text("pcs.", "шт.")}</p>
      <datalist id="stockLocationOptions">${options.map((location) => `<option value="${escapeHtml(location)}"></option>`).join("")}</datalist>
      <div class="stock-location-rows">${rows.map((row, index) => `<div class="stock-location-row" data-stock-location-row>
        <label>${text("Storage place", "Место хранения")}<input data-stock-location-name list="stockLocationOptions" value="${escapeHtml(row.location)}" placeholder="${text("Not specified", "Не указано")}" /></label>
        <div class="stock-location-quantity"><span>${text("Available, pcs.", "В наличии, шт.")}</span><div class="quantity-stepper">
          <button type="button" class="ghost" data-stock-delta="-1" data-row="${index}" aria-label="${text("Decrease stock", "Уменьшить остаток")}">−</button>
          <input data-stock-location-quantity type="number" min="0" max="9007199254740991" step="1" inputmode="numeric" required value="${row.quantity}" aria-label="${text("Available, pcs.", "В наличии, шт.")}" />
          <button type="button" class="ghost" data-stock-delta="1" data-row="${index}" aria-label="${text("Increase stock", "Увеличить остаток")}">+</button>
        </div></div>
        <button type="button" class="ghost stock-remove" data-stock-remove="${index}" title="${text("Only an empty place can be removed", "Можно убрать только место с нулевым остатком")}" aria-label="${text("Remove storage place", "Убрать место хранения")}">×</button>
      </div>`).join("")}</div>
      <button type="button" class="ghost" data-stock-add>${text("+ Add storage place", "+ Добавить место хранения")}</button>
      ${rows.length > 1 ? `<fieldset class="stock-transfer"><legend>${text("Move between places", "Переместить между местами")}</legend>
        <label>${text("From", "Откуда")}<select data-stock-from>${rows.map((row, index) => `<option value="${index}">${escapeHtml(row.location || text("Not specified", "Не указано"))}</option>`).join("")}</select></label>
        <label>${text("To", "Куда")}<select data-stock-to>${rows.map((row, index) => `<option value="${index}" ${index === 1 ? "selected" : ""}>${escapeHtml(row.location || text("Not specified", "Не указано"))}</option>`).join("")}</select></label>
        <label>${text("Quantity", "Количество")}<input data-stock-move-count type="number" min="1" max="9007199254740991" step="1" value="1" inputmode="numeric" /></label>
        <button type="button" class="ghost" data-stock-move>${text("Move", "Переместить")}</button>
      </fieldset>` : ""}
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
    dialog.querySelector("[data-stock-move]")?.addEventListener("click", () => {
      if (!validRows()) return;
      const values = read();
      const item = { stockLocations: values };
      const from = values[Number(dialog.querySelector("[data-stock-from]").value)].location;
      const to = values[Number(dialog.querySelector("[data-stock-to]").value)].location;
      const count = dialog.querySelector("[data-stock-move-count]");
      if (!count.reportValidity()) return;
      if (!moveItemStock(item, from, to, count.value)) {
        dialog.querySelector("[data-stock-error]").textContent = text("Choose different places and an amount available at the source.", "Выберите разные места и количество, которое есть в исходном месте.");
        return;
      }
      rows = item.stockLocations;
      render();
    });
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
