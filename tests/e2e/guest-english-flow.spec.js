import { expect, test } from "@playwright/test";
import {
  createGuestWorkspace,
  prepareIsolatedEnglishGuest,
  waitForApp,
} from "./guest-test-helpers.js";

test.beforeEach(async ({ page }) => {
  await prepareIsolatedEnglishGuest(page);
});

test("English guest creates and restores a layout, bag and item", async ({ page }) => {
  const layoutName = "English test layout";
  const containerName = "English frame bag";
  const itemName = "English mini pump";
  await createGuestWorkspace(page, { layoutName, containerName, itemName, weight: "140" });

  await expect(page.locator("#languageSelect")).toHaveValue("en");
  await expect(page.locator("#newLayoutBtn")).toHaveText("New");
  await expect(page.locator('[data-view="packing"]')).toHaveText("Packing");

  await page.reload();
  await waitForApp(page);
  await expect(page.locator("#languageSelect")).toHaveValue("en");
  await expect(page.locator("#layoutSelect option:checked")).toHaveText(layoutName);
  await expect(page.locator("#packingView [data-root-container-id]").filter({ hasText: containerName })).toContainText(itemName);
});
