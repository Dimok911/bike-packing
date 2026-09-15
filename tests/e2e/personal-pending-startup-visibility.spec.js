import { test, expect } from "@playwright/test";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, nativeLegacyPhotoOutbox,
  seedLegacyPhotoPendingAction, legacyPhotoBinding } from "../fixtures/personal-legacy-photo-browser-fixture.js";

test.setTimeout(60000);

test("authenticated pending startup shows its validated local layout before delayed server verification", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { ordinaryRecovery: true, mixedLegacyRoutes: true });
  const original = await seedLegacyPhotoPendingAction(page);
  f.registerOrdinaryRecovery(original);
  let entered, release, held = false;
  const stateRequested = new Promise(resolve => { entered = resolve; });
  const stateGate = new Promise(resolve => { release = resolve; });
  await page.route(`**/bike-packing/lists/${legacyPhotoBinding.listId}/state`, async route => {
    if (!held) { held = true; entered(); await stateGate; }
    await route.fallback();
  });
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await stateRequested;
    // The response remains deliberately unresolved. Showing the cached view
    // must not wait for a real network timeout or pretend the save succeeded.
    await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 1500 });
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(2);
    await expect(page.locator("#layoutLoadStatus")).toContainText("проверяем подтверждение");
    await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "synced");
    expect((await nativeLegacyPhotoOutbox(page)).records).toEqual(original.records);
    expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]);
  } finally {
    release();
    await readyLegacyPhotoBrowser(page);
  }
  await expect(page.locator("#personalRecoveryNotice")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#personalOrdinaryRecoveryDialog")).not.toBeVisible();
  expect((await nativeLegacyPhotoOutbox(page)).records).toEqual(original.records);
  expect(f.posts).toEqual([]); expect(f.cancellations).toEqual([]);
  await f.flushErrors(); expect(f.errors).toEqual([]);
});
