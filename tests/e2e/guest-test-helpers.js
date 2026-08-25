import { expect } from "@playwright/test";

export async function waitForApp(page) {
  await expect(page.locator("body")).toHaveClass(/\bapp-ready\b/, { timeout: 15_000 });
  await expect(page.locator("#layoutSelect")).toBeVisible();
}

export async function prepareIsolatedGuest(page, language = "ru") {
  await page.route("**/letters-vniipo/api/**", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, code: "e2e_isolated", message: "E2E uses local guest storage" }),
    });
  });
  await page.addInitScript((selectedLanguage) => {
    localStorage.setItem("bike-packing-language-v1", selectedLanguage);
  }, language);
}

export async function prepareIsolatedRussianGuest(page) {
  await prepareIsolatedGuest(page, "ru");
}

export async function prepareIsolatedEnglishGuest(page) {
  await prepareIsolatedGuest(page, "en");
}

export async function openApp(page) {
  await page.goto("/");
  await waitForApp(page);
}

export async function createEmptyLayout(page, layoutName) {
  await page.locator("#newLayoutBtn").click();
  await expect(page.locator("#layoutDialog")).toBeVisible();
  await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill(layoutName);
  await page.locator("#saveLayoutBtn").click();

  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  await expect(page.locator("#layoutSelect option:checked")).toHaveText(layoutName);
}

export async function createRootContainer(page, containerName) {
  await page.locator("[data-add-packing-root]").click();
  await expect(page.locator("#layoutRootDialog")).toBeVisible();
  await page.locator("#createRootForLayoutBtn").click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(containerName);
  await page.locator("#saveRootContainerBtn").click();

  const container = page.locator("#packingView [data-root-container-id]").filter({ hasText: containerName });
  await expect(container).toHaveCount(1);
  return container;
}

export async function createItemInContainer(page, container, itemName, { weight = "0", quantity = "1" } = {}) {
  await container.locator("[data-add-to-container]").click();
  await expect(page.locator("#addToContainerDialog")).toBeVisible();
  await page.locator("#createItemForContainerBtn").click();
  await expect(page.locator("#itemDialog")).toBeVisible();
  await page.locator("#itemName").fill(itemName);
  await page.locator("#itemWeight").fill(weight);
  await page.locator("#itemQuantity").fill(quantity);
  await page.locator("#saveItemBtn").click();

  const item = container.locator("[data-item-id]").filter({ hasText: itemName });
  await expect(item).toHaveCount(1);
  return item;
}

export async function createGuestWorkspace(page, { layoutName, containerName, itemName, weight = "0", quantity = "1" }) {
  await openApp(page);
  await createEmptyLayout(page, layoutName);
  const container = await createRootContainer(page, containerName);
  const item = await createItemInContainer(page, container, itemName, { weight, quantity });
  return { container, item };
}
