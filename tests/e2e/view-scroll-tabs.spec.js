import { devices, expect, test } from "@playwright/test";
import { openApp, prepareIsolatedRussianGuest } from "./guest-test-helpers.js";

test.use({ ...devices["iPhone 15"] });

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

async function selectViewWithoutAutoScroll(page, view) {
  await page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());
}

async function setViewportScroll(page, top) {
  const app = page.locator(".app[data-viewport-scroll-host]");
  await app.evaluate((element, nextTop) => {
    element.scrollTop = nextTop;
    element.dispatchEvent(new Event("scroll"));
  }, top);
  await expectViewportScrollNear(app, top);
  await page.waitForTimeout(50);
  return app.evaluate((element) => element.scrollTop);
}

async function expectViewportScrollNear(app, top) {
  await expect.poll(async () => Math.abs(
    (await app.evaluate((element) => element.scrollTop)) - top
  )).toBeLessThanOrEqual(8);
}

test("iPhone keeps an independent vertical position for every main tab", async ({ page }) => {
  await openApp(page);
  const app = page.locator(".app[data-viewport-scroll-host]");
  await expect(app).toHaveCount(1);

  await page.locator("#packingView, #itemsView, #bagsView, #settingsView").evaluateAll((views) => {
    views.forEach((view) => {
      const spacer = document.createElement("div");
      spacer.dataset.e2eScrollSpacer = "";
      spacer.style.height = "2600px";
      spacer.style.pointerEvents = "none";
      view.append(spacer);
    });
  });

  const packingTop = await setViewportScroll(page, 900);
  await selectViewWithoutAutoScroll(page, "items");
  await expectViewportScrollNear(app, 0);

  const itemsTop = await setViewportScroll(page, 620);
  await selectViewWithoutAutoScroll(page, "settings");
  await expectViewportScrollNear(app, 0);

  const settingsTop = await setViewportScroll(page, 280);
  await selectViewWithoutAutoScroll(page, "packing");
  await expectViewportScrollNear(app, packingTop);

  await selectViewWithoutAutoScroll(page, "items");
  await expectViewportScrollNear(app, itemsTop);

  await selectViewWithoutAutoScroll(page, "settings");
  await expectViewportScrollNear(app, settingsTop);
});
