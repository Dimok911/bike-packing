import { expect, test } from "@playwright/test";
import { prepareIsolatedRussianGuest, openApp, createEmptyLayout, createGuestWorkspace } from "./guest-test-helpers.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d7e4df"/></svg>';

async function transfer(page, { url = "", text = "" } = {}) {
  return page.evaluateHandle(({ svg, url, text }) => {
    const data = new DataTransfer();
    if (url) data.setData("text/uri-list", url);
    else if (text) data.setData("text/plain", text);
    else data.items.add(new File([svg], "bike.svg", { type: "image/svg+xml" }));
    return data;
  }, { svg, url, text });
}

async function dropPhoto(page, zone) {
  const dataTransfer = await transfer(page);
  await zone.dispatchEvent("dragenter", { dataTransfer });
  await expect(zone).toHaveClass(/photo-drop-active/);
  await zone.dispatchEvent("dragover", { dataTransfer });
  await zone.dispatchEvent("drop", { dataTransfer });
  await expect(zone).not.toHaveClass(/photo-drop-active/);
  await dataTransfer.dispose();
}

test("layout accepts file drop, pasted image, and clipboard URL through the existing importer", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  let importedUrl = "";
  await page.route("**/bike-packing/image-source", (route) => {
    importedUrl = route.request().postDataJSON().url;
    return route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await openApp(page);
  await createEmptyLayout(page, "Способы загрузки");
  await page.locator("#editLayoutBtn").click();
  const editor = page.locator("[data-layout-media-editor]");
  await dropPhoto(page, editor);
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(1);

  const clipboardData = await transfer(page);
  await editor.evaluate((element, data) => element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })), clipboardData);
  await clipboardData.dispose();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(2);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      read: async () => [{ types: ["text/plain"], getType: async () => new Blob(["https://photos.example/bike.jpg"], { type: "text/plain" }) }]
    } });
  });
  await editor.locator(".photo-paste-hint").click();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(3);
  expect(importedUrl).toBe("https://photos.example/bike.jpg");
  // All entry points obey the same per-record limit.
  await dropPhoto(page, editor);
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(3);
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
});

test("item and bag photo fields highlight and accept dropped files", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  const { container, item } = await createGuestWorkspace(page, { layoutName: "Перетаскивание", containerName: "Сумка", itemName: "Спальник" });
  await item.locator(".item-title").click();
  const itemZone = page.locator("#itemDialog .item-photo-field");
  await dropPhoto(page, itemZone);
  await expect(itemZone.locator("[data-photo-open]")).toHaveCount(1);
  await page.locator("#saveItemBtn").click();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await container.getByRole("heading", { name: "Сумка", exact: true }).click();
  const bagZone = page.locator("#rootContainerDialog .item-photo-field");
  await dropPhoto(page, bagZone);
  await expect(bagZone.locator("[data-photo-open]")).toHaveCount(1);
  await page.locator("#saveRootContainerBtn").click();
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
});

test("layout accepts a dropped image URL, and pasting notes stays text", async ({ page }) => {
  await prepareIsolatedRussianGuest(page);
  await page.route("**/bike-packing/image-source", (route) => route.fulfill({ contentType: "image/svg+xml", body: svg }));
  await openApp(page);
  await createEmptyLayout(page, "Ссылки и заметки");
  await page.locator("#editLayoutBtn").click();
  const editor = page.locator("[data-layout-media-editor]");
  const dataTransfer = await transfer(page, { url: "https://photos.example/bike.jpg" });
  await editor.dispatchEvent("drop", { dataTransfer });
  await dataTransfer.dispose();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(1);
  const clipboardData = await transfer(page, { text: "https://photos.example/notes.jpg" });
  await page.locator("#layoutEditNotes").evaluate((element, data) => element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data })), clipboardData);
  await clipboardData.dispose();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(1);
});
