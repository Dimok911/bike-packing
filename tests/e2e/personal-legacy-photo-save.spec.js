import { test, expect } from "@playwright/test";
import { personalBusinessPayload } from "../../src/sync/personal-business-payload.js";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser, nativeLegacyPhotoOutbox, seedLegacyPhotoPendingAction,
  assertLegacyPhotoRowsPreserved, legacyLayoutId, legacyBagId, legacyPendingBagIds, legacyPhotoBinding } from "../fixtures/personal-legacy-photo-browser-fixture.js";

// These cases consume the normal release build, with no source transforms or
// lexical app hooks. Every API response belongs to an isolated synthetic user.
test.setTimeout(120000);
test.use({ screenshot: "off" });

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || !page.legacyPhotoFixture) return;
  const f = page.legacyPhotoFixture;
  await info.attach("isolated-legacy-photo-evidence", { contentType: "application/json", body: JSON.stringify({
    calls: f.calls, posts: f.posts, receipts: [...f.receipts], captured: f.captured, initial: f.initial, payload: f.payload,
    native: await nativeLegacyPhotoOutbox(page).catch(error => ({ error: error.message })), errors: f.errors
  }, null, 2) });
});

async function addExistingBag(page) {
  await page.locator('[data-view="packing"]').click();
  await page.locator("[data-add-packing-root]").click();
  await page.locator(`[data-add-layout-root="${legacyBagId}"]`).click();
  await expect(page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`)).toHaveCount(1);
}

async function green(page, f, revision) {
  await page.locator("#syncBtn").click();
  await startupGreen(page, f, revision);
}

// Deliberately no Sync click: manual sync previously hid missing startup work.
async function startupGreen(page, f, revision) {
  await expect.poll(() => f.revision, { timeout: 30000 }).toBe(revision);
  await expect.poll(async () => (await nativeLegacyPhotoOutbox(page)).pending, { timeout: 30000 }).toBe(false);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  const native = await nativeLegacyPhotoOutbox(page);
  expect(native.confirmed.stateRevision).toBe(revision);
  const expected = personalBusinessPayload(f.payload), confirmed = structuredClone(native.confirmed.payload);
  f.preserveRows(expected, confirmed);
  // An immediate receipt checkpoint can still contain the original normalized
  // action. Compare every other business field exactly; only already-proven
  // legacy URL aliases may differ until the next full raw server adoption.
  for (const collection of ["containers","items"]) for (const [id, owner] of Object.entries(expected[collection])) {
    for (const [index, photo] of (owner.photos || []).entries()) for (const key of ["url","thumbUrl"]) {
      confirmed[collection][id].photos[index][key] = photo[key];
    }
  }
  expect(confirmed).toEqual(expected);
  f.preserveRows(f.initial, f.payload);
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

function exactChainPosts(f, original) {
  expect(f.posts).toHaveLength(original.records.length);
  original.records.forEach((record, index) => exactOriginalPost(f.posts[index], record));
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(original.records.length);
  expect(f.payload.layouts[legacyLayoutId].arrangement.rootContainerIds).toEqual(["placed-bag", ...legacyPendingBagIds]);
  expect(f.captured[0].records).toEqual(original.records);
  for (const entry of original.entries) expect(f.captured[0].entries).toContainEqual(entry);
}

async function localChainVisible(page) {
  for (const id of legacyPendingBagIds) await expect(page.locator(`#packingView [data-root-container-id="${id}"]`)).toHaveCount(1);
}

test("release startup drains three immutable baseless link-root actions without clicking Sync", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  const original = await seedLegacyPhotoPendingAction(page, legacyPendingBagIds);
  expect(original.records).toHaveLength(3);
  const beforeReload = f.calls.length;
  await reload(page); await startupGreen(page, f, 1585); await localChainVisible(page);
  exactChainPosts(f, original);
  const calls = f.calls.slice(beforeReload), firstPost = calls.findIndex(call => call.method === "POST");
  expect(firstPost).toBeGreaterThan(0);
  expect(calls.slice(0, firstPost).some(call => call.path === `/bike-packing/lists/${legacyPhotoBinding.listId}/state`
    && call.method === "GET" && call.revision === 1582)).toBe(true);
  await reload(page); await startupGreen(page, f, 1585); await localChainVisible(page);
  exactChainPosts(f, original); expect(f.errors).toEqual([]);
});

test("release startup recovers a lost first ACK and sends only the remaining baseless chain without Sync", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { loseAck: true });
  const original = await seedLegacyPhotoPendingAction(page, legacyPendingBagIds);
  await reload(page);
  await expect.poll(() => f.dropped, { timeout: 30000 }).toBe(true);
  expect(f.posts).toHaveLength(1); exactOriginalPost(f.posts[0], original.records[0]);
  expect(f.revision).toBe(1583);
  const pending = await nativeLegacyPhotoOutbox(page);
  expect(pending.pending).toBe(true); expect(pending.records).toEqual(original.records);
  for (const entry of original.entries) expect(pending.entries).toContainEqual(entry);
  await localChainVisible(page);
  const reads = f.receiptReads.length;
  f.loseAck = false; f.hideReceipts = false;
  await reload(page); await startupGreen(page, f, 1585); await localChainVisible(page);
  expect(f.receiptReads.slice(reads)).toContain(original.records[0].action.operationId);
  exactChainPosts(f, original); expect(f.errors).toEqual([]);
});

test("release startup API failure retains all immutable baseless actions and their local placements without Sync", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  const original = await seedLegacyPhotoPendingAction(page, legacyPendingBagIds);
  f.failWrites = true;
  await reload(page);
  await expect.poll(() => f.posts.length, { timeout: 30000 }).toBeGreaterThan(0);
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "syncing", { timeout: 30000 });
  expect(f.posts).toHaveLength(1); exactOriginalPost(f.posts[0], original.records[0]);
  expect(f.receipts.size).toBe(0); expect(f.revision).toBe(1582); expect(f.payload).toEqual(f.initial);
  const pending = await nativeLegacyPhotoOutbox(page);
  expect(pending.pending).toBe(true); expect(pending.records).toEqual(original.records);
  for (const entry of original.entries) expect(pending.entries).toContainEqual(entry);
  await localChainVisible(page);
  await expect(page.locator("#syncBtn")).not.toHaveAttribute("data-sync-state", "synced");
  expect(f.errors).toEqual([]);
});

test("release startup baseless placement accepts only equivalent mixed legacy photo routes without Sync", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { mixedLegacyRoutes: true });
  const original = await seedLegacyPhotoPendingAction(page);
  const captured = original.record.action.body.payload;
  expect(f.initial.containers.second.photos).toEqual(f.initial.containers[legacyBagId].photos.slice(0, 2));
  expect(f.registeredPhotoRows.size).toBe(4);
  expect(captured.containers[legacyBagId].photos.slice(0,2).map(photo=>photo.listId)).toEqual(["",""]);
  expect(captured.containers.second.photos.map(photo=>photo.listId)).toEqual(["",""]);
  const registeredBefore = structuredClone([...f.registeredPhotoRows]);
  expect(captured.containers[legacyBagId].photos[0].url).not.toBe(f.initial.containers[legacyBagId].photos[0].url);
  for (const photo of captured.containers[legacyBagId].photos) expect(photo.url).toContain("/experiment/letters-vniipo/api/");
  f.preserveRows(f.initial, captured);
  for (const mode of ["foreign-photo","wrong-variant","query","owner","order","metadata","new-copy","repeated-slot","delete-shared","shared-metadata","fill-empty-list","foreign-list"]) {
    const changed = structuredClone(captured), photos = changed.containers[legacyBagId].photos;
    if (mode === "foreign-photo") photos[0].url = photos[0].url.replace("legacy-photo-1/", "foreign-photo/");
    if (mode === "wrong-variant") photos[0].url = photos[0].thumbUrl;
    if (mode === "query") photos[0].url += "&changed=1";
    if (mode === "owner") { changed.containers.second.photos = photos; changed.containers[legacyBagId].photos = []; }
    if (mode === "order") photos.reverse();
    if (mode === "metadata") photos[0].width++;
    if (mode === "new-copy") changed.containers.third.photos = [structuredClone(photos[0])];
    if (mode === "repeated-slot") photos.push(structuredClone(photos[0]));
    if (mode === "delete-shared") changed.containers.second.photos.pop();
    if (mode === "shared-metadata") changed.containers.second.photos[0].width++;
    if (mode === "fill-empty-list") photos[0].listId = legacyPhotoBinding.listId;
    if (mode === "foreign-list") photos[0].url = photos[0].url.replace("/lists/legacy-photo-list/", "/lists/foreign/");
    expect(() => f.preserveRows(f.initial, changed), mode).toThrow();
  }
  await reload(page); await startupGreen(page, f, 1583);
  expect(f.posts).toHaveLength(1); exactOriginalPost(f.posts[0], original.record);
  for (const entry of original.entries) expect(f.captured[0].entries).toContainEqual(entry);
  await expect(page.locator(`#packingView [data-root-container-id="${legacyBagId}"]`)).toHaveCount(1);
  expect(f.payload.containers[legacyBagId].photos).toEqual(f.initial.containers[legacyBagId].photos);
  const beforeColdRead = f.calls.length;
  await reload(page); await startupGreen(page, f, 1583);
  expect(f.calls.slice(beforeColdRead).some(call=>call.method==="GET" && call.path===`/bike-packing/lists/${legacyPhotoBinding.listId}/state`)).toBe(true);
  expect((await nativeLegacyPhotoOutbox(page)).confirmed.payload).toEqual(personalBusinessPayload(f.payload));
  await green(page, f, 1583);
  expect(f.posts).toHaveLength(1); exactOriginalPost(f.posts[0], original.record);
  expect([...f.registeredPhotoRows]).toEqual(registeredBefore);
  expect(f.payload.containers.second.photos).toEqual(f.initial.containers.second.photos);
  expect(f.errors).toEqual([]);
});
