import { devices, expect, test } from "@playwright/test";
import { openApp, prepareIsolatedRussianGuest } from "./guest-test-helpers.js";

test.use({ ...devices["iPhone 15"] });

test.beforeEach(async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
});

test("iPhone resizes the note and scrolls categories only with the side control", async ({ page }) => {
  await openApp(page);
  await page.locator('.tab[data-view="items"]').click();
  await page.locator("#addItemBtn").click();
  await expect(page.locator("#itemDialog")).toBeVisible();

  const categoryList = page.locator("#itemCategoryList");
  await categoryList.evaluate((list) => {
    list.replaceChildren(...Array.from({ length: 80 }, (_, index) => {
      const option = document.createElement("label");
      option.className = "category-option";
      option.dataset.categorySearchOption = "";
      option.dataset.categorySearchLabel = `Категория ${index + 1}`;
      option.innerHTML = `<input type="checkbox" value="category-${index + 1}"><span data-category-search-label-text>Категория ${index + 1}</span>`;
      return option;
    }));
  });

  const categoryScroll = page.locator("#itemCategoryScroll");
  await expect(categoryScroll).toBeVisible();
  await expect.poll(() => categoryScroll.evaluate((control) => Number(control.max))).toBeGreaterThan(100);

  const dialogCard = page.locator("#itemDialog .dialog-card");
  await expect(dialogCard).toHaveJSProperty("scrollTop", 0);
  const sliderTouchWasBlocked = await categoryScroll.evaluate((control) => {
    const dispatchTouch = (type, clientY) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "touches", {
        value: [{ clientX: 360, clientY }]
      });
      control.dispatchEvent(event);
      return event.defaultPrevented;
    };
    dispatchTouch("touchstart", 300);
    return dispatchTouch("touchmove", 360);
  });
  expect(sliderTouchWasBlocked).toBe(false);

  await categoryScroll.evaluate((control) => {
    control.value = String(Math.round(Number(control.max) * 0.65));
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect.poll(() => categoryList.evaluate((list) => list.scrollTop)).toBeGreaterThan(100);

  await categoryScroll.evaluate((control) => {
    control.value = "0";
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const cardTopBefore = await dialogCard.evaluate((card) => card.scrollTop);
  await expect(categoryList).toHaveCSS("overflow-y", "hidden");
  await dialogCard.evaluate((card) => {
    card.scrollTop += 360;
    card.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(() => dialogCard.evaluate((card) => card.scrollTop)).toBeGreaterThan(cardTopBefore + 40);
  await expect(categoryList).toHaveJSProperty("scrollTop", 0);

  const note = page.locator("#itemNote");
  const resizeHandle = page.locator("#itemNoteResizeHandle");
  await resizeHandle.scrollIntoViewIfNeeded();
  const initialHeight = await note.evaluate((textarea) => textarea.getBoundingClientRect().height);
  await resizeHandle.focus();
  await resizeHandle.press("ArrowDown");
  await resizeHandle.press("ArrowDown");
  await resizeHandle.press("ArrowDown");
  await expect.poll(() => note.evaluate((textarea) => textarea.getBoundingClientRect().height)).toBeGreaterThan(initialHeight + 80);
});
