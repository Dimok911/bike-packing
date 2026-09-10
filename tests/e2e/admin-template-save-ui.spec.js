import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

const origin = "https://experiment.vniipo-help.ru", bundleRoot = path.resolve("test-results/admin-template-ui-build");
const personal = () => ({ locations: ["Велосипед"], categories: ["Ремонт"], containers: {}, items: {},
  layouts: { "layout-a": { id: "layout-a", name: "Личный тест", rootContainerIds: [], arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} } } },
  activeLayoutId: "layout-a", packedItems: {} });
const template = () => {
  const payload = personal(); payload.layouts["layout-a"].name = "Проверяемый шаблон";
  payload.items.pump = { id: "pump", name: "Насос шаблона", weight: 100, containerId: "", location: "Велосипед", categories: ["Ремонт"] };
  return payload;
};
test.beforeAll(() => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)), "build", "--config", "tests/e2e/admin-template-ui.vite.config.js"],
    { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const diagnostics = await page.evaluate(() => ({ helper: Boolean(window.__adminUiTest), user: window.__adminUiTest?.user()?.id,
      scope: window.__adminUiTest?.scope(), layouts: window.__adminUiTest?.state()?.layouts }));
    await info.attach("admin-ui-state", { body: JSON.stringify(diagnostics), contentType: "application/json" });
  }
});
async function fixture(page, context) {
  const state = { payload: template(), revision: 7, visibility: "private", receipts: new Map(), posts: [], errors: [], lose: false, hidden: false, hold: null };
  const listId = "public-demo-state-ui", itemKey = "demo-state:ui", metadata = { title: "Проверяемый шаблон", description: "", language: "ru" };
  page.on("pageerror", error => state.errors.push(error.message));
  await context.addInitScript(() => localStorage.setItem("bike-packing-language-v1", "ru"));
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes("/letters-vniipo/api/")) {
      const suffix = url.pathname.split("/letters-vniipo/api")[1], headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
      let data, status = 200;
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (["/auth/me", "/auth/experiment-share-session"].includes(suffix)) data = { ok: true, user: { id: "admin-a", email: "admin@example.test" } };
      else if (suffix === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "admin", capabilities: ["templates:write", "templates:history:read", "reports:read", "catalog:review"] } };
      else if (suffix === "/bike-packing/capabilities") data = { ok: true, service: "bikepacking-api", apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "adminTemplateCausalOperationsV1"] };
      else if (suffix === "/bike-packing/lists") data = { ok: true, lists: [{ id: "personal-list", title: "Личный тест", ownerId: "admin-a", role: "owner", canEdit: true, stateRevision: 1, payload: personal() }] };
      else if (suffix.startsWith("/bike-packing/lists/personal-list")) data = { ok: true, list: { id: "personal-list", ownerId: "admin-a", role: "owner", canEdit: true, stateRevision: 1, payload: personal() }, payload: personal(), stateRevision: 1 };
      else if (suffix === "/bike-packing/admin/template-operations/prepare") data = { ok: true, actorId: "admin-a", environment: "bike-packing-experiment", itemKey, listId,
        sourceType: "public-template", exists: true, deleted: false, stateRevision: state.revision, visibility: state.visibility, metadata, payload: state.payload, indexes: [] };
      else if (suffix === "/bike-packing/admin/template-operations" || suffix.endsWith("/cancel")) {
        const input = request.postDataJSON(), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input }), { id, ...binding } = intent;
        state.posts.push(input);
        if (!state.receipts.has(id)) {
          const base = intent.body.base.stateRevision ?? state.receipts.get(intent.body.base.operationId)?.result.payload.stateRevision;
          expect(base).toBe(state.revision); state.revision++;
          if (intent.kind === "template.save") state.payload = structuredClone(intent.body.payload);
          if (intent.kind === "template.publication") state.visibility = intent.body.published ? "public" : "private";
          const { body, ...identity } = binding;
          state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "committed" },
            result: { status: 200, payload: { ok: true, listId, itemKey, stateRevision: state.revision, visibility: state.visibility, indexes: [] } } });
        }
        if (state.hold) await state.hold;
        if (state.lose) { state.hidden = true; return route.abort("failed"); }
        data = { ok: true, ...state.receipts.get(id) };
      } else if (suffix.startsWith("/bike-packing/admin/template-operations/")) {
        if (state.hidden) return route.abort("failed");
        const id = suffix.split("/").at(-1); data = { ok: true, ...(state.receipts.get(id) || { operation: { id, state: "unknown" } }) };
      } else if (request.method() === "GET") data = { ok: true, lists: [], items: [], containers: [], layouts: [], records: [], photos: [], history: [] };
      else throw Error("Unexpected legacy business write: " + suffix);
      return route.fulfill({ status, headers, json: data });
    }
    if (url.origin !== origin) return route.fulfill({ status: 404, body: "" });
    const file = path.resolve(bundleRoot, url.pathname === "/" ? "index.html" : "." + url.pathname);
    if (!file.startsWith(bundleRoot + path.sep)) throw Error("Outside UI fixture");
    try { return route.fulfill({ body: await readFile(file), contentType: file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "application/octet-stream" }); }
    catch { return route.fulfill({ status: 404, body: "" }); }
  });
  await page.goto(origin); await openEditor(page);
  return state;
}
async function openEditor(page) {
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.waitForFunction(() => window.__adminUiTest?.user()?.id === "admin-a");
  await page.evaluate(() => __adminUiTest.openDemo({ language: "ru", templateId: "public-demo-state-ui" }));
  await page.waitForFunction(() => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource));
}
async function editItem(page, name) {
  const itemId = await page.evaluate(() => Object.values(__adminUiTest.state().items).find(item => item.publicCatalogLayoutId)?.id);
  expect(itemId).toBeTruthy(); await page.evaluate(id => __adminUiTest.openItem(id), itemId);
  await expect(page.locator("#itemDialog")).toBeVisible(); await page.locator("#itemName").fill(name);
  await submitItem(page);
}
async function submitItem(page) {
  await page.locator("#itemName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveItemBtn").tap();
  else await page.locator("#saveItemBtn").click();
}
async function confirmedRevision(page, revision) {
  await page.waitForFunction(value => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource?.base?.stateRevision === value), revision);
}
test("real admin item form captures the viewed revision and autosaves through the separate journal", async ({ page, context }) => {
  const state = await fixture(page, context);
  const itemId = await page.evaluate(() => Object.values(__adminUiTest.state().items).find(item => item.name === "Насос шаблона")?.id);
  expect(itemId).toBeTruthy(); await page.evaluate(id => __adminUiTest.openItem(id), itemId);
  await expect(page.locator("#itemDialog")).toBeVisible(); await page.locator("#itemName").fill("Изменённый насос");
  await submitItem(page);
  await expect.poll(() => state.posts.length).toBe(1);
  expect(state.posts[0].kind).toBe("template.save"); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
  expect(Object.values(state.posts[0].body.payload.items).some(item => item.name === "Изменённый насос")).toBe(true);
  await page.waitForFunction(() => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource?.base?.stateRevision === 8));
  expect(state.errors).toEqual([]);
});

test("a second real edit starts from the first confirmed revision", async ({ page, context }) => {
  const state = await fixture(page, context);
  await editItem(page, "Первое имя"); await confirmedRevision(page, 8);
  await editItem(page, "Второе имя"); await confirmedRevision(page, 9);
  expect(state.posts).toHaveLength(2);
  expect(state.posts.map(post => post.body.base)).toEqual([{ stateRevision: 7 }, { stateRevision: 8 }]);
  expect(state.errors).toEqual([]);
});

test("reload recovers a lost response without a new save or a new payload", async ({ page, context }) => {
  const state = await fixture(page, context); state.lose = true;
  await editItem(page, "Сохранено до потери ответа");
  await expect.poll(() => state.posts.length).toBe(1);
  const original = structuredClone(state.posts[0]);
  await expect.poll(() => state.hidden).toBe(true);
  state.lose = false; state.hidden = false;
  await page.reload(); await openEditor(page); await confirmedRevision(page, 8);
  expect(state.posts).toEqual([original]);
  expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).some(item => item.name === "Сохранено до потери ответа"))).toBe(true);
  expect(state.errors).toEqual([]);
});

test("a late acknowledgement cannot clear the next form edit", async ({ page, context }) => {
  const state = await fixture(page, context); let release;
  state.hold = new Promise(resolve => { release = resolve; });
  await editItem(page, "Первая отправка"); await expect.poll(() => state.posts.length).toBe(1);
  await editItem(page, "Правка во время отправки");
  await page.waitForFunction(id => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource?.planId && layout.adminCausalSource.planId !== id), state.posts[0].operationId);
  state.hold = null; release(); await confirmedRevision(page, 9);
  expect(state.posts).toHaveLength(2);
  expect(state.posts[1].body.base).toEqual({ operationId: state.posts[0].operationId });
  expect(Object.values(state.payload.items).some(item => item.name === "Правка во время отправки")).toBe(true);
  expect(state.errors).toEqual([]);
});

test("local journal quota failure keeps the form draft and sends no template write", async ({ page, context }) => {
  const state = await fixture(page, context);
  await page.evaluate(() => { const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith("bike-packing-admin-save-plans-v1:")) throw new DOMException("Quota", "QuotaExceededError");
    return original.call(this, key, value);
  }; });
  await editItem(page, "Несохранённая локальная правка");
  await expect(page.locator("body")).toContainText("Сохранение шаблона приостановлено");
  expect(state.posts).toHaveLength(0);
  expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).some(item => item.name === "Несохранённая локальная правка"))).toBe(true);
  expect(state.errors).toEqual([]);
});
