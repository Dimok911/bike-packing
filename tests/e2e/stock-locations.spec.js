import { test, expect } from "@playwright/test";
import { createGuestWorkspace, createEmptyLayout, openApp, prepareIsolatedRussianGuest, waitForApp } from "./guest-test-helpers.js";

test("split stock, transfer, cancellation, location filters and destination purchases survive reload", async ({ page, isMobile }) => {
  await prepareIsolatedRussianGuest(page);
  const activate = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    if (isMobile) await locator.tap();
    else await locator.click();
  };
  let item;
  if (isMobile) {
    await openApp(page);
    await createEmptyLayout(page, "Поход");
    // Seed a saved workspace so this WebKit case is scoped to inventory controls.
    await page.evaluate(() => {
      const key = "bike-packing-prototype-state-v1";
      const state = JSON.parse(localStorage.getItem(key));
      const layout = Object.values(state.layouts).find((entry) => entry.name === "Поход");
      state.containers.stockBag = { id: "stockBag", name: "Еда", parentId: null, itemIds: ["stockItem"], childIds: [], order: [{ type: "item", id: "stockItem" }], weight: 0, location: "Дом" };
      state.items.stockItem = { id: "stockItem", name: "Каша", containerId: "stockBag", quantity: 6, weight: 0, stockQuantity: 1, location: "Дом", categories: [] };
      layout.rootContainerIds = ["stockBag"];
      layout.arrangement = { rootContainerIds: ["stockBag"], containers: { stockBag: { itemIds: ["stockItem"], childIds: [], order: [{ type: "item", id: "stockItem" }] } }, items: { stockItem: "stockBag" }, itemQuantities: { stockItem: 6 } };
      localStorage.setItem(key, JSON.stringify(state));
    });
    await page.reload();
    await waitForApp(page);
    item = page.locator('#packingView [data-item-id="stockItem"]');
    await expect(item).toHaveCount(1);
  } else {
    ({ item } = await createGuestWorkspace(page, { layoutName: "Поход", containerName: "Еда", itemName: "Каша", quantity: "6" }));
  }
  await activate(item.locator(".item-title-hitarea"));
  await page.locator("#itemStockQuantity").fill("4");
  await activate(page.locator("#itemStockLocationsBtn"));
  const dialog = page.locator("#stockLocationsDialog");
  const names = dialog.locator("[data-stock-location-name]");
  const quantities = dialog.locator("[data-stock-location-quantity]");
  await names.first().fill("Дом");
  await activate(dialog.locator("[data-stock-add]"));
  await names.nth(1).fill("Дача");
  await dialog.locator("[data-stock-move-count]").fill("2");
  await activate(dialog.locator("[data-stock-move]"));
  await expect(quantities.first()).toHaveValue("2");
  await expect(quantities.nth(1)).toHaveValue("2");
  await expect(dialog.locator("[data-stock-total]")).toHaveText("4");
  await activate(dialog.locator("[data-stock-save]"));
  await expect(dialog).not.toBeVisible();
  await expect(page.locator("#itemStockLocationsSummary")).toHaveText("Дом: 2 · Дача: 2");
  await expect(page.locator("#itemStockQuantity")).toHaveAttribute("readonly", "");
  expect((await page.locator("#itemStockQuantity").boundingBox()).width).toBeGreaterThanOrEqual(60);
  await expect(page.getByRole("checkbox", { name: "Требует заряда", exact: true })).toHaveCount(1);
  await page.screenshot({ path: "test-results/stock-locations-editor.png", fullPage: true });
  await activate(page.locator("#saveItemBtn"));
  await expect(item.locator(".preparation-buy")).toHaveText("Докупить: 2 шт.");
  await page.reload();
  await waitForApp(page);
  await activate(page.locator('.tab[data-view="items"]'));
  for (const place of ["Дом", "Дача"]) {
    await page.locator("#locationFilter").selectOption(place);
    await expect(page.locator("#itemsView [data-list-item-id]")).toHaveCount(1);
  }
  await activate(page.locator("[data-stock-locations]"));
  await quantities.first().fill("-1");
  await activate(dialog.getByRole("button", { name: "Отмена", exact: true }));
  await activate(page.locator("[data-stock-locations]"));
  await expect(quantities.first()).toHaveValue("2");
  await dialog.locator("[data-stock-from]").selectOption("1");
  await dialog.locator("[data-stock-to]").selectOption("0");
  await activate(dialog.locator("[data-stock-move]"));
  await expect(quantities.first()).toHaveValue("3");
  await expect(quantities.nth(1)).toHaveValue("1");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/stock-locations-mobile.png" });
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await activate(dialog.locator("[data-stock-save]"));
  await page.locator("#locationFilter").selectOption("");
  await activate(page.locator('.tab[data-view="packing"]'));
  await activate(page.locator('[data-preparation-action="buy"]'));
  await page.locator("[data-purchase-location]").selectOption("Дача");
  await activate(page.locator("[data-purchase-item] button"));
  await expect(page.locator("#preparationDialog")).toContainText("Всего хватает");
  await activate(page.locator("[data-preparation-close]"));
  await page.reload();
  await waitForApp(page);
  await activate(page.locator('.tab[data-view="items"]'));
  await activate(page.locator("[data-stock-locations]"));
  await expect(quantities.first()).toHaveValue("3");
  await expect(quantities.nth(1)).toHaveValue("3");
  await expect(dialog.locator("[data-stock-total]")).toHaveText("6");
});
