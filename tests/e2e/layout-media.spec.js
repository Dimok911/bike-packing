import { expect, test } from "@playwright/test";
import { prepareIsolatedRussianGuest, openApp, createEmptyLayout, waitForApp } from "./guest-test-helpers.js";

test("layout photos: captions, reorder, fullscreen, persistence, discard and video validation", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  await openApp(page);
  await createEmptyLayout(page, "Фото поездки");
  await page.locator("#editLayoutBtn").click();
  const editor = page.locator("[data-layout-media-editor]");
  const png = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d7e4df"/></svg>');
  await editor.locator("input[type=file]").first().setInputFiles([
    { name: "bike.svg", mimeType: "image/svg+xml", buffer: png },
    { name: "bags.svg", mimeType: "image/svg+xml", buffer: png }
  ]);
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(2);
  await editor.locator("[data-layout-photo-caption]").nth(0).fill("Велосипед целиком");
  await editor.locator("[data-layout-photo-caption]").nth(1).fill("Упакованные сумки");
  await editor.locator('[data-layout-photo-move="-1"]').nth(1).click();
  await expect(editor.locator("[data-layout-photo-caption]").first()).toHaveValue("Упакованные сумки");
  await page.locator("#layoutEditNotes").fill("Заметки сохраняются");
  await editor.locator("[data-layout-video]").fill("javascript:alert(1)");
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await editor.locator("[data-layout-video]").fill("https://youtu.be/example");
  await expect(editor.locator("[data-layout-video-link]")).toHaveAttribute("href", "https://youtu.be/example");
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.reload();
  await waitForApp(page);
  await page.locator("#layoutSelect").selectOption({ label: "Фото поездки" });
  await page.locator("#editLayoutBtn").click();
  await expect(editor.locator("[data-layout-photo-caption]").first()).toHaveValue("Упакованные сумки");
  await expect(page.locator("#layoutEditNotes")).toHaveValue("Заметки сохраняются");
  await expect(editor.locator("[data-layout-video]")).toHaveValue("https://youtu.be/example");
  await editor.locator("[data-photo-open]").first().click();
  await expect(page.locator(".photo-lightbox-image")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await editor.locator("[data-layout-photo-remove]").first().click();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(1);
  await page.locator("#layoutEditDialog header button").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmCancelBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.locator("#editLayoutBtn").click();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/layout-media-mobile.png" });
  expect(await editor.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
});
