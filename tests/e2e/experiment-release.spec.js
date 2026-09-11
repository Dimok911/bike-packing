import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { adminPhotoBrowserFixture, nativeAdminPhotoRecords, selectedGif, photoReferences } from "../fixtures/admin-template-photo-browser-fixture.js";

const origin = "https://experiment.vniipo-help.ru";
const ru = "https://api.vniipo-help.ru/experiment/letters-vniipo/api";
const eu = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api";
const key = "bike-packing-experiment-transport-v1", journal = "bike-packing-experiment-uncertain-write-v1:";
const root = path.resolve("www/vniipo-help.ru/bike-packing");
const payload = () => ({ locations: [], categories: [], items: {}, containers: {}, packedItems: {}, activeLayoutId: "personal",
  layouts: { personal: { id: "personal", name: "Личный тест", rootContainerIds: [], arrangement: {
    rootContainerIds: [], items: {}, containers: {}, itemQuantities: {}, packedItems: {}, itemQuantityMigrationVersion: 3 } } } });
async function fixture(page, context, { selection = "eu", gate = "enabled", frontend = origin, pending = false } = {}) {
  const calls = [], errors = []; let signedIn = false;
  const operationId = "88985048-716c-41c3-937b-1d7a4651d118";
  const prior = { id: operationId, path: "/bike-packing/list-operations", method: "POST", mode: "direct", identity: "", uncertain: true,
    createdAt: "2026-09-12T10:00:00.000Z", recovery: { type: "list", protocol: "causal-v1", operationId,
      actorId: "release-user", listId: "release-list", kind: "list.update", body: { version: 1, payload: payload() } } };
  await context.addInitScript(({ selection, key, pending, prior, journal }) => {
    if (!sessionStorage.getItem(key)) sessionStorage.setItem(key, selection);
    localStorage.setItem("bike-packing-language-v1", "ru");
    if (pending && !localStorage.getItem(journal + prior.id)) localStorage.setItem(journal + prior.id, JSON.stringify(prior));
  }, { selection, key, pending, prior, journal });
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    if (url.pathname.includes("/letters-vniipo/api/") || url.pathname.startsWith("/auth/") || url.pathname.startsWith("/session/")) {
      calls.push({ url: url.href, method, body: request.postData() });
      const headers = { "Access-Control-Allow-Origin": frontend, "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate", Vary: "Origin" };
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const suffix = url.pathname.split("/letters-vniipo/api")[1] || url.pathname;
      let data = { ok: true, lists: [], items: [], containers: [], layouts: [], records: [], photos: [], history: [] };
      if (suffix.endsWith("/capabilities")) {
        headers["X-Vniipo-Proxy-Target"] = "bike-packing-experiment"; headers["X-Vniipo-Proxy-Write-Gate"] = gate;
        data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION, capabilities: REQUIRED_ADMIN_API_CAPABILITIES };
      } else if (suffix === "/auth/me") data = { ok: true, user: signedIn ? { id: "release-user", email: "release@example.test" } : null };
      else if (suffix === "/auth/request-magic-link") data = { ok: true, email: "release@example.test", delivery: "smtp" };
      else if (suffix === "/auth/verify-magic-link" && method === "POST") {
        expect(request.postDataJSON()).toEqual({ token: "1234567890abcdef1234567890abcdef" }); signedIn = true;
        headers["Set-Cookie"] = "personal_tags_session=isolated-eu-session; Path=/; HttpOnly; Secure; SameSite=Lax";
        data = { ok: true, user: { id: "release-user", email: "release@example.test" } };
      } else if (suffix === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (suffix === "/bike-packing/lists") data = { ok: true, lists: [{ id: "release-list", title: "Личный тест", ownerId: "release-user",
        role: "owner", canEdit: true, stateRevision: 1, payload: payload() }] };
      else if (suffix.startsWith("/bike-packing/lists/release-list")) data = { ok: true, list: { id: "release-list", ownerId: "release-user", role: "owner", canEdit: true, stateRevision: 1, payload: payload() }, payload: payload(), stateRevision: 1 };
      else if (method !== "GET" && method !== "HEAD") return route.fulfill({ status: 409, headers, json: { ok: false, code: "unexpected_fixture_write" } });
      return route.fulfill({ headers, json: data });
    }
    if (url.origin !== frontend) return route.fulfill({ status: 404, body: "Isolated fixture" });
    const file = path.resolve(root, url.pathname === "/" ? "index.html" : "." + url.pathname);
    if (!file.startsWith(root + path.sep)) return route.abort();
    try { return route.fulfill({ body: await readFile(file), contentType: file.endsWith(".js") ? "text/javascript"
      : file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "application/octet-stream" }); }
    catch { return route.fulfill({ status: 404, body: "" }); }
  });
  await page.goto(frontend);
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 25000 });
  return { calls, errors, prior, operationId };
}
async function openAuth(page) { await page.locator("#menuBtn").click(); await page.locator("#authBtn").click(); await expect(page.locator("#authDialog")).toBeVisible(); }

test("normal release manual EU uses explicit email and code POST on EU", async ({ page, context }) => {
  const f = await fixture(page, context);
  await openAuth(page);
  await expect(page.locator("#authMigrateExperiment")).toBeHidden();
  await page.locator("#authEmail").fill("release@example.test"); await page.locator("#authSubmitBtn").click();
  await expect.poll(() => f.calls.filter(row => row.url === eu + "/auth/request-magic-link" && row.method === "POST").length).toBe(1);
  await page.locator("#authMagicLink").fill("1234567890abcdef1234567890abcdef"); await page.locator("#authConfirmBtn").click();
  await expect(page.locator("#authDialog")).not.toBeVisible();
  expect(f.calls.filter(row => row.url === eu + "/auth/verify-magic-link" && row.method === "POST")).toHaveLength(1);
  expect(f.calls.filter(row => row.method === "POST" && row.url.startsWith(ru))).toEqual([]);
  expect(f.calls.some(row => /migrate-session|experiment-share-session/.test(row.url))).toBe(false);
  const cookies = await context.cookies(eu);
  expect(cookies.find(row => row.name === "personal_tags_session")).toMatchObject({ domain: "api-eu.vniipo-help.ru", httpOnly: true, secure: true });
  expect((await context.cookies(ru)).some(row => row.name === "personal_tags_session")).toBe(false);
  expect(f.errors).toEqual([]);
});

for (const gate of ["read-only", ""]) test(`normal release EU descriptor ${gate || "missing"} stops before auth and writes`, async ({ page, context }) => {
  const f = await fixture(page, context, { gate });
  expect(f.calls.some(row => row.url.endsWith("/bike-packing/capabilities"))).toBe(true);
  expect(f.calls.filter(row => !row.url.endsWith("/bike-packing/capabilities") && row.method !== "OPTIONS")).toEqual([]);
});

test("normal release pending RU journal blocks EU login and survives route selection", async ({ page, context }) => {
  const f = await fixture(page, context, { pending: true });
  await openAuth(page); await page.locator("#authEmail").fill("release@example.test"); await page.locator("#authSubmitBtn").click();
  await expect(page.locator("#authDialogStatus")).toContainText(/подтверж|unknown|reconcile|свер/i);
  expect(f.calls.filter(row => row.method === "POST")).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), journal + f.operationId)).toEqual(f.prior);
  await page.locator("#authDialog").evaluate(dialog => dialog.close());
  await page.locator("#menuBtn").click(); await page.locator("#apiRouteMenuBtn").click();
  await page.locator("#apiRouteDialog [data-transport-choice]").selectOption("direct"); await page.locator("#apiRouteDialog [data-transport-apply]").click();
  await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/);
  expect(f.calls.some(row => row.url === ru + "/auth/me")).toBe(true);
  expect(f.calls.filter(row => row.method === "POST")).toEqual([]);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), journal + f.operationId)).toEqual(f.prior);
});

test("normal release profile stays disabled on Production origin", async ({ page, context }) => {
  const f = await fixture(page, context, { frontend: "https://vniipo-help.ru" });
  expect(f.calls.some(row => row.url.startsWith(eu))).toBe(false);
  expect(f.calls.some(row => row.url === "https://api.vniipo-help.ru/letters-vniipo/api/auth/me")).toBe(true);
  await page.locator("#menuBtn").click(); await expect(page.locator("#apiRouteMenuBtn")).toBeHidden();
});

for (const type of ["item", "container"]) for (const edit of [false, true]) test(`normal release admin ${type} ${edit ? "delete" : "append"} uses actual dialogs and immutable plan`, async ({ page, context }) => {
  await context.addInitScript(key => sessionStorage.setItem(key, "eu"), key);
  const server = await adminPhotoBrowserFixture(page, context, { release: true, photoEdit: edit });
  page.adminPhotoServer = server;
  const collection = type === "item" ? "items" : "containers", rawId = type === "item" ? "pump" : "bag";
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  await page.locator(type === "item" ? "#itemsView .item-title" : "#bagsView [data-root-title]")
    .filter({ hasText: type === "item" ? "Насос шаблона" : "Сумка шаблона" }).click();
  const prefix = type === "item" ? "item" : "rootContainer", dialog = page.locator(type === "item" ? "#itemDialog" : "#rootContainerDialog");
  const button = type === "item" ? "#saveItemBtn" : "#saveRootContainerBtn";
  await expect(dialog).toBeVisible();
  await dialog.locator("[data-photo-open]").first().click();
  await expect(page.locator(".photo-lightbox-close")).toBeVisible();
  await expect.poll(() => server.photoReads.length).toBeGreaterThan(0);
  await page.locator(".photo-lightbox-close").click();
  await page.locator(`#${prefix}Name`).fill("Релизная фотоформа");
  if (edit) {
    await page.locator(`#${prefix}PhotoRemoveBtn`).click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
  } else {
    await page.locator(`#${prefix}PhotoInput`).setInputFiles({ name: "Релизное фото.gif", mimeType: "image/gif", buffer: selectedGif });
    await expect(dialog).toContainText("Фото подготовлены: 1");
  }
  await page.locator(`#${prefix}Name`).blur();
  if (test.info().project.name === "mobile-webkit") await page.locator(button).tap(); else await page.locator(button).click();
  await expect(dialog).not.toBeVisible(); await expect.poll(() => server.revision, { timeout: 15000 }).toBe(8);
  expect(server.posts).toHaveLength(1); const action = server.posts[0];
  expect(photoReferences(action.body.payload)).toEqual(photoReferences(server.initialPayload));
  expect(server.payload[collection][rawId].name).toBe("Релизная фотоформа");
  if (edit) {
    expect(action.body.photoEdit).toEqual({ version: 1, entityType: type, entityId: rawId,
      photoIds: server.initialPayload[collection][rawId].photos.slice(1).map(photo => photo.id) });
    expect(server.stagePosts).toHaveLength(0);
  } else {
    expect(server.stagePosts).toHaveLength(1); expect(server.stagePosts[0].bytes.equals(selectedGif)).toBe(true);
    expect(action.body.photoAppend.assets).toHaveLength(1);
    expect(server.payload[collection][rawId].photos.at(-1).fileName).toBe("Релизное фото.gif");
    const native = await nativeAdminPhotoRecords(page); expect(native.actions).toHaveLength(1); expect(native.claims).toHaveLength(1);
    expect(native.actions[0].checkedIntentHash).toBe(native.actions[0].intentHash);
  }
  const plans = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-admin-save-plans-v1:"))
    .map(([, value]) => JSON.parse(value)).filter(row => row.plan?.id));
  expect(plans.find(row => row.plan.id === action.operationId)?.plan.version).toBe(edit ? 6 : 5);
  await expect.poll(() => server.photoReads.length).toBeGreaterThan(0);
  expect(server.photoReads.every(url => url.startsWith(eu + "/"))).toBe(true);
  expect(server.errors).toEqual([]);
});

test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus) return;
  const server = page.adminPhotoServer;
  if (server) await info.attach("release-admin-fixture", { body: JSON.stringify({ errors: server.errors, posts: server.posts,
    preparePosts: server.preparePosts, photoReads: server.photoReads, revision: server.revision, exceptions: server.exceptions,
    storage: await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes("prototype-state") || key.includes("admin-")))) }), contentType: "application/json" });
});
