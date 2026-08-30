import { devices, expect, test } from "@playwright/test";
import { openApp, prepareIsolatedRussianGuest } from "./guest-test-helpers.js";

test.use({ ...devices["iPhone 15"] });

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

async function selectView(page, view) {
  await page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());
}

async function viewportScrollTop(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-viewport-scroll-host]");
    return host?.scrollTop || document.scrollingElement?.scrollTop || window.scrollY || 0;
  });
}

async function expectViewportScrollNear(page, top) {
  await expect.poll(async () => Math.abs((await viewportScrollTop(page)) - top)).toBeLessThanOrEqual(8);
}

async function setViewportScroll(page, top) {
  await page.evaluate((nextTop) => {
    const host = document.querySelector("[data-viewport-scroll-host]");
    (host || window).scrollTo({ top: nextTop, left: 0, behavior: "auto" });
  }, top);
  await expectViewportScrollNear(page, top);
  return viewportScrollTop(page);
}

async function addLongViewFixtures(page) {
  await page.locator("#packingView, #itemsView, #bagsView").evaluateAll((views) => {
    views.forEach((view) => {
      const spacer = document.createElement("div");
      spacer.dataset.e2eScrollSpacer = "";
      spacer.style.height = "2600px";
      spacer.style.pointerEvents = "none";
      view.append(spacer);
    });
  });
}

test("iPhone keeps independent positions for long packing, items and bags", async ({ page }) => {
  await openApp(page);
  await addLongViewFixtures(page);
  await expect(page.locator("html")).toHaveClass(/isolated-viewport-scroll/);
  await expect(page.locator(".app[data-viewport-scroll-host]")).toHaveCount(1);

  const packingTop = await setViewportScroll(page, 900);
  await selectView(page, "items");
  await expectViewportScrollNear(page, 0);
  const itemsTop = await setViewportScroll(page, 620);

  await selectView(page, "bags");
  await expectViewportScrollNear(page, 0);
  const bagsTop = await setViewportScroll(page, 340);

  await selectView(page, "packing");
  await expectViewportScrollNear(page, packingTop);
  await selectView(page, "items");
  await expectViewportScrollNear(page, itemsTop);
  await selectView(page, "bags");
  await expectViewportScrollNear(page, bagsTop);
});

test("rapid Items and Bags gestures are not overwritten by a queued restore", async ({ page }) => {
  await openApp(page);
  await addLongViewFixtures(page);
  await setViewportScroll(page, 900);

  const geometry = await page.evaluate(() => {
    const queuedFrames = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    };

    const scrollHost = document.querySelector("[data-viewport-scroll-host]") || window;
    document.querySelector('.tab[data-view="items"]').click();
    scrollHost.scrollTo({ top: 620, left: 0, behavior: "auto" });
    document.querySelector('.tab[data-view="bags"]').click();
    scrollHost.scrollTo({ top: 480, left: 0, behavior: "auto" });

    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", {
      value: [{ clientX: 180, clientY: 620 }]
    });
    document.dispatchEvent(touchStart);

    const marker = document.querySelector("#bagsView [data-e2e-scroll-spacer]");
    const beforeFrame = marker.getBoundingClientRect().top;
    queuedFrames.splice(0).forEach((callback) => callback(performance.now()));
    const afterFrame = marker.getBoundingClientRect().top;
    const scrollTop = scrollHost.scrollTop || 0;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    return { afterFrame, beforeFrame, scrollTop };
  });

  expect(Math.abs(geometry.afterFrame - geometry.beforeFrame)).toBeLessThanOrEqual(1);
  expect(geometry.scrollTop).toBeGreaterThan(400);
});

test("iPhone document scrolling paints no duplicated packing root header", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const app = document.querySelector("[data-viewport-scroll-host]");
    app?.removeAttribute("data-viewport-scroll-host");
    app?.removeAttribute("data-viewport-scroll-host-no-banner");
    document.documentElement.classList.remove("isolated-viewport-scroll");
    document.body.classList.remove("isolated-viewport-scroll");
  });
  await expect(page.locator("html")).not.toHaveClass(/isolated-viewport-scroll/);
  await page.locator("#packingView").evaluate((packingView) => {
    const fixture = document.createElement("section");
    fixture.dataset.e2ePackingHeaderFixture = "";
    fixture.innerHTML = `
      <div class="packing-root-header-row is-visible">
        <div class="packing-root-header-track">
          <div class="packing-root-header-cell" data-sticky-root-container-id="bag-a">Сумка</div>
        </div>
      </div>
      <div class="board" style="width: 360px; min-height: 1200px; overflow: auto;">
        <article class="container-card" data-root-container-id="bag-a" style="width: 320px; min-height: 900px;">
          <header class="container-header">Сумка</header>
        </article>
      </div>
    `;
    packingView.append(fixture);
  });

  const duplicateHeader = page.locator("[data-e2e-packing-header-fixture] .packing-root-header-row");
  await expect(duplicateHeader).toHaveCount(1);
  await expect(duplicateHeader).toBeHidden();
});
