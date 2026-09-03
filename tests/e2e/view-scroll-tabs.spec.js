import { devices, expect, test } from "@playwright/test";
import {
  createEmptyLayout,
  openApp,
  prepareIsolatedRussianGuest
} from "./guest-test-helpers.js";

test.use({ ...devices["iPhone 15"] });

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

async function selectViewWithoutAutoScroll(page, view) {
  await page.locator(`.tab[data-view="${view}"]`).evaluate((tab) => tab.click());
}

async function viewportScrollTop(page) {
  return page.evaluate(() => {
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    return host?.scrollTop || document.scrollingElement?.scrollTop || window.scrollY || 0;
  });
}

async function setViewportScroll(page, top) {
  await page.evaluate((nextTop) => {
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    (host || window).scrollTo({ top: nextTop, left: 0, behavior: "auto" });
  }, top);
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

async function setFixtureViewportScroll(page, top) {
  await expect.poll(() => page.evaluate(async (nextTop) => {
    document.querySelectorAll("#packingView, #itemsView, #bagsView, #settingsView").forEach((view) => {
      if (view.querySelector("[data-e2e-scroll-spacer]")) return;
      const spacer = document.createElement("div");
      spacer.dataset.e2eScrollSpacer = "";
      spacer.style.height = "2600px";
      spacer.style.pointerEvents = "none";
      view.append(spacer);
    });
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    (host || window).scrollTo({ top: nextTop, left: 0, behavior: "auto" });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const actual = host?.scrollTop || document.scrollingElement?.scrollTop || window.scrollY || 0;
    return Math.abs(actual - nextTop);
  }, top), { timeout: 10_000 }).toBeLessThanOrEqual(8);
  return viewportScrollTop(page);
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
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    (host || window).scrollTo({ top: 620, left: 0, behavior: "auto" });
    const beforeEnd = marker.getBoundingClientRect().top;
    const nativeEnd = dispatchTouch("touchend", 410, false);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const afterFrame = marker.getBoundingClientRect().top;
    return {
      afterFrame,
      beforeEnd,
      nativeEnd,
      scrollTop: host?.scrollTop || document.scrollingElement?.scrollTop || window.scrollY || 0
    };
  });

  expect(gesture.nativeEnd).toBe(true);
  expect(Math.abs(gesture.afterFrame - gesture.beforeEnd)).toBeLessThanOrEqual(4);
  expect(gesture.scrollTop).toBeGreaterThan(500);
});

test("iPhone keeps packing isolated and ordinary views on document momentum", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await expect(page.locator("html")).toHaveClass(/isolated-viewport-scroll/);
  await expect(page.locator(".app[data-viewport-scroll-host]")).toHaveCount(1);

  for (const view of ["items", "bags", "settings"]) {
    await selectViewWithoutAutoScroll(page, view);
    await expect(page.locator("html")).not.toHaveClass(/isolated-viewport-scroll/);
    await expect(page.locator(".app[data-viewport-scroll-host]")).toHaveCount(0);
    await setViewportScroll(page, 0);
    let previousTop = 0;
    for (let index = 0; index < 3; index += 1) {
      await page.evaluate(() => {
        const host = document.querySelector(".app[data-viewport-scroll-host]");
        (host || window).scrollBy({ top: 420, left: 0, behavior: "auto" });
      });
      await expect.poll(() => viewportScrollTop(page)).toBeGreaterThan(previousTop + 80);
      previousTop = await viewportScrollTop(page);
      await page.waitForTimeout(120);
      expect(await viewportScrollTop(page)).toBeGreaterThan(previousTop - 8);
    }
    expect(previousTop).toBeGreaterThan(240);
  }
});

test("iPhone packing keeps a wobbly vertical gesture native", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);

  const gesture = await page.evaluate(() => {
    const surface = document.querySelector(".kanban-board-touch-surface");
    const board = document.querySelector("#packingView .board");
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    if (!surface || !board || !host) return null;
    const dispatchTouch = (type, x, y, active) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const point = { clientX: x, clientY: y, identifier: 81 };
      Object.defineProperty(event, "touches", { value: active ? [point] : [] });
      Object.defineProperty(event, "changedTouches", { value: [point] });
      return surface.dispatchEvent(event);
    };
    const initialLeft = board.scrollLeft;
    const startNative = dispatchTouch("touchstart", 200, 700, true);
    const wobbleNative = dispatchTouch("touchmove", 194, 696, true);
    const verticalNative = dispatchTouch("touchmove", 192, 520, true);
    host.scrollTop = 420;
    const endNative = dispatchTouch("touchend", 192, 520, false);
    return {
      boardLeft: board.scrollLeft,
      endNative,
      hostOverflow: getComputedStyle(host).overflowY,
      initialLeft,
      scrollTop: host.scrollTop,
      startNative,
      verticalNative,
      wobbleNative
    };
  });

  expect(gesture).not.toBeNull();
  expect(gesture.startNative).toBe(true);
  expect(gesture.wobbleNative).toBe(true);
  expect(gesture.verticalNative).toBe(true);
  expect(gesture.endNative).toBe(true);
  expect(gesture.boardLeft).toBe(gesture.initialLeft);
  expect(gesture.hostOverflow).not.toBe("hidden");
  expect(gesture.scrollTop).toBeGreaterThan(300);
});

test("iPhone ordinary views accept a browser-routed vertical scroll gesture", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);

  for (const view of ["items", "bags", "settings"]) {
    await selectViewWithoutAutoScroll(page, view);
    await setViewportScroll(page, 0);
    const geometry = await page.evaluate(() => ({
      appIsHost: document.querySelector(".app")?.hasAttribute("data-viewport-scroll-host"),
      clientHeight: document.scrollingElement?.clientHeight || 0,
      overflowY: getComputedStyle(document.documentElement).overflowY,
      scrollHeight: document.scrollingElement?.scrollHeight || 0
    }));
    expect(geometry.appIsHost).toBe(false);
    expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight + 1000);
    expect(geometry.overflowY).not.toBe("hidden");

    const viewBox = await page.locator(`#${view}View`).boundingBox();
    expect(viewBox).not.toBeNull();
    await page.evaluate(() => {
      window.__e2eDocumentScrollSamples = [];
      let remainingFrames = 90;
      const captureFrame = () => {
        window.__e2eDocumentScrollSamples.push(
          document.scrollingElement?.scrollTop || window.scrollY || 0
        );
        remainingFrames -= 1;
        if (remainingFrames > 0) requestAnimationFrame(captureFrame);
      };
      requestAnimationFrame(captureFrame);
    });
    await page.mouse.move(viewBox.x + Math.min(80, viewBox.width / 2), Math.min(700, viewBox.y + 300));
    await page.keyboard.press("PageDown");
    await expect.poll(() => viewportScrollTop(page)).toBeGreaterThan(120);
    await page.waitForTimeout(120);
    const samples = await page.evaluate(() => window.__e2eDocumentScrollSamples || []);
    expect(samples.length).toBeGreaterThan(0);
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]).toBeGreaterThanOrEqual(samples[index - 1] - 2);
    }
  }
});

test("iPhone back-to-top reaches zero on touchstart while document momentum is active", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await selectViewWithoutAutoScroll(page, "items");
  await setViewportScroll(page, 900);

  const button = page.locator("[data-catalog-back-to-top]");
  await expect(button).toBeVisible();
  const activation = await button.evaluate((target) => {
    const originalScrollTo = window.scrollTo;
    const writes = [];
    window.scrollTo = (...args) => {
      writes.push(args[0]);
      return originalScrollTo.apply(window, args);
    };
    const dispatchTouch = (type, active) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const point = { clientX: 24, clientY: 180 };
      Object.defineProperty(event, "touches", { value: active ? [point] : [] });
      Object.defineProperty(event, "changedTouches", { value: [point] });
      return target.dispatchEvent(event);
    };

    try {
      window.dispatchEvent(new Event("scroll"));
      const touchStartWasNative = dispatchTouch("touchstart", true);
      const writesAtTouchStart = writes.map((entry) => Number(entry?.top));
      const topAtTouchStart = document.scrollingElement?.scrollTop || window.scrollY || 0;
      dispatchTouch("touchend", false);
      return {
        topAtTouchStart,
        totalWrites: writes.length,
        touchStartWasNative,
        writesAtTouchStart
      };
    } finally {
      window.scrollTo = originalScrollTo;
    }
  });

  expect(activation.touchStartWasNative).toBe(false);
  expect(activation.writesAtTouchStart).toEqual([900, 0]);
  expect(activation.topAtTouchStart).toBe(0);
  expect(activation.totalWrites).toBe(2);
});

test("iPhone back-to-top recovers a platform-consumed momentum tap", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await selectViewWithoutAutoScroll(page, "items");
  await setViewportScroll(page, 900);

  const button = page.locator("[data-catalog-back-to-top]");
  await expect(button).toBeVisible();
  await button.evaluate((target) => {
    const nativeMatches = target.matches.bind(target);
    target.matches = (selector) => selector === ":hover"
      ? Boolean(window.__e2eBackToTopHovered)
      : nativeMatches(selector);
    window.__e2eBackToTopHovered = false;
  });
  await page.locator("#itemsView").evaluate((surface) => {
    const dispatchTouch = (type, x, y, active) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const point = { clientX: x, clientY: y };
      Object.defineProperty(event, "touches", { value: active ? [point] : [] });
      Object.defineProperty(event, "changedTouches", { value: [point] });
      surface.dispatchEvent(event);
    };
    dispatchTouch("touchstart", 180, 620, true);
    dispatchTouch("touchmove", 182, 380, true);
    dispatchTouch("touchend", 182, 380, false);
  });

  await button.evaluate((target) => {
    window.__e2eBackToTopHovered = true;
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scrollend"));
  });
  await expect.poll(() => viewportScrollTop(page)).toBe(0);
});

test("iPhone note match opens a centered marker without native selection", async ({ page }) => {
  const query = "запасные перчатки";
  const note = [
    ...Array.from({ length: 18 }, (_, index) => `Строка подготовки ${index + 1}.`),
    `${query} лежат в боковом кармане`,
    ...Array.from({ length: 12 }, (_, index) => `Строка маршрута ${index + 1}.`)
  ].join("\n");
  await openApp(page);
  await createEmptyLayout(page, "Маркер заметки");
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#rootContainerName").fill("Тестовая сумка");
  await page.locator("#saveRootContainerBtn").evaluate((button) => button.click());
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
  const container = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Тестовая сумка" });
  await expect(container).toHaveCount(1);
  await container.locator("[data-add-to-container]").click();
  await page.locator("#createItemForContainerBtn").click();
  await page.locator("#itemName").fill("Вещь с заметкой");
  await page.locator("#saveItemBtn").evaluate((button) => button.click());
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  const item = container.locator("[data-item-id]").filter({ hasText: "Вещь с заметкой" });
  await expect(item).toHaveCount(1);

  await item.locator(".item-title-hitarea").tap();
  await page.locator("#itemNote").fill(note);
  await page.locator("#saveItemBtn").evaluate((button) => button.click());
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await page.locator('.tab[data-view="items"]').tap();
  await page.locator("#searchInput").fill(query);
  await page.locator("#itemsView .search-note-match-badge").tap();

  const textarea = page.locator("#itemNote");
  const marker = page.locator("#itemDialog .note-search-match-marker");
  await expect(page.locator("#itemDialog")).toBeVisible();
  await expect(textarea).not.toBeFocused();
  await expect(marker).toBeVisible();
  await expect(marker).toHaveText(query);
  await expect(textarea).toHaveJSProperty("selectionStart", note.indexOf(query) + query.length);
  await expect(textarea).toHaveJSProperty("selectionEnd", note.indexOf(query) + query.length);
  const geometry = await textarea.evaluate((element) => {
    const fieldRect = element.closest(".note-field").getBoundingClientRect();
    const dialogRect = element.closest("dialog").getBoundingClientRect();
    const markerRect = element.closest(".note-field")
      .querySelector(".note-search-match-marker")
      .getBoundingClientRect();
    const textareaRect = element.getBoundingClientRect();
    return {
      centerDelta: Math.abs((fieldRect.top + fieldRect.bottom - dialogRect.top - dialogRect.bottom) / 2),
      dialogHeight: dialogRect.height,
      markerBottom: markerRect.bottom,
      markerTop: markerRect.top,
      textareaBottom: textareaRect.bottom,
      textareaTop: textareaRect.top
    };
  });
  expect(geometry.centerDelta).toBeLessThan(geometry.dialogHeight * 0.25);
  expect(geometry.markerTop).toBeGreaterThanOrEqual(geometry.textareaTop - 1);
  expect(geometry.markerBottom).toBeLessThanOrEqual(geometry.textareaBottom + 1);
});

test("switching iPhone tabs does not write a programmatic viewport position", async ({ page }) => {
  await openApp(page);
  await addScrollableViewFixtures(page);
  await setViewportScroll(page, 620);

  const calls = await page.evaluate(() => {
    const originalScrollTo = window.scrollTo;
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    const originalHostScrollTo = host?.scrollTo;
    const writes = [];
    window.scrollTo = (...args) => writes.push(args);
    if (host) host.scrollTo = (...args) => writes.push(args);
    document.querySelector('.tab[data-view="items"]').click();
    window.scrollTo = originalScrollTo;
    if (host) host.scrollTo = originalHostScrollTo;
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
    const host = document.querySelector(".app[data-viewport-scroll-host]");
    (host || window).scrollTo({ top: 620, left: 0, behavior: "auto" });
  });

  await expect.poll(() => viewportScrollTop(page)).toBeGreaterThan(500);
  await page.waitForTimeout(120);
  expect(await viewportScrollTop(page)).toBeGreaterThan(500);
});

test("one iPhone tap switches the main view without a hover-only intermediate state", async ({ page }) => {
  await openApp(page);
  const itemsTab = page.locator('.tab[data-view="items"]');

  const touchEndWasNative = await itemsTab.evaluate((tab) => {
    const dispatchTouch = (type, active) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      const point = { clientX: 120, clientY: 120 };
      Object.defineProperty(event, "touches", { value: active ? [point] : [] });
      Object.defineProperty(event, "changedTouches", { value: [point] });
      return tab.dispatchEvent(event);
    };
    tab.focus();
    dispatchTouch("touchstart", true);
    return dispatchTouch("touchend", false);
  });

  expect(touchEndWasNative).toBe(false);
  await expect(itemsTab).toHaveClass(/active/);
  await expect(itemsTab).not.toBeFocused();
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

test("iPhone isolated momentum has only one painted packing root header layer", async ({ page }) => {
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
  await expect(page.locator("html")).toHaveClass(/isolated-viewport-scroll/);
  const duplicateHeader = page.locator("[data-e2e-packing-header-fixture] .packing-root-header-row");
  await expect(duplicateHeader).toHaveCount(1);
  await expect(duplicateHeader).toBeHidden();
});

test("iPhone 20% packing zoom removes the invisible horizontal tail", async ({ page }) => {
  await openApp(page);

  const geometry = await page.evaluate(async () => {
    const packingView = document.querySelector("#packingView");
    packingView.innerHTML = `<div class="board">${Array.from({ length: 4 }, (_, index) => (
      `<article class="container-card" data-root-container-id="zoom-${index}" style="width: 360px"><header>Сумка ${index + 1}</header></article>`
    )).join("")}</div>`;
    const board = packingView.querySelector(".board");
    const selector = ":scope > .container-card, :scope > .packing-add-root-card, :scope > .comparison-root";
    board.dataset.packingBoardZoom = "0.2";
    board.dataset.packingBoardBasePaddingRight = "12";
    board.style.setProperty("--packing-board-zoom", "0.2");
    board.style.setProperty("--packing-board-base-column-width", "360px");
    board.style.gridAutoColumns = "72px";
    board.style.gap = "2.4px";
    board.classList.add("packing-board-zoom-active");
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => setTimeout(resolve, 180));

    const boardRect = board.getBoundingClientRect();
    const visualRight = Math.max(...[...board.querySelectorAll(selector)]
      .map((target) => target.getBoundingClientRect().right));
    const rawMaxScroll = Math.max(0, board.scrollWidth - board.clientWidth);
    return {
      barHidden: document.querySelector("#kanbanScrollbar").classList.contains("hidden"),
      bodyClaimsScrollbar: document.body.classList.contains("has-fixed-kanban-scroll"),
      clientRight: boardRect.right,
      logicalMaxScroll: Math.max(0, visualRight - boardRect.left + 12 - board.clientWidth),
      rawMaxScroll,
      visualRight
    };
  });

  expect(geometry.rawMaxScroll).toBeGreaterThan(40);
  expect(geometry.logicalMaxScroll).toBe(0);
  expect(geometry.visualRight).toBeLessThanOrEqual(geometry.clientRight + 1);
  expect(geometry.barHidden).toBe(true);
  expect(geometry.bodyClaimsScrollbar).toBe(false);
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
    await setFixtureViewportScroll(page, 900);
    for (const top of [720, 520, 320, 120]) {
      await setFixtureViewportScroll(page, top);
      expect(await stickySnapshot()).toEqual(baseline);
    }
  }
});
