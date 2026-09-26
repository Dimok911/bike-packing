import { expect, test } from "@playwright/test";
import { activateGuestControl, createEmptyLayout, createGuestWorkspace, createItemInContainer, openApp, prepareIsolatedRussianGuest, waitForApp } from "./guest-test-helpers.js";

test("an empty layout only shows the invitation on desktop and mobile", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  await openApp(page);
  await createEmptyLayout(page, "Пустая укладка");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const invitation = page.locator("#packingView .packing-empty-state");
    const actions = page.locator("#packingView .preparation-actions");
    await expect(invitation).toBeVisible();
    await expect(actions).toHaveCount(0);
    const invitationBox = await invitation.boundingBox();
    expect(invitationBox.x + invitationBox.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `test-results/inventory-empty-${width}.png` });
  }
});

test("a fresh user has both built-in categories without automatically marking new items", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  const { item } = await createGuestWorkspace(page, { layoutName: "Новая укладка", containerName: "Новая сумка", itemName: "Фонарь" });
  await expect(page.locator('[data-preparation-action="repair"] strong')).toHaveText("0");
  await expect(page.locator('[data-preparation-action="charge"] strong')).toHaveText("0");
  await activateGuestControl(item.locator(".item-title-hitarea"));
  const repair = page.locator("#itemNeedsRepair");
  const charge = page.locator("#itemNeedsCharge");
  await expect(page.locator('#itemCategoryList [data-category-search-option]')).toHaveCount(0);
  await expect(repair).not.toBeChecked();
  await expect(charge).not.toBeChecked();
  await repair.check();
  await charge.check();
  await expect(page.locator("#itemAvailabilityStatus")).toHaveValue("available");
  await activateGuestControl(page.locator("#saveItemBtn"));
  await expect(item.locator(".preparation-repair")).toBeVisible();
  await expect(item.locator(".preparation-charge")).toBeVisible();
  await activateGuestControl(page.locator('.tab[data-view="settings"]'));
  await expect(page.locator(".dictionary-chip-builtin")).toHaveCount(2);
  await expect(page.locator(".dictionary-chip-builtin button")).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await activateGuestControl(page.locator('.tab[data-view="settings"]'));
  await expect(page.locator(".dictionary-chip-builtin")).toHaveCount(2);
});

test("dragging the first bag pushes the empty invitation right and then reveals preparation actions", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  await createGuestWorkspace(page, { layoutName: "Исходная укладка", containerName: "Сумка для переноса", itemName: "Вещь" });
  await createEmptyLayout(page, "Пустая цель");
  await activateGuestControl(page.locator('.tab[data-view="bags"]'));
  const handle = page.locator("[data-root-drag] .root-container-title").filter({ hasText: "Сумка для переноса" });
  const sourceBox = await handle.boundingBox();
  const packingTab = page.locator('.tab[data-view="packing"]');
  const tabBox = await packingTab.boundingBox();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2, { steps: 12 });
  const invitation = page.locator("#packingView .packing-empty-state");
  await expect(invitation).toBeVisible();
  const before = await invitation.boundingBox();
  await page.mouse.move(before.x + 45, before.y + 45, { steps: 6 });
  const placeholder = page.locator("#packingView .board > .column-placeholder");
  await expect(placeholder).toBeVisible();
  // Mobile edge scrolling can move the board between awaits; measure both in one frame.
  const [placeholderBox, during] = await page.evaluate(() => [
    document.querySelector("#packingView .board > .column-placeholder"),
    document.querySelector("#packingView .packing-empty-state")
  ].map(node => { const {x,y,width,height} = node.getBoundingClientRect(); return {x,y,width,height}; }));
  expect(during.x).toBeGreaterThan(before.x + 200);
  expect(during.x).toBeGreaterThanOrEqual(placeholderBox.x + placeholderBox.width);
  await expect(page.locator("#packingView .preparation-actions")).toHaveCount(0);
  await page.screenshot({ path: "test-results/inventory-first-bag-drag.png" });
  await page.mouse.up();
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(1);
  await expect(invitation).toHaveCount(0);
  await expect(page.locator("#packingView .preparation-actions")).toBeVisible();
  const addBox = await page.locator("#packingView .packing-add-root-card").boundingBox();
  const actionsBox = await page.locator("#packingView .preparation-actions").boundingBox();
  expect(actionsBox.width).toBeCloseTo(addBox.width, 0);
  expect(actionsBox.y).toBeGreaterThanOrEqual(addBox.y + addBox.height + 8);
});

test("catalog stock controls and purchase badges align for one-, two- and three-line names", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const { container } = await createGuestWorkspace(page, { layoutName: "Ровные карточки", containerName: "Еда", itemName: "Чай", quantity: "2" });
  await createItemInContainer(page, container, "Шоколадка Марс", { quantity: "2" });
  await createItemInContainer(page, container, "Каша гречневая с говядиной", { quantity: "2" });
  await activateGuestControl(page.locator('.tab[data-view="items"]'));
  const cards = page.locator("#itemsView [data-list-item-id]");
  await expect(cards).toHaveCount(3);
  const boxes = await cards.evaluateAll((entries) => entries.map((card) => {
    const bounds = (selector) => {
      const box = card.querySelector(selector).getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
    };
    return { stock: bounds(".item-stock-control"), badge: bounds(".preparation-buy"), photo: bounds(".item-photo"), card: card.getBoundingClientRect().toJSON() };
  }));
  for (const box of boxes) {
    expect(box.stock.top).toBeCloseTo(boxes[0].stock.top, 0);
    expect(box.badge.top).toBeCloseTo(boxes[0].badge.top, 0);
    expect(box.stock.bottom + 4).toBeLessThanOrEqual(box.photo.top);
    expect(box.badge.top).toBeGreaterThan(box.photo.top);
    expect(box.badge.bottom).toBeLessThan(box.photo.bottom);
    expect(box.stock.right).toBeLessThan(box.card.right);
  }
  await page.screenshot({ path: "test-results/inventory-aligned-cards.png" });
});

test("stock, three preparation lists and purchases stay independent of the packing plan", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { item } = await createGuestWorkspace(page, { layoutName: "Поход с запасами", containerName: "Провизия", itemName: "Каша гречневая", quantity: "7", weight: "100" });
  await page.route("**/e2e-preparation-photo.png*", (route) => route.fulfill({
    status: 200, contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
  }));
  await page.evaluate(() => {
    const key = "bike-packing-prototype-state-v1";
    const state = JSON.parse(localStorage.getItem(key));
    const record = Object.values(state.items).find((entry) => entry.name === "Каша гречневая");
    record.photos = [{ id: "preparation-photo", url: `${location.origin}/e2e-preparation-photo.png`, thumbUrl: `${location.origin}/e2e-preparation-photo.png` }];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await waitForApp(page);
  await expect(item.locator(".preparation-buy")).toHaveText("Докупить: 6 шт.");
  await activateGuestControl(item.locator(".item-title-hitarea"));
  await page.locator("#itemStockQuantity").fill("3");
  await page.locator("#itemNeedsRepair").check();
  await page.locator("#itemNeedsCharge").check();
  await activateGuestControl(page.locator("#saveItemBtn"));
  await expect(item.locator(".preparation-buy")).toHaveText("Докупить: 4 шт.");
  await page.screenshot({ path: "test-results/inventory-desktop.png" });
  for (const action of ["buy", "repair", "charge"]) {
    await expect(page.locator(`[data-preparation-action="${action}"] strong`)).toHaveText("1");
    await activateGuestControl(page.locator(`[data-preparation-action="${action}"]`));
    await expect(page.locator("#preparationDialog [data-preparation-item]")).toHaveCount(1);
    await expect(page.locator("#preparationDialog")).toContainText("Каша гречневая");
    const photo = page.locator("#preparationDialog .picker-list-thumbnail img");
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await photo.click();
    await expect(page.locator("#preparationDialog")).toBeVisible();
    await expect(page.locator("#itemDialog")).toBeVisible();
    await expect(page.locator("#itemName")).toHaveValue("Каша гречневая");
    await page.keyboard.press("Escape");
    await expect(page.locator("#itemDialog")).not.toBeVisible();
    await expect(page.locator("#preparationDialog")).toBeVisible();
    await activateGuestControl(page.locator("[data-preparation-close]"));
  }
  await activateGuestControl(page.locator('[data-preparation-action="buy"]'));
  await page.locator("[data-purchase-item] input").fill("2");
  await activateGuestControl(page.locator("[data-purchase-item] button"));
  await expect(page.locator(".preparation-shortage strong")).toHaveText("2");
  await activateGuestControl(page.locator("[data-purchase-item] button"));
  await expect(page.locator("#preparationDialog")).toContainText("Всего хватает");
  await activateGuestControl(page.locator("[data-preparation-close]"));
  await expect(page.locator('[data-preparation-action="buy"] strong')).toHaveText("0");
  await activateGuestControl(item.locator(".item-title-hitarea"));
  await expect(page.locator("#itemQuantity")).toHaveValue("7");
  await expect(page.locator("#itemStockQuantity")).toHaveValue("7");
  await page.locator("#itemNeedsRepair").uncheck();
  await page.locator("#itemNeedsCharge").uncheck();
  await activateGuestControl(page.locator("#saveItemBtn"));
  await expect(page.locator('[data-preparation-action="repair"] strong')).toHaveText("0");
  await expect(page.locator('[data-preparation-action="charge"] strong')).toHaveText("0");
  await activateGuestControl(page.locator('.tab[data-view="items"]'));
  const stock = page.locator("[data-stock-input]");
  await expect(stock).toHaveValue("7");
  await stock.fill("0");
  await stock.press("Tab");
  await expect(page.locator("#itemsView .preparation-buy")).toHaveText("Докупить: 7 шт.");
  await expect(page.locator("#itemsView .preparation-buy")).toHaveAttribute("title", "Для укладки «Поход с запасами» нужно 7 шт., в наличии 0 шт. Не хватает 7 шт.");
  await page.screenshot({ path: "test-results/inventory-items.png" });
  await page.reload();
  await waitForApp(page);
  await activateGuestControl(page.locator('.tab[data-view="items"]'));
  await expect(page.locator("[data-stock-input]")).toHaveValue("0");
  await activateGuestControl(page.locator('[data-stock-step="1"]'));
  await expect(page.locator("[data-stock-input]")).toHaveValue("1");
  await activateGuestControl(page.locator('.tab[data-view="packing"]'));
  await expect(item.locator(".preparation-buy")).toHaveText("Докупить: 6 шт.");
  await expect(item).toContainText("700");
  await page.setViewportSize({ width: 390, height: 844 });
  await activateGuestControl(page.locator('[data-preparation-action="buy"]'));
  await expect(page.locator("#preparationDialog")).toBeVisible();
  await page.screenshot({ path: "test-results/inventory-mobile.png" });
  expect(errors).toEqual([]);
});
