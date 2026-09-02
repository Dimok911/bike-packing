import { expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  createGuestWorkspace,
  createRootContainer,
  openApp,
  prepareIsolatedRussianGuest,
  waitForApp,
} from "./guest-test-helpers.js";

const TEST_LAYOUT_NAME = "Проверка укладки";
const TEST_CONTAINER_NAME = "Тестовая подрамная сумка";
const TEST_ITEM_NAME = "Тестовый насос";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("clean guest starts the packing board at 100% and sees the zoom indicator", async ({ page }) => {
  await openApp(page);
  await createEmptyLayout(page, "Масштаб 100%");
  await createRootContainer(page, "Сумка для проверки масштаба");

  await expect(page.locator("#packingView .board")).toHaveAttribute("data-packing-board-zoom", "1");
  await expect(page.locator("#packingBoardZoomReset")).toBeVisible();
  await expect(page.locator("#packingBoardZoomReset")).toHaveText("100%");
  await expect.poll(() => page.evaluate(() => (
    localStorage.getItem("bike-packing-board-zoom-v1")
  ))).toBeNull();
});

test("desktop zoom indicator opens a vertical slider and applies its value", async ({ page }) => {
  await openApp(page);
  await createEmptyLayout(page, "Ползунок масштаба");
  await createRootContainer(page, "Сумка для ползунка");

  await page.locator("#packingBoardZoomReset").click();
  await expect(page.locator("#packingBoardZoomPanel")).toBeVisible();
  await page.locator("#packingBoardZoomRange").evaluate((range) => {
    range.value = "75";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await expect(page.locator("#packingView .board")).toHaveAttribute("data-packing-board-zoom", "0.75");
  await expect(page.locator("#packingBoardZoomReset")).toHaveText("75%");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("bike-packing-board-zoom-v1"))).toBe("0.75");
  await page.keyboard.press("Escape");
  await expect(page.locator("#packingBoardZoomPanel")).toBeHidden();
});

test("guest creates a layout, bag and item and keeps them after reload", async ({ page }) => {
  await createGuestWorkspace(page, {
    layoutName: TEST_LAYOUT_NAME,
    containerName: TEST_CONTAINER_NAME,
    itemName: TEST_ITEM_NAME,
  });

  await page.reload();
  await waitForApp(page);

  await expect(page.locator("#layoutSelect option:checked")).toHaveText(TEST_LAYOUT_NAME);
  const restoredContainer = page.locator("#packingView [data-root-container-id]").filter({
    hasText: TEST_CONTAINER_NAME,
  });
  await expect(restoredContainer).toHaveCount(1);
  await expect(restoredContainer.locator("[data-item-id]").filter({ hasText: TEST_ITEM_NAME })).toHaveCount(1);

  const persisted = await page.evaluate(({ layoutName, containerName, itemName }) => {
    const state = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1") || "null");
    return {
      hasLayout: Object.values(state?.layouts || {}).some((layout) => layout?.name === layoutName),
      hasContainer: Object.values(state?.containers || {}).some((container) => container?.name === containerName),
      hasItem: Object.values(state?.items || {}).some((item) => item?.name === itemName),
    };
  }, {
    layoutName: TEST_LAYOUT_NAME,
    containerName: TEST_CONTAINER_NAME,
    itemName: TEST_ITEM_NAME,
  });
  expect(persisted).toEqual({ hasLayout: true, hasContainer: true, hasItem: true });
});
