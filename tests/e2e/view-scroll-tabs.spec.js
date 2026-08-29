import { devices, expect, test } from "@playwright/test";
import { openApp, prepareIsolatedRussianGuest } from "./guest-test-helpers.js";

test.use({ ...devices["iPhone 15"] });

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

async function selectViewWithoutAutoScroll(page, view) {
  await page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());
}

async function viewportScrollTop(page) {
  return page.evaluate(() => document.scrollingElement?.scrollTop || window.scrollY || 0);
}

async function setViewportScroll(page, top) {
  await page.evaluate((nextTop) => window.scrollTo({ top: nextTop, left: 0, behavior: "auto" }), top);
  await expectViewportScrollNear(page, top);
  return viewportScrollTop(page);
}

async function expectViewportScrollNear(page, top) {
  await expect.poll(async () => Math.abs((await viewportScrollTop(page)) - top)).toBeLessThanOrEqual(8);
}

async function addScrollableViewFixtures(page) {
  await page.locator("#packingView, #itemsView, #bagsView, #settingsView").evaluateAll((views) => {
    views.forEach((view) => {
      const spacer = document.createElement("div");
      spacer.dataset.e2eScrollSpacer = "";
      spacer.style.height = "2600px";
      spacer.style.pointerEvents = "none";
      view.append(spacer);
    });
  });
}

test("iPhone keeps repeated native scroll advances in items, bags and settings", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await expect(page.locator("html")).not.toHaveClass(/isolated-viewport-scroll/);
  await expect(page.locator(".app[data-viewport-scroll-host]")).toHaveCount(0);

  for (const view of ["items", "bags", "settings"]) {
    await selectViewWithoutAutoScroll(page, view);
    await setViewportScroll(page, 0);
    let previousTop = 0;
    for (let index = 0; index < 3; index += 1) {
      await page.evaluate(() => window.scrollBy({ top: 420, left: 0, behavior: "auto" }));
      await expect.poll(() => viewportScrollTop(page)).toBeGreaterThan(previousTop + 80);
      previousTop = await viewportScrollTop(page);
      await page.waitForTimeout(120);
      expect(await viewportScrollTop(page)).toBeGreaterThan(previousTop - 8);
    }
    expect(previousTop).toBeGreaterThan(240);
  }
});

test("iPhone keeps an independent vertical position for every main tab", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);

  const packingTop = await setViewportScroll(page, 900);
  await selectViewWithoutAutoScroll(page, "items");
  await expectViewportScrollNear(page, 0);

  const itemsTop = await setViewportScroll(page, 620);
  await selectViewWithoutAutoScroll(page, "settings");
  await expectViewportScrollNear(page, 0);

  const settingsTop = await setViewportScroll(page, 280);
  await selectViewWithoutAutoScroll(page, "packing");
  await expectViewportScrollNear(page, packingTop);

  await selectViewWithoutAutoScroll(page, "items");
  await expectViewportScrollNear(page, itemsTop);

  await selectViewWithoutAutoScroll(page, "settings");
  await expectViewportScrollNear(page, settingsTop);
});
