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
      if (view.querySelector("[data-e2e-scroll-spacer]")) return;
      const spacer = document.createElement("div");
      spacer.dataset.e2eScrollSpacer = "";
      spacer.style.height = "2600px";
      spacer.style.pointerEvents = "none";
      view.append(spacer);
    });
  });
}

test("iPhone accepts consecutive first taps on different main tabs", async ({ page }) => {
  await openApp(page);

  const itemsTab = page.locator('.tab[data-view="items"]');
  const bagsTab = page.locator('.tab[data-view="bags"]');
  const [itemsBox, bagsBox] = await Promise.all([
    itemsTab.boundingBox(),
    bagsTab.boundingBox()
  ]);
  expect(itemsBox).not.toBeNull();
  expect(bagsBox).not.toBeNull();

  await page.touchscreen.tap(
    itemsBox.x + itemsBox.width / 2,
    itemsBox.y + itemsBox.height / 2
  );
  await page.touchscreen.tap(
    bagsBox.x + bagsBox.width / 2,
    bagsBox.y + bagsBox.height / 2
  );

  await expect(bagsTab).toHaveClass(/\bactive\b/);
  await expect(itemsTab).not.toHaveClass(/\bactive\b/);
});

test("iPhone keeps the first fast scroll gesture native after a tab tap", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await page.locator('.tab[data-view="items"]').tap();

  const gesture = await page.evaluate(async () => {
    const target = document.querySelector("#itemsView");
    const marker = target.querySelector("[data-e2e-scroll-spacer]");
    const dispatchTouch = (type, clientY, touches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: touches ? [{ clientX: 180, clientY }] : []
      });
      Object.defineProperty(event, "changedTouches", {
        value: [{ clientX: 180, clientY }]
      });
      return target.dispatchEvent(event);
    };

    dispatchTouch("touchstart", 620, true);
    dispatchTouch("touchmove", 410, true);
    window.scrollTo({ top: 620, left: 0, behavior: "auto" });
    const beforeEnd = marker.getBoundingClientRect().top;
    const nativeEnd = dispatchTouch("touchend", 410, false);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const afterFrame = marker.getBoundingClientRect().top;
    return {
      afterFrame,
      beforeEnd,
      nativeEnd,
      scrollTop: document.scrollingElement?.scrollTop || window.scrollY || 0
    };
  });

  expect(gesture.nativeEnd).toBe(true);
  expect(Math.abs(gesture.afterFrame - gesture.beforeEnd)).toBeLessThanOrEqual(4);
  expect(gesture.scrollTop).toBeGreaterThan(500);
});

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

test("switching iPhone tabs does not write a programmatic viewport position", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await setViewportScroll(page, 620);

  const calls = await page.evaluate(() => {
    const originalScrollTo = window.scrollTo;
    const writes = [];
    window.scrollTo = (...args) => writes.push(args);
    document.querySelector('.tab[data-view="items"]').click();
    window.scrollTo = originalScrollTo;
    return writes;
  });

  expect(calls).toEqual([]);
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

test("one iPhone tap switches the main view without a hover-only intermediate state", async ({ page }) => {
  await openApp(page);
  const itemsTab = page.locator('.tab[data-view="items"]');

  await itemsTab.tap();

  await expect(itemsTab).toHaveClass(/active/);
  await expect(page.locator("#itemsView")).toBeVisible();
  await expect(page.locator("#packingView")).toBeHidden();
});

test("vertical iPhone gestures over a catalog photo never recenter its horizontal track", async ({ page }) => {
  await openApp(page);
  await selectViewWithoutAutoScroll(page, "items");
  await page.locator("#itemsView").evaluate((itemsView) => {
    const fixture = document.createElement("div");
    fixture.dataset.e2eCatalogPhotoTrack = "";
    fixture.className = "photo-gallery-track";
    itemsView.append(fixture);
  });

  const gesture = await page.locator("[data-e2e-catalog-photo-track]").evaluate((track) => {
    const horizontalWrites = [];
    track.scrollTo = (...args) => horizontalWrites.push(args);
    const dispatchTouch = (type, x, y, active) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: active ? [{ clientX: x, clientY: y }] : []
      });
      Object.defineProperty(event, "changedTouches", {
        value: [{ clientX: x, clientY: y }]
      });
      return track.dispatchEvent(event);
    };
    dispatchTouch("touchstart", 180, 620, true);
    dispatchTouch("touchmove", 184, 410, true);
    const nativeEnd = dispatchTouch("touchend", 185, 300, false);
    return { horizontalWrites, nativeEnd };
  });

  expect(gesture.nativeEnd).toBe(true);
  expect(gesture.horizontalWrites).toEqual([]);
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
    // Late startup work can rerender a view and replace test-only children.
    // Reattach the geometry fixture immediately before measuring this view.
    await addScrollableViewFixtures(page);
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
