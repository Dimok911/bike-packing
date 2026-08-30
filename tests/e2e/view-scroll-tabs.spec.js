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

test("a fast iPhone swipe keeps its compositor position after a tab switch", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await setViewportScroll(page, 900);

  await page.evaluate(() => {
    document.querySelector('.tab[data-view="items"]').click();
    const dispatchTouch = (type, clientY) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: 180, clientY }]
      });
      document.dispatchEvent(event);
    };
    dispatchTouch("touchstart", 620);
    dispatchTouch("touchmove", 470);
    window.scrollTo({ top: 620, left: 0, behavior: "auto" });
  });

  await expect.poll(() => viewportScrollTop(page)).toBeGreaterThan(500);
  await page.waitForTimeout(120);
  expect(await viewportScrollTop(page)).toBeGreaterThan(500);
});

test("iPhone touchstart cannot be overwritten by a queued tab restore", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await setViewportScroll(page, 900);

  const geometry = await page.evaluate(() => {
    const queuedFrames = [];
    const originalRequestAnimationFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    };

    document.querySelector('.tab[data-view="items"]').click();
    const touchStart = new Event("touchstart", { bubbles: true, cancelable: true });
    Object.defineProperty(touchStart, "touches", {
      value: [{ clientX: 180, clientY: 620 }]
    });
    document.dispatchEvent(touchStart);
    window.scrollTo({ top: 620, left: 0, behavior: "auto" });

    const marker = document.querySelector('#itemsView [data-e2e-scroll-spacer]');
    const beforeFrame = marker.getBoundingClientRect().top;
    queuedFrames.splice(0).forEach((callback) => callback(performance.now()));
    const afterFrame = marker.getBoundingClientRect().top;
    const scrollTop = document.scrollingElement?.scrollTop || window.scrollY || 0;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    return { afterFrame, beforeFrame, scrollTop };
  });

  expect(Math.abs(geometry.afterFrame - geometry.beforeFrame)).toBeLessThanOrEqual(1);
  expect(geometry.scrollTop).toBeGreaterThan(500);
});

test("iPhone document momentum has only one painted packing root header layer", async ({ page }) => {
  await openApp(page);
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
  await expect(page.locator("html")).not.toHaveClass(/isolated-viewport-scroll/);
  const duplicateHeader = page.locator("[data-e2e-packing-header-fixture] .packing-root-header-row");
  await expect(duplicateHeader).toHaveCount(1);
  await expect(duplicateHeader).toBeHidden();
});

test("reverse iPhone scrolling keeps the sticky stack height stable", async ({ page }) => {
  await openApp(page);
  await page.locator("#searchInput").evaluate((input) => {
    input.value = "а";
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    input.blur();
  });
  await page.waitForTimeout(700);
  await addScrollableViewFixtures(page);

  const stickySnapshot = () => page.evaluate(() => {
    const controls = document.querySelector(".controls");
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      compact: document.body.classList.contains("compact-sticky-controls"),
      controlsHeight: Math.round(controls.getBoundingClientRect().height),
      controlsVariable: rootStyles.getPropertyValue("--sticky-controls-height").trim(),
      tabsVariable: rootStyles.getPropertyValue("--sticky-tabs-height").trim()
    };
  });

  for (const view of ["items", "bags", "packing"]) {
    await selectViewWithoutAutoScroll(page, view);
    await page.waitForTimeout(50);
    await expect.poll(async () => (await stickySnapshot()).compact).toBe(true);
    const baseline = await stickySnapshot();
    await setViewportScroll(page, 900);
    for (const top of [720, 520, 320, 120]) {
      await setViewportScroll(page, top);
      expect(await stickySnapshot()).toEqual(baseline);
    }
  }
});
