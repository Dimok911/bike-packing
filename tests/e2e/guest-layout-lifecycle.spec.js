import { expect, test } from "@playwright/test";
import {
  createGuestWorkspace,
  prepareIsolatedRussianGuest,
  waitForApp,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("guest creates a nested bag and keeps the hierarchy after reload", async ({ page }) => {
  const nestedName = "Вложенный гермомешок";
  const { container } = await createGuestWorkspace(page, {
    layoutName: "Вложенные сумки",
    containerName: "Основная сумка",
    itemName: "Вещь основной сумки",
  });

  await container.locator("[data-add-to-container]").click();
  await expect(page.locator("#addToContainerDialog")).toBeVisible();
  await page.locator("#newSubcontainerName").fill(nestedName);
  await page.locator("#createSubcontainerBtn").click();

  const nested = container.locator("[data-subcontainer-id]").filter({ hasText: nestedName });
  await expect(nested).toHaveCount(1);
  await nested.evaluate((element) => {
    element.dataset.domIdentity = "preserved";
  });
  const disclosure = nested.locator(":scope > .subcontainer-title [data-toggle-container]");
  await disclosure.click();
  await expect(nested).toHaveClass(/collapsed/);
  await expect(disclosure).toHaveAttribute("aria-expanded", "false");
  await expect(nested).toHaveAttribute("data-dom-identity", "preserved");

  await disclosure.click();
  await expect(nested).not.toHaveClass(/collapsed/);
  await expect(disclosure).toHaveAttribute("aria-expanded", "true");
  await expect(nested).toHaveAttribute("data-dom-identity", "preserved");

  await disclosure.click();
  await page.reload();
  await waitForApp(page);
  const restoredRoot = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Основная сумка" });
  const restoredNested = restoredRoot.locator("[data-subcontainer-id]").filter({ hasText: nestedName });
  await expect(restoredNested).toHaveCount(1);
  await expect(restoredNested).toHaveClass(/collapsed/);
});

test("guest deletes a bag forever while keeping its item in the catalog", async ({ page }) => {
  const containerName = "Сумка для удаления";
  const itemName = "Вещь из удалённой сумки";
  const { container } = await createGuestWorkspace(page, {
    layoutName: "Удаление сумки",
    containerName,
    itemName,
  });

  await container.getByRole("heading", { name: containerName }).click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerDeleteForeverBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOkBtn").click();

  await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText: containerName })).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText: containerName })).toHaveCount(0);

  await page.locator('[data-view="items"]').click();
  await expect(page.locator("#itemsView")).toContainText(itemName);
});

test("guest deletes a layout and it does not return after reload", async ({ page }) => {
  const layoutName = "Укладка для удаления";
  await createGuestWorkspace(page, {
    layoutName,
    containerName: "Сумка удаляемой укладки",
    itemName: "Вещь удаляемой укладки",
  });

  await page.locator("#editLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await page.locator("#deleteEditedLayoutBtn").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmOkBtn").click();

  await expect(page.locator("#layoutSelect option", { hasText: layoutName })).toHaveCount(0);
  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#layoutSelect option", { hasText: layoutName })).toHaveCount(0);
  const persistedLayoutNames = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1") || "null");
    return Object.values(state?.layouts || {}).map((layout) => layout?.name);
  });
  expect(persistedLayoutNames).not.toContain(layoutName);
});
