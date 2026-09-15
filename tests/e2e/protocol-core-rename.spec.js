import { test, expect } from "@playwright/test";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, legacyPhotoPayload,
  legacyLayoutId, legacyBagId, nativeLegacyPhotoOutbox } from "../fixtures/personal-legacy-photo-browser-fixture.js";

// Normal release bundle, actual item edit dialog; isolated synthetic API/user.
// The paired HTTP/MySQL check is a separate verification of the real server.
for (const loseAck of [false, true]) test(`core item rename, unchanged photos, cold recovery; lost ACK=${loseAck}`, async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = legacyPhotoPayload(), itemId = "core-rename-item";
  payload.items[itemId] = { id: itemId, name: "Фляга до переименования", weight: 80,
    quantity: 1, containerId: "placed-bag", location: "Велосипед", category: "", categories: [], color: "", note: "", photos: [] };
  payload.containers["placed-bag"].itemIds = [itemId];
  const arrangement = payload.layouts[legacyLayoutId].arrangement;
  arrangement.items[itemId] = "placed-bag";
  arrangement.itemQuantities[itemId] = 1;
  arrangement.containers["placed-bag"].itemIds = [itemId];
  arrangement.containers["placed-bag"].order = [{ type: "item", id: itemId }];
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload, loseAck,
    validateBusinessIntent: body => {
      expect(body.payload.items[itemId].name).toBe("Походная фляга");
      expect(body.payload.items[itemId].weight).toBe(80);
      expect(Object.keys(body.payload.items)).toEqual([itemId]);
      for (const key of ["userPlacement", "userDeletion", "photoResults", "archiveImport"]) expect(body[key]).toBeUndefined();
    },
  });
  const item = page.locator(`#packingView [data-item-id="${itemId}"]`);
  await expect(item).toContainText("Фляга до переименования");
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Походная фляга");
  await page.locator("#itemName").blur();
  await page.locator("#saveItemBtn").click();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length, { timeout: 30000 }).toBe(1);
  await expect.poll(() => f.payload.items[itemId].name).toBe("Походная фляга");
  const id = f.posts[0].operationId;
  expect(f.posts[0].kind).toBe("list.update");
  if (loseAck) {
    await expect.poll(() => f.receiptReads.includes(id)).toBe(true);
    expect((await nativeLegacyPhotoOutbox(page)).pending).toBe(true);
    // Another failed load cannot turn an unknown receipt into permission to send.
    await page.reload(); await readyLegacyPhotoBrowser(page);
    expect(f.posts).toHaveLength(1);
    f.loseAck = false; f.hideReceipts = false;
  }
  await page.reload(); await readyLegacyPhotoBrowser(page);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(page.locator(`#packingView [data-item-id="${itemId}"]`)).toContainText("Походная фляга");
  expect((await nativeLegacyPhotoOutbox(page)).pending).toBe(false);
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0].operationId).toBe(id);
  expect(f.payload.containers[legacyBagId].photos).toEqual(payload.containers[legacyBagId].photos);
  await f.flushErrors(); expect(f.errors).toEqual([]); expect(f.pageErrors).toEqual([]);
});
