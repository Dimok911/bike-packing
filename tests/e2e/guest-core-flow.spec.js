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
  await page.locator("body").evaluate((body) => {
    body.classList.remove("app-ready");
    body.classList.add("app-starting");
  });
  await expect(page.locator("#packingBoardZoomReset")).toBeHidden();
  await page.locator("body").evaluate((body) => {
    body.classList.add("app-ready");
    body.classList.remove("app-starting");
  });
  await expect(page.locator("#packingBoardZoomReset")).toBeVisible();
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

test("zooming out at the right keeps the focused card still until the user pans away", async ({ page }) => {
  await openApp(page);
  await createEmptyLayout(page, "Без скачка масштаба");
  await createRootContainer(page, "Первая сумка");
  await page.evaluate((targetLayoutName) => {
    const storageKey = "bike-packing-prototype-state-v1";
    const state = JSON.parse(localStorage.getItem(storageKey) || "null");
    const layout = Object.values(state?.layouts || {}).find((entry) => entry?.name === targetLayoutName);
    const sourceId = layout?.rootContainerIds?.[0];
    const source = state?.containers?.[sourceId];
    const sourcePlacement = layout?.arrangement?.containers?.[sourceId];
    if (!layout || !source || !sourcePlacement) throw new Error("zoom layout fixture missing");
    for (let index = 2; index <= 8; index += 1) {
      const id = `e2e-zoom-bag-${index}`;
      state.containers[id] = {
        ...structuredClone(source),
        id,
        name: `Сумка ${index}`,
        itemIds: [],
        childIds: [],
        order: [],
      };
      layout.arrangement.containers[id] = {
        ...structuredClone(sourcePlacement),
        parentId: "",
        itemIds: [],
        childIds: [],
        order: [],
      };
      layout.rootContainerIds.push(id);
      layout.arrangement.rootContainerIds.push(id);
    }
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, "Без скачка масштаба");
  await page.reload();
  await waitForApp(page);
  await page.locator("#packingView").evaluate(async (packingView) => {
    await Promise.all(packingView.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });

  const board = page.locator("#packingView .board");
  const lastCard = board.locator("[data-root-container-id]").last();
  const anchor = await board.evaluate((element) => {
    const card = element.querySelector("[data-root-container-id]:last-of-type");
    if (!card) throw new Error("last zoom card missing");
    const boardRect = element.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    element.scrollLeft += cardRect.left + cardRect.width / 2 - (boardRect.left + boardRect.width / 2);
    const nextRect = card.getBoundingClientRect();
    return {
      clientX: nextRect.left + nextRect.width / 2,
      clientY: nextRect.top + Math.min(40, nextRect.height / 2),
    };
  });
  const before = await lastCard.boundingBox();
  for (let index = 0; index < 7; index += 1) {
    await lastCard.dispatchEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: anchor.clientX,
      clientY: anchor.clientY,
      ctrlKey: true,
      deltaY: 100,
    });
  }
  await expect(board).toHaveAttribute("data-packing-board-retained-right-gutter", /\d/);
  const after = await lastCard.boundingBox();
  expect(Math.abs((after.x + after.width / 2) - (before.x + before.width / 2))).toBeLessThan(10);

  const retainedBeforePan = Number(await board.getAttribute("data-packing-board-retained-right-gutter"));
  await board.evaluate((element, retained) => {
    element.scrollLeft = Math.max(0, element.scrollLeft - retained / 2);
  }, retainedBeforePan);
  await expect.poll(async () => Number(
    await board.getAttribute("data-packing-board-retained-right-gutter") || 0
  )).toBeLessThan(retainedBeforePan);
  await board.evaluate((element) => { element.scrollLeft = 0; });
  await expect(board).not.toHaveAttribute("data-packing-board-retained-right-gutter", /.+/);
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

test("layout comparison keeps a move arrow aligned while zoom changes", async ({ page }) => {
  const fromLayoutName = "Стрелка исходная";
  const toLayoutName = "Стрелка конечная";
  const itemName = "Перемещённая вещь";
  await createGuestWorkspace(page, {
    layoutName: fromLayoutName,
    containerName: "Исходная сумка",
    itemName,
  });
  await createEmptyLayout(page, toLayoutName);
  await createRootContainer(page, "Конечная сумка");
  await page.evaluate(({ fromLayoutName, toLayoutName, itemName }) => {
    const storageKey = "bike-packing-prototype-state-v1";
    const state = JSON.parse(localStorage.getItem(storageKey) || "null");
    const fromLayout = Object.values(state?.layouts || {}).find((layout) => layout?.name === fromLayoutName);
    const toLayout = Object.values(state?.layouts || {}).find((layout) => layout?.name === toLayoutName);
    const item = Object.values(state?.items || {}).find((entry) => entry?.name === itemName);
    const sourceId = fromLayout?.arrangement?.items?.[item?.id];
    const targetId = toLayout?.rootContainerIds?.[0];
    const sourcePlacement = fromLayout?.arrangement?.containers?.[sourceId];
    const targetPlacement = toLayout?.arrangement?.containers?.[targetId];
    if (!fromLayout || !toLayout || !item || !sourcePlacement || !targetPlacement) {
      throw new Error("comparison move fixture missing");
    }
    targetPlacement.itemIds.push(item.id);
    targetPlacement.order.push({ type: "item", id: item.id });
    toLayout.arrangement.items[item.id] = targetId;
    localStorage.setItem(storageKey, JSON.stringify(state));
  }, { fromLayoutName, toLayoutName, itemName });
  await page.reload();
  await waitForApp(page);

  await page.locator("#menuBtn").click();
  await page.locator("#compareLayoutsMenuBtn").click();
  await page.locator("#layoutCompareFrom").selectOption({ label: fromLayoutName });
  await page.locator("#layoutCompareTo").selectOption({ label: toLayoutName });
  await page.locator("#layoutCompareStartBtn").click();

  const moveButtons = page.locator("[data-compare-show-move-link]");
  await expect(moveButtons).toHaveCount(2);
  await moveButtons.first().click();
  const arrow = page.locator(".comparison-move-arrow-overlay");
  await expect(arrow).toHaveCount(1);
  const pathBeforeZoom = await arrow.locator(".comparison-move-arrow-path").getAttribute("d");

  await page.locator("#packingBoardZoomReset").click();
  await page.locator("#packingBoardZoomRange").evaluate((range) => {
    range.value = "75";
    range.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#packingBoardZoomReset")).toHaveText("75%");
  await expect(arrow).toHaveCount(1);
  await expect.poll(async () => arrow.locator(".comparison-move-arrow-path").getAttribute("d"))
    .not.toBe(pathBeforeZoom);
});
