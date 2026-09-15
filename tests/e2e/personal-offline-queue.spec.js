import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, legacyPhotoPayload,
  legacyLayoutId, nativeLegacyPhotoOutbox } from "../fixtures/personal-legacy-photo-browser-fixture.js";

test.use({ trace: "off", screenshot: "off", video: "off" });

test("large ordinary rename survives offline reload and sends once after reconnect", async ({ page, context }) => {
  test.setTimeout(90000);
  const payload = legacyPhotoPayload(), itemId = "offline-queue-item";
  payload.items[itemId] = { id: itemId, name: "Зарядное устройство", weight: 130, quantity: 1,
    containerId: "placed-bag", location: "Дом", category: "", categories: [], color: "", photos: [], note: "x".repeat(395000) };
  payload.containers["placed-bag"].itemIds = [itemId];
  const arrangement = payload.layouts[legacyLayoutId].arrangement;
  arrangement.items[itemId] = "placed-bag"; arrangement.itemQuantities[itemId] = 1;
  arrangement.containers["placed-bag"].itemIds = [itemId];
  arrangement.containers["placed-bag"].order = [{ type: "item", id: itemId }];
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { initialPayload: payload,
    validateBusinessIntent: body => expect(body.payload.items[itemId].name).toBe("Зарядное устройство офлайн") });
  const constrainStorage = () => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("bike-packing-personal-") && value.length > 65536)
        throw new DOMException("No space for another full queue record", "QuotaExceededError");
      return set.call(this, key, value);
    };
  };
  await context.addInitScript(constrainStorage); await page.evaluate(constrainStorage);
  await page.waitForLoadState("networkidle");
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => sessionStorage.getItem("queue-test-offline") !== "1" });
  });
  let offline = true;
  await page.route("**/letters-vniipo/api/**", route => offline ? route.abort("internetdisconnected") : route.fallback());
  await page.evaluate(() => {
    sessionStorage.setItem("queue-test-offline", "1");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => sessionStorage.getItem("queue-test-offline") !== "1" });
    dispatchEvent(new Event("offline"));
  });
  const item = page.locator(`#packingView [data-item-id="${itemId}"]`);
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Зарядное устройство офлайн");
  await page.locator("#itemName").blur();
  await page.locator("#saveItemBtn").click();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).record?.action.body.payload.items[itemId]?.name)
    .toBe("Зарядное устройство офлайн");
  const captured = await nativeLegacyPhotoOutbox(page), id = captured.record.action.operationId;
  expect(captured.pending).toBe(true); expect(f.posts).toHaveLength(0);
  const refs = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")));
  expect(refs.some(([, raw]) => JSON.parse(raw).personalJournalReference === 1)).toBe(true);
  expect(refs.every(([, raw]) => raw.length < 65536)).toBe(true);
  // The fixture models cached application resources during offline reload.
  // API access is aborted and navigator.onLine remains false across navigation.
  // Native service-worker cache availability is a separate physical-phone check.
  await page.reload(); await readyLegacyPhotoBrowser(page);
  await expect(page.locator(`#packingView [data-item-id="${itemId}"]`)).toContainText("Зарядное устройство офлайн");
  expect((await nativeLegacyPhotoOutbox(page)).record.action.operationId).toBe(id);
  expect(f.posts).toHaveLength(0);
  offline = false;
  await page.evaluate(() => { sessionStorage.removeItem("queue-test-offline"); dispatchEvent(new Event("online")); });
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length, { timeout: 30000 }).toBe(1);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  expect(f.posts[0].operationId).toBe(id);
  expect(f.payload.items[itemId].name).toBe("Зарядное устройство офлайн");
  await page.waitForLoadState("networkidle"); await page.reload(); await readyLegacyPhotoBrowser(page);
  expect((await nativeLegacyPhotoOutbox(page)).pending).toBe(false); expect(f.posts).toHaveLength(1);
  await f.flushErrors(); expect(f.errors).toEqual([]); expect(f.pageErrors).toEqual([]);
});

test.describe("private phone export, local storage only", () => {

  test("exact exported queue migrates and captures the isolated rename in real IndexedDB", async ({ page, context }) => {
    test.skip(!process.env.BIKE_PHONE_QUEUE_FILE, "Private local export is supplied explicitly");
    const exported = JSON.parse(await readFile(process.env.BIKE_PHONE_QUEUE_FILE, "utf8"));
    expect(exported.reasonCode).toBe("quota");
    const rows = exported.journalEntries.map(row => [row.key, row.value]);
    const root = path.resolve("src");
    await context.route("https://queue-fixture.test/**", async route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local queue check</title>" });
      const file = path.resolve(root, "." + decodeURIComponent(pathname));
      expect(file.startsWith(root + path.sep)).toBe(true);
      return route.fulfill({ contentType: "text/javascript", body: await readFile(file) });
    });
    await page.goto("https://queue-fixture.test/");
    const result = await page.evaluate(async ({ rows, draft }) => {
      for (const [key, raw] of rows) localStorage.setItem(key, raw);
      const prefix = "bike-packing-personal-save-v1:";
      const binding = JSON.parse(decodeURIComponent(rows[0][0].slice(prefix.length).split(":")[0]));
      const { createPersonalJournalStorage } = await import("/storage/personal-journal-storage.js");
      const { createPersonalSaveOutbox } = await import("/sync/personal-save-outbox.js");
      const storage = await createPersonalJournalStorage(), outbox = createPersonalSaveOutbox({ storage, ...binding });
      const before = outbox.recover(), snapshot = structuredClone(outbox.recoverSnapshot());
      const itemId = "item-1784226874957";
      if (!draft.items[itemId] || !snapshot.items[itemId]) throw Error("Expected draft item missing");
      // Only this explicit rename is replayed in the isolated test. The rest of
      // the memory draft is not imported and no live API route exists here.
      snapshot.items[itemId].name = draft.items[itemId].name;
      const body = { payload: structuredClone(outbox.confirmedBase().payload), baseStateRevision: outbox.confirmedBase().stateRevision };
      body.payload.items[itemId].name = draft.items[itemId].name;
      const record = await outbox.capture({ snapshot, body });
      const bytes = rows.reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0);
      sessionStorage.setItem("expected-operation", record.action.operationId);
      sessionStorage.setItem("expected-binding", JSON.stringify(binding));
      return { bytes, successor: record.action.operationId !== before.action.operationId,
        saved: outbox.recoverSnapshot().items[itemId].name === draft.items[itemId].name,
        refsBytes: Object.entries(localStorage).reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0) };
    }, { rows, draft: exported.unconfirmedMemoryDraft });
    expect(result.bytes).toBeGreaterThan(2.2 * 1024 * 1024);
    expect(result.successor && result.saved).toBe(true); expect(result.refsBytes).toBeLessThan(10000);
    await page.reload();
    expect(await page.evaluate(async () => {
      const { createPersonalJournalStorage } = await import("/storage/personal-journal-storage.js");
      const { createPersonalSaveOutbox } = await import("/sync/personal-save-outbox.js");
      const storage = await createPersonalJournalStorage();
      const outbox = createPersonalSaveOutbox({ storage, ...JSON.parse(sessionStorage.getItem("expected-binding")) });
      return outbox.hasPending() && outbox.recover().action.operationId === sessionStorage.getItem("expected-operation");
    })).toBe(true);
  });
});
