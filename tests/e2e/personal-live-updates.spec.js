import { test, expect } from "@playwright/test";
import { setupPersonalLegacyPhotoBrowser } from "../fixtures/personal-legacy-photo-browser-fixture.js";

test("server notification updates the open layout before the polling interval, without reload or writes", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { liveUpdates: true });
  await expect.poll(() => f.eventWaiters.length).toBe(1);
  const layoutBefore = await page.locator("#layoutSelect").inputValue();
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  f.payload.containers["placed-bag"].name = "Сумка обновлена на другом устройстве";
  f.revision++;
  f.notifyRemoteChange();
  await expect(page.locator('#packingView [data-root-container-id="placed-bag"]')).toContainText(
    "Сумка обновлена на другом устройстве", { timeout: 10000 });
  await expect(page.locator("#layoutSelect")).toHaveValue(layoutBefore);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  expect(f.posts).toHaveLength(0);
  await f.flushErrors();
  expect(f.errors).toEqual([]);
  expect(f.pageErrors).toEqual([]);
});
