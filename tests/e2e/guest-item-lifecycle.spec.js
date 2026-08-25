import { expect, test } from "@playwright/test";
import {
  createGuestWorkspace,
  createItemInContainer,
  prepareIsolatedRussianGuest,
  waitForApp,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("guest edits an item and bag and keeps changes after reload", async ({ page }) => {
  const original = {
    layoutName: "Редактирование данных",
    containerName: "Исходная сумка",
    itemName: "Исходная вещь",
  };
  const changedContainerName = "Изменённая сумка";
  const changedItemName = "Изменённая вещь";
  const { container, item } = await createGuestWorkspace(page, { ...original, weight: "125" });

  await item.locator(".item-title-hitarea").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemName").fill(changedItemName);
  await page.locator("#itemWeight").fill("275");
  await page.locator("#saveItemBtn").click();

  const changedItem = container.locator("[data-item-id]").filter({ hasText: changedItemName });
  await expect(changedItem).toHaveCount(1);
  await expect(changedItem).toContainText("275");

  await container.getByRole("heading", { name: original.containerName }).click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(changedContainerName);
  await page.locator("#saveRootContainerBtn").click();

  await page.reload();
  await waitForApp(page);
  const restoredContainer = page.locator("#packingView [data-root-container-id]").filter({ hasText: changedContainerName });
  await expect(restoredContainer).toHaveCount(1);
  await expect(restoredContainer.locator("[data-item-id]").filter({ hasText: changedItemName })).toContainText("275");
  await expect(page.locator("#packingView")).not.toContainText(original.containerName);
  await expect(page.locator("#packingView")).not.toContainText(original.itemName);
});

test("guest searches items and clears the search", async ({ page }) => {
  const { container } = await createGuestWorkspace(page, {
    layoutName: "Проверка поиска",
    containerName: "Сумка для поиска",
    itemName: "Красный фонарь",
  });
  await createItemInContainer(page, container, "Синий насос");

  await page.locator("#searchInput").fill("фонарь");
  await expect(container.locator("[data-item-id]").filter({ hasText: "Красный фонарь" })).toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Синий насос" })).toHaveCount(0);
  await expect(page.locator("#clearSearchBtn")).toBeVisible();

  await page.locator("#clearSearchBtn").click();
  await expect(page.locator("#searchInput")).toHaveValue("");
  await expect(container.locator("[data-item-id]").filter({ hasText: "Красный фонарь" })).toBeVisible();
  await expect(container.locator("[data-item-id]").filter({ hasText: "Синий насос" })).toBeVisible();
});

test("guest marks an item packed and keeps collection state after reload", async ({ page }) => {
  const itemName = "Собранная аптечка";
  const { item } = await createGuestWorkspace(page, {
    layoutName: "Режим сбора",
    containerName: "Сумка режима сбора",
    itemName,
  });

  await page.locator("#menuBtn").click();
  await expect(page.locator("#topMenu")).toBeVisible();
  await page.locator("#collectionMenuBtn").click();
  const packToggle = item.locator("[data-toggle-packed]");
  await expect(packToggle).toBeVisible();
  await packToggle.click();
  await expect(item).toHaveClass(/\bpacked-item\b/);

  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#collectionModeBtn")).toHaveClass(/\bactive\b/);
  const restoredItem = page.locator("#packingView [data-item-id]").filter({ hasText: itemName });
  await expect(restoredItem).toHaveClass(/\bpacked-item\b/);
  await expect(restoredItem.locator("[data-toggle-packed]")).toHaveText("✓");
});

test("guest deletes an item forever and it does not return after reload", async ({ page }) => {
  const itemName = "Вещь для удаления";
  const { item } = await createGuestWorkspace(page, {
    layoutName: "Удаление вещи",
    containerName: "Сумка удаления",
    itemName,
  });

  await item.locator(".item-title-hitarea").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemDeleteForeverBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOkBtn").click();

  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: itemName })).toHaveCount(0);
  const persistedItemNames = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1") || "null");
    return Object.values(state?.items || {}).map((item) => item?.name);
  });
  expect(persistedItemNames).not.toContain(itemName);
});
