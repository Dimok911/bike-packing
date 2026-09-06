import { test, expect } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

// Full application, isolated browser/API fixture. Gates are changed only in
// an isolated test bundle; source/publication flags and live services stay off.
const origin = "https://experiment.vniipo-help.ru";
const bundleRoot = path.resolve("test-results/personal-ui-build");
test.beforeAll(async () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../../node_modules/vite/bin/vite.js", import.meta.url)),
    "build", "--config", "tests/e2e/personal-ui.vite.config.js"], { windowsHide: true, encoding: "utf8", maxBuffer: 5 * 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
});
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await info.attach("personal-ui-errors", {
    body: JSON.stringify(page.personalFixture?.errors || []), contentType: "application/json"
  });
});

async function submitForm(page, button, input) {
  if (input) await page.locator(input).blur();
  if (test.info().project.name === "mobile-webkit") await page.locator(button).tap();
  else await page.locator(button).click();
}

async function reloadApp(page) {
  page.personalFixture.reloading = true;
  try {
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  } finally { page.personalFixture.reloading = false; }
}

async function createRootContainer(page, name) {
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(name);
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
  const bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: name });
  await expect(bag).toHaveCount(1); return bag;
}

async function createItemInContainer(page, bag, name, { weight = "0" } = {}) {
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#createItemForContainerBtn").click();
  await page.locator("#itemName").fill(name); await page.locator("#itemWeight").fill(weight);
  await submitForm(page, "#saveItemBtn", "#itemWeight");
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  const item = bag.locator("[data-item-id]").filter({ hasText: name });
  await expect(item).toHaveCount(1); return item;
}

function initialPayload() {
  return { locations: ["Велосипед"], categories: ["Ремонт"], containers: {}, items: {},
    layouts: { "layout-a": { id: "layout-a", name: "Личный тест", rootContainerIds: [],
      arrangement: { rootContainerIds: [], containers: {}, items: {}, packedItems: {} } } },
    activeLayoutId: "layout-a", packedItems: {} };
}

async function setup(page, context, { fresh = false, lose = false } = {}) {
  const state = { listId: fresh ? null : "list-a", payload: initialPayload(), revision: fresh ? 0 : 1,
    posts: [], receipts: new Map(), lose, unknown: lose, errors: [] };
  page.personalFixture = state;
  const record = () => ({ id: state.listId, title: "Личный тест", ownerId: "actor-a", role: "owner", canEdit: true,
    stateRevision: state.revision, updatedAt: `2026-09-06T10:00:${String(state.revision).padStart(2, "0")}.000Z`, payload: state.payload });
  page.on("pageerror", error => {
    // WebKit reports a cancelled injected receipt fetch during reload. Do not
    // confuse this deliberate fixture failure with a JavaScript application error.
    if (state.injectedFailure && /\/list-operations\/.*due to access control checks\./.test(error.message)) return;
    if (test.info().project.name === "mobile-webkit" && state.reloading
      && /\/letters-vniipo\/api\/.*due to access control checks\.$/.test(error.message)) return;
    state.errors.push(error.message);
  });
  await context.addInitScript(() => { localStorage.setItem("bike-packing-language-v1", "ru"); });
  await context.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
    if (url.pathname.includes("/letters-vniipo/api/")) {
      const path = url.pathname.split("/letters-vniipo/api")[1];
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      let data, status = 200;
      if (path === "/auth/me" || path === "/auth/experiment-share-session") data = { ok: true, user: { id: "actor-a", email: "personal@example.test" } };
      else if (path === "/bike-packing/authorization") data = { ok: true, authorization: { version: 1, role: "user", capabilities: [] } };
      else if (path === "/bike-packing/capabilities") data = { ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "personalListCausalOperationsV1"] };
      else if (path === "/bike-packing/lists") data = { ok: true, lists: state.listId ? [record()] : [] };
      else if (path === `/bike-packing/lists/${state.listId}` || path === `/bike-packing/lists/${state.listId}/state`) data = { ok: true, list: record(), state: state.payload };
      else if (path === `/bike-packing/lists/${state.listId}/freshness`) data = { ok: true, ...record(), payload: undefined };
      else if (path === "/bike-packing/list-operations" && request.method() === "POST") {
        const body = request.postDataJSON(); state.posts.push(body);
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
        const digest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
        const predecessor = body.body.causal?.baseOperationId && state.receipts.get(body.body.causal.baseOperationId);
        const base = predecessor?.result.payload.list.stateRevision ?? body.body.baseStateRevision;
        if (body.kind === "list.create") { expect(state.listId).toBeNull(); expect(body.body.id).toBe(body.listId); }
        else expect(base).toBe(state.revision);
        state.listId = body.listId; state.payload = body.body.payload; state.revision++;
        data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
          result: { status: 200, payload: { ok: true, list: structuredClone(record()) } } };
        state.receipts.set(body.operationId, data);
        if (state.lose) { state.injectedFailure = true; return route.abort("failed"); }
      } else if (path.startsWith("/bike-packing/list-operations/")) {
        data = state.unknown ? { ok: true, operation: { state: "unknown" } } : state.receipts.get(path.split("/").at(-1));
      } else if (request.method() !== "GET") throw Error(`Unexpected legacy write: ${request.method()} ${path}`);
      else { data = { ok: false, code: "fixture_not_found" }; status = 404; }
      return route.fulfill({ status, headers, json: data || { ok: false } });
    }
    if (url.origin !== origin) return route.abort();
    const target = path.resolve(bundleRoot, `.${url.pathname === "/" ? "/index.html" : url.pathname}`);
    if (!target.startsWith(bundleRoot + path.sep)) throw Error("Fixture path escaped its build directory");
    const mime = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
      ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp" };
    try { return await route.fulfill({ body: await readFile(target), contentType: mime[path.extname(target)] || "application/octet-stream" }); }
    catch (error) { if (error.code === "ENOENT") return route.fulfill({ status: 404, body: "Not in isolated fixture" }); throw error; }
  });
  await page.goto(origin);
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  if (!fresh) {
    await expect(page.locator("#layoutSelect option").filter({ hasText: "Личный тест" })).toBeAttached({ timeout: 20000 });
    await page.locator("#layoutSelect").selectOption("layout-a");
  }
  return state;
}

test("actual bag and item dialogs persist immutable actions and recover lost ACK after reload", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { lose: true });
  const bag = await createRootContainer(page, "Сумка очереди");
  await createItemInContainer(page, bag, "Насос очереди", { weight: "130" });
  await expect.poll(async () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:") && !key.includes("applied:")).length)).toBeGreaterThan(0);
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const firstId = f.posts[0].operationId;
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await page.locator("#syncBtn").click();
  await expect.poll(() => Object.values(f.payload.items || {}).some(item => item.name === "Насос очереди"), { timeout: 20000 }).toBe(true);
  expect(f.posts.filter(post => post.operationId === firstId)).toHaveLength(1);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

async function synchronize(page, condition) {
  await page.locator("#syncBtn").click();
  await expect.poll(condition, { timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:"));
    return keys.length === 3 && keys.some(key => key.endsWith(":anchor"));
  }), { timeout: 20000 }).toBe(true);
}

test("actual edit/delete dialogs, nested placement and confirmed compaction keep deleted entities absent", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  let bag = await createRootContainer(page, "Основная сумка");
  let item = await createItemInContainer(page, bag, "Вещь до изменения");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#newSubcontainerName").fill("Внутренний карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Внутренний карман"));
  const nested = Object.values(f.payload.containers).find(entry => entry.name === "Внутренний карман");
  expect(f.payload.layouts["layout-a"].arrangement.containers[nested.id].parentId).toBeTruthy();
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Изменённая вещь");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await synchronize(page, () => Object.values(f.payload.items).some(entry => entry.name === "Изменённая вещь"));
  item = page.locator("#packingView [data-item-id]").filter({ hasText: "Изменённая вещь" });
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.items).length === 0);
  bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Основная сумка" });
  await bag.getByRole("heading", { name: "Основная сумка" }).click();
  await page.locator("#rootContainerName").fill("Изменённая сумка");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Изменённая сумка"));
  bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Изменённая сумка" });
  await bag.getByRole("heading", { name: "Изменённая сумка" }).click();
  await page.locator("#rootContainerDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.payload.layouts["layout-a"].rootContainerIds).toEqual([]);
  await reloadApp(page);
  expect(Object.keys(f.payload.items)).toEqual([]);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(0);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

test("full application adopts a newer server baseline and next edit keeps the server change", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Первая сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const [id, previous] = Object.entries(f.payload.containers)[0];
  f.payload = { ...f.payload, containers: { ...f.payload.containers, [id]: { ...previous, note: "Изменено с другого устройства" } } };
  f.revision += 10;
  const remoteRevision = f.revision;
  await reloadApp(page);
  await expect.poll(() => page.evaluate(() => Object.entries(localStorage).some(([key, value]) =>
    key.endsWith(":anchor") && JSON.parse(value)?.baseline?.stateRevision > 10))).toBe(true);
  const bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Первая сумка" });
  await bag.getByRole("heading", { name: "Первая сумка" }).click();
  await page.locator("#rootContainerName").fill("После серверного изменения");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await synchronize(page, () => f.payload.containers[id]?.name === "После серверного изменения");
  expect(f.payload.containers[id].note).toBe("Изменено с другого устройства");
  expect(f.posts.at(-1).body.baseStateRevision).toBe(remoteRevision);
  expect(f.posts.at(-1).body.causal.baseOperationId).toBeUndefined();
  expect(f.errors).toEqual([]);
});

test("first authenticated UI change owns a durable create and survives a lost first ACK", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { fresh: true, lose: true });
  await page.locator("#newLayoutBtn").click();
  await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Самая первая укладка");
  await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  const bag = await createRootContainer(page, "Самая первая сумка");
  await createItemInContainer(page, bag, "Первая вещь");
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const first = structuredClone(f.posts[0]);
  expect(first.kind).toBe("list.create"); expect(first.listId).toMatch(/^personal-[a-f0-9]{64}$/);
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await synchronize(page, () => Object.values(f.payload.items).some(item => item.name === "Первая вещь"));
  expect(f.posts.filter(post => post.kind === "list.create")).toEqual([first]);
  expect(f.posts.every(post => post.listId === first.listId)).toBe(true);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

test("Experiment is prominent above the header, fits mobile and remains translated", async ({ page, context }, info) => {
  await setup(page, context);
  const banner = page.locator("#experimentBanner");
  await expect(banner).toHaveText("ЭКСПЕРИМЕНТ");
  const bounds = await banner.evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { left: rect.left, right: rect.right, bottom: rect.bottom, width: innerWidth,
      headerTop: document.querySelector(".topbar").getBoundingClientRect().top,
      fontSize: parseFloat(style.fontSize), weight: Number(style.fontWeight), position: style.position };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.width);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.headerTop);
  expect(bounds.fontSize).toBeGreaterThanOrEqual(24); expect(bounds.weight).toBe(900);
  expect(bounds.position).toBe("sticky");
  await page.screenshot({ path: info.outputPath("experiment-banner.png") });
  await page.locator("#menuBtn").click();
  await page.locator("#languageSelect").selectOption("en");
  await expect(banner).toHaveText("EXPERIMENT");
});
