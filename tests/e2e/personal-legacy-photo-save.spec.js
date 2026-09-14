import { test, expect } from "@playwright/test";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, nativeLegacyPhotoOutbox, seedLegacyPhotoPendingAction,
  assertLegacyPhotoRowsPreserved, legacyLayoutId, legacyBagId, legacyPhotoBinding } from "../fixtures/personal-legacy-photo-browser-fixture.js";

// These cases consume the normal release build, with no source transforms or
// lexical app hooks. Every API response belongs to an isolated synthetic user.
test.setTimeout(120000);
test.use({ screenshot: "off" });

test.afterEach(async ({ page }, info) => {
  if (!page.legacyPhotoFixture) return;
  const f = page.legacyPhotoFixture;
  await f.flushErrors();
  if (info.status === info.expectedStatus && !f.errors.length && !f.pageErrors.length) {
    expect(f.errors).toEqual([]); return;
  }
  await info.attach("isolated-legacy-photo-evidence", { contentType: "application/json", body: JSON.stringify({
    calls: f.calls, posts: f.posts, receipts: [...f.receipts], captured: f.captured, initial: f.initial, payload: f.payload,
    native: await nativeLegacyPhotoOutbox(page).catch(error => ({ error: error.message })), errors: f.errors, browserErrors: f.browserErrors, pageErrors: f.pageErrors
  }, null, 2) });
  if (info.status === info.expectedStatus) expect(f.errors).toEqual([]);
});

async function addExistingBag(page) {
  await page.locator('[data-view="packing"]').click();
  await page.locator("[data-add-packing-root]").click();
  await page.locator(`[data-add-layout-root="${legacyBagId}"]`).click();
  await expect(page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`)).toHaveCount(1);
}

async function green(page, f, revision) {
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.revision, { timeout: 30000 }).toBe(revision);
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).pending, { timeout: 30000 }).toBe(false);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.confirmed.stateRevision).toBe(revision);
  expect(native.confirmed.payload).toEqual(personalBusinessPayload(f.payload));
  assertLegacyPhotoRowsPreserved(f.initial, f.payload);
}

async function reload(page) { await page.reload(); await readyLegacyPhotoBrowser(page); }

function exactOriginalPost(post, record) {
  expect(post.operationId).toBe(record.action.operationId);
  expect(post.body).toEqual(record.action.body);
  expect(post.listId).toBe(record.action.listId);
  expect(post.expectedActorId).toBe(record.action.actorId);
}

test("release legacy photos first cold placement has merge base and add/remove remains green", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  expect(f.posts).toEqual([]); expect((await nativeLegacyPhotoOutbox(page)).record).toBeNull();
  // A real reload loses the memory-only initial baseline. The equal cached
  // mirror may not substitute for the new authenticated full server read.
  const beforeReload = f.calls.length;
  await reload(page);
  expect(f.posts).toEqual([]);
  expect(f.calls.slice(beforeReload).some(call => call.method === "GET"
    && call.path === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`)).toBe(true);
  // The synthetic backend refuses changed legacy references independently.
  const corrupt = structuredClone(f.initial); corrupt.containers[legacyBagId].photos.reverse();
  expect(() => assertLegacyPhotoRowsPreserved(f.initial, corrupt)).toThrow();
  await addExistingBag(page); await green(page, f, 1583);
  expect(f.posts).toHaveLength(1);
  const first = f.captured[0].record;
  expect(first.mergeBase).toEqual({ stateRevision: 1582, payload: personalBusinessPayload(f.initial) });
  exactOriginalPost(f.posts[0], first);
  expect(first.action.body.userPlacement).toMatchObject({ action: "link-root", ids: [legacyBagId] });
  expect(f.payload.layouts[legacyLayoutId].arrangement.rootContainerIds).toEqual(["placed-bag", legacyBagId]);
  await reload(page);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced");
  const bag = page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`);
  await bag.getByRole("heading", { name: "Сумка с четырьмя фотографиями", exact: true }).click();
  await expect(page.locator("#rootContainerPhotoPreview img")).toHaveCount(4);
  await page.locator("#rootContainerRemoveFromLayoutBtn").click(); await page.locator("#confirmOkBtn").click();
  await green(page, f, 1584);
  expect(f.posts).toHaveLength(2); expect(f.posts[1].body.userPlacement.action).toBe("remove-container");
  expect(f.payload.layouts[legacyLayoutId].arrangement.rootContainerIds).toEqual(["placed-bag"]);
  expect(f.payload.containers[legacyBagId].photos).toEqual(f.initial.containers[legacyBagId].photos);
  await reload(page);
  await expect(page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`)).toHaveCount(0);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced");
  expect(f.posts).toHaveLength(2); expect(f.errors).toEqual([]);
});

test("release legacy pending action without merge base uses fresh same revision and unchanged UUID once", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  expect(f.posts).toEqual([]);
  const original = await seedLegacyPhotoPendingAction(page);
  expect(original.record.mergeBase).toBeUndefined();
  const beforeReload = f.calls.length;
  await reload(page); await green(page, f, 1583);
  expect(f.posts).toHaveLength(1); exactOriginalPost(f.posts[0], original.record);
  const atDispatch = f.captured[0];
  expect(atDispatch.record.mergeBase).toBeUndefined();
  for (const entry of original.entries) expect(atDispatch.entries).toContainEqual(entry);
  const reads = f.calls.slice(beforeReload), postIndex = reads.findIndex(call => call.method === "POST");
  expect(postIndex).toBeGreaterThan(0);
  expect(reads.slice(0, postIndex).some(call => call.method === "GET" && call.revision === 1582
    && call.path === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`)).toBe(true);
  await reload(page); await green(page, f, 1583);
  expect(f.posts).toHaveLength(1); expect(f.errors).toEqual([]);
});

for (const legacyPending of [false, true]) test(`release legacy ${legacyPending ? "baseless v1611" : "UI"} placement lost ACK cold recovery reads receipt without a second POST`, async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { loseAck: true });
  const old = legacyPending ? await seedLegacyPhotoPendingAction(page) : null;
  if (old) await reload(page); else await addExistingBag(page);
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.dropped, { timeout: 30000 }).toBe(true);
  expect(f.posts).toHaveLength(1);
  const original = structuredClone(f.posts[0]), pending = await nativeLegacyPhotoOutbox(page);
  expect(pending.pending).toBe(true); exactOriginalPost(original, pending.record);
  if (old) {
    expect(pending.record.mergeBase).toBeUndefined(); exactOriginalPost(original, old.record);
    for (const entry of old.entries) expect(pending.entries).toContainEqual(entry);
  }
  assertLegacyPhotoRowsPreserved(f.initial, f.payload);
  f.loseAck = false; f.hideReceipts = false;
  const reads = f.receiptReads.length;
  await reload(page); await green(page, f, 1583);
  expect(f.receiptReads.slice(reads)).toContain(original.operationId);
  expect(f.posts).toEqual([original]); expect(f.errors).toEqual([]);
});
