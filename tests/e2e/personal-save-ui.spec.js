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

async function setup(page, context, { fresh = false, lose = false, payload = initialPayload() } = {}) {
  const state = { listId: fresh ? null : "list-a", payload: structuredClone(payload), revision: fresh ? 0 : 1,
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
      else if (path === `/bike-packing/lists/${state.listId}/history`) data = { ok: true, records: state.history || [], page: { hasMore: false } };
      else if (path === `/bike-packing/lists/${state.listId}/history/101/restore` && request.method() === "GET") {
        const source = state.history[0], layoutIds = url.searchParams.getAll("layoutId");
        const payload = structuredClone(layoutIds.length ? state.payload : source.payload);
        if (layoutIds.length) for (const id of layoutIds) payload.layouts[id] = structuredClone(source.payload.layouts[id]);
        payload.activeLayoutId ||= "layout-a"; payload.packedItems ||= {};
        const hash = value => createHash("sha256").update(canonicalListOperationJson(value)).digest("hex");
        data = { ok: true, actorId: "actor-a", environment: "bike-packing-experiment", listId: state.listId,
          restore: { payload, baseStateRevision: state.revision, historyRestore: { version: 1, historyId: 101,
            historyPayloadHash: hash(source.payload), payloadHash: hash(payload), layoutIds, targetStateRevision: state.revision } } };
      }
      else if (path === "/bike-packing/list-operations" && request.method() === "POST") {
        const body = request.postDataJSON(); state.posts.push(body);
        const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
        const digest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
        const predecessor = body.body.causal?.baseOperationId && state.receipts.get(body.body.causal.baseOperationId);
        if (["list.update", "list.restore"].includes(body.kind) && state.beforeUpdate) await state.beforeUpdate(body);
        const base = predecessor?.result.payload.list?.stateRevision ?? body.body.baseStateRevision;
        if (body.kind === "list.create") { expect(state.listId).toBeNull(); expect(body.body.id).toBe(body.listId); }
        else if (!state.allowConflicts) expect(base).toBe(state.revision);
        if (predecessor?.operation.state === "rejected" || body.kind !== "list.create" && base !== state.revision) {
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "rejected" },
            result: { status: 409, payload: { ok: false,
              code: predecessor?.operation.state === "rejected" ? "dependency_rejected" : "stale_state_revision", stateRevision: state.revision } } };
        } else {
          state.listId = body.listId; state.payload = body.body.payload; state.revision++;
          data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest: digest, state: "committed" },
            result: { status: 200, payload: { ok: true, list: structuredClone(record()) } } };
        }
        state.receipts.set(body.operationId, data);
        if (state.lose) { state.injectedFailure = true; return route.abort("failed"); }
      } else if (path.startsWith("/bike-packing/list-operations/")) {
        data = state.unknown ? { ok: true, operation: { state: "unknown" } }
          : state.receipts.get(path.split("/").at(-1)) || { ok: true, operation: { id: path.split("/").at(-1), state: "unknown" } };
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
  expect(Object.keys(f.payload.items)[0]).toMatch(/^item-[0-9a-f-]{36}$/);
  expect(Object.keys(f.payload.containers)[0]).toMatch(/^container-[0-9a-f-]{36}$/);
  expect(f.errors).toEqual([]);
});

async function synchronize(page, condition) {
  await page.locator("#syncBtn").click();
  await expect.poll(condition, { timeout: 20000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const keys = Object.keys(localStorage).filter(key => key.startsWith("bike-packing-personal-save-v1:"));
    return keys.length === 3 && keys.some(key => key.includes(":checkpoint:"));
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
  expect(nested.id).toMatch(/^container-[0-9a-f-]{36}$/);
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
    key.includes(":checkpoint:") && JSON.parse(value)?.baseline?.stateRevision > 10))).toBe(true);
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

test("actual sync reconciles different fields with a new ID and rechecks a second server change", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка сравнения");
  const item = await createItemInContainer(page, bag, "Исходное название", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let intervening = 0;
  f.beforeUpdate = () => {
    if (intervening < 2) {
      f.payload = structuredClone(f.payload); f.payload.items[id].weight += 50;
      f.revision++; intervening++;
    }
  };
  await item.locator(".item-title-hitarea").click();
  await page.locator("#itemName").fill("Новое название");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await synchronize(page, () => f.payload.items[id]?.name === "Новое название");
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(changes[1].body.payload.items[id].weight).toBe(150);
  expect(changes[2].body.payload.items[id].weight).toBe(200);
  expect(changes.slice(1).every(post => post.body.causal.dependsOn.length === 0 && !post.body.force)).toBe(true);
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Новое название" })).toHaveCount(1);
  expect(f.payload.items[id].weight).toBe(200); expect(f.errors).toEqual([]);
});

test("actual sync retains the local version when the same field changed or the remote item was deleted", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка конфликта");
  const item = await createItemInContainer(page, bag, "Первоначальная вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  f.beforeUpdate = () => { f.payload = structuredClone(f.payload); f.payload.items[id].name = "На другом устройстве"; f.revision++; f.beforeUpdate = null; };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("На этом устройстве");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#syncStatus")).toContainText("Выбор отложен");
  expect(f.posts.slice(before)).toHaveLength(1);
  expect(f.payload.items[id].name).toBe("На другом устройстве");
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
  delete f.payload.items[id]; f.revision++;
  await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await expect(page.locator("#conflictList")).toContainText("Удалено");
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#syncStatus")).toContainText("Выбор отложен");
  expect(f.posts.slice(before)).toHaveLength(1); expect(f.payload.items[id]).toBeUndefined();
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("explicit UI conflict choices recompare another server edit and recover a lost chosen ACK", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка выбора");
  const item = await createItemInContainer(page, bag, "До выбора", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let attempt = 0;
  f.beforeUpdate = () => {
    attempt++;
    if (attempt <= 2) {
      f.payload = structuredClone(f.payload); f.payload.items[id].name = `Серверный вариант ${attempt}`; f.revision++;
    } else { f.lose = true; f.unknown = true; f.beforeUpdate = null; }
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Мой вариант");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect(page.locator("#conflictDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#conflictList")).toContainText("Серверный вариант 1");
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await page.locator('#conflictList input[value="local"]').check();
  await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#conflictList")).toContainText("Серверный вариант 2", { timeout: 20000 });
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await expect(page.locator("#conflictApplyBtn")).toBeDisabled();
  await page.locator('#conflictList input[value="remote"]').check();
  await page.locator("#conflictApplyBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3); expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(changes[1].body.payload.items[id].name).toBe("Мой вариант");
  expect(changes[2].body.payload.items[id].name).toBe("Серверный вариант 2");
  expect(changes.slice(1).every(post => !post.body.force && !post.body.forceOverwrite)).toBe(true);
  f.lose = false; f.unknown = false;
  await reloadApp(page); await synchronize(page, () => f.payload.items[id]?.name === "Серверный вариант 2");
  expect(f.posts.slice(before)).toHaveLength(3);
  await expect(page.locator("#conflictDialog")).not.toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Серверный вариант 2" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("a reconciled full UI action survives lost ACK and reload without another POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка восстановления");
  const item = await createItemInContainer(page, bag, "До сверки", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.allowConflicts = true;
  let attempt = 0;
  f.beforeUpdate = () => {
    if (attempt++ === 0) { f.payload = structuredClone(f.payload); f.payload.items[id].weight = 200; f.revision++; }
    else { f.lose = true; f.unknown = true; f.beforeUpdate = null; }
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("После сверки");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(2);
  const mergedId = f.posts.at(-1).operationId;
  await expect.poll(() => page.evaluate(operationId => Object.entries(localStorage).some(([key, value]) =>
    key.endsWith(operationId) && JSON.parse(value).reconciliation?.settled?.length), mergedId)).toBe(true);
  f.lose = false; f.unknown = false;
  await reloadApp(page);
  await synchronize(page, () => f.payload.items[id]?.name === "После сверки");
  expect(f.posts.filter(post => post.operationId === mergedId)).toHaveLength(1);
  expect(f.posts.slice(before)).toHaveLength(2);
  expect(f.payload.items[id].weight).toBe(200);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "После сверки" })).toHaveCount(1);
  expect(f.errors).toEqual([]);
});

test("two queued UI edits settle a rejected predecessor and its unsent child before merging", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка цепочки");
  const item = await createItemInContainer(page, bag, "Перед цепочкой", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  let release;
  f.allowConflicts = true;
  f.beforeUpdate = async () => {
    f.beforeUpdate = null; f.payload = structuredClone(f.payload); f.payload.items[id].weight = 444; f.revision++;
    await new Promise(resolve => { release = resolve; });
  };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Первое изменение");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect.poll(() => Boolean(release)).toBe(true);
  try {
    const renamed = page.locator("#packingView [data-item-id]").filter({ hasText: "Первое изменение" });
    await renamed.locator(".item-title-hitarea").click(); await page.locator("#itemNote").fill("Второе изменение");
    await submitForm(page, "#saveItemBtn", "#itemNote");
    await expect.poll(() => page.evaluate(itemId => Object.entries(localStorage).some(([key, value]) =>
      key.startsWith("bike-packing-personal-save-v1:") && JSON.parse(value).action?.body.payload.items[itemId]?.note === "Второе изменение"), id)).toBe(true);
  } finally { release(); }
  await synchronize(page, () => f.payload.items[id]?.note === "Второе изменение" && f.payload.items[id]?.weight === 444);
  const changes = f.posts.slice(before);
  expect(changes).toHaveLength(3);
  expect(changes.map(post => f.receipts.get(post.operationId).operation.state)).toEqual(["rejected", "rejected", "committed"]);
  expect(f.receipts.get(changes[1].operationId).result.payload.code).toBe("dependency_rejected");
  expect(changes[1].body.causal.baseOperationId).toBe(changes[0].operationId);
  expect(f.payload.items[id].name).toBe("Первое изменение");
  expect(new Set(changes.map(post => post.operationId)).size).toBe(3);
  expect(f.errors).toEqual([]);
});

test("lost ACK followed by a newer server edit adopts current data without replay and anchors the next UI edit", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка новой версии");
  const item = await createItemInContainer(page, bag, "До отправки", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], before = f.posts.length;
  f.lose = true;
  f.beforeUpdate = () => { f.unknown = true; f.beforeUpdate = null; };
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Принятое локальное изменение");
  await submitForm(page, "#saveItemBtn", "#itemName"); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(1);
  f.payload = structuredClone(f.payload); f.payload.items[id].name = "Более свежая серверная версия"; f.payload.items[id].weight = 555;
  f.revision++; const adoptedRevision = f.revision;
  f.lose = false; f.unknown = false;
  await reloadApp(page); await page.locator("#syncBtn").click();
  const current = page.locator("#packingView [data-item-id]").filter({ hasText: "Более свежая серверная версия" });
  await expect(current).toHaveCount(1, { timeout: 20000 });
  await expect.poll(() => page.evaluate(revision => Object.entries(localStorage).some(([key, value]) =>
    key.includes(":checkpoint:") && JSON.parse(value).baseline?.stateRevision === revision), adoptedRevision)).toBe(true);
  expect(f.posts.slice(before)).toHaveLength(1, "adoption must not replay the old intent or generate a business write");
  await current.locator(".item-title-hitarea").click(); await page.locator("#itemNote").fill("Редактирование после принятия");
  await submitForm(page, "#saveItemBtn", "#itemNote");
  await synchronize(page, () => f.payload.items[id]?.note === "Редактирование после принятия");
  expect(f.posts.slice(before)).toHaveLength(2);
  expect(f.posts.at(-1).body.baseStateRevision).toBe(adoptedRevision);
  expect(f.posts.at(-1).body.causal.dependsOn).toEqual([]);
  expect(f.payload.items[id].name).toBe("Более свежая серверная версия");
  expect(f.payload.items[id].weight).toBe(555); expect(f.errors).toEqual([]);
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

async function downloadRecovery(page) {
  const downloaded = page.waitForEvent("download");
  await page.locator("#personalSaveRecoveryDialog").getByRole("button", { name: "Скачать копию для восстановления", exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("bike-packing-recovery.json");
  return JSON.parse(await readFile(await file.path(), "utf8"));
}

async function selectCatalogBatch(page, type, names, { action = "delete", ids = null } = {}) {
  await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
  const selector = type === "item" ? "#itemsView [data-list-item-id]" : "#bagsView [data-root-card]";
  const card = index => ids ? page.locator(`${selector}[${type === "item" ? "data-list-item-id" : "data-root-card"}="${ids[index]}"]`)
    : page.locator(selector).filter({ hasText: names[index] });
  for (let index = 0; index < (ids || names).length; index++) {
    await card(index).click({ modifiers: ["Control"], position: { x: 8, y: 8 } });
  }
  await card(0).locator(`[data-${action}-${type === "item" ? "item" : "root"}]`).click();
  await expect(page.locator("#confirmDialog")).toContainText(type === "item" ? "выбранные вещи" : "выбранные сумки");
}

test("actual catalog bulk copies preserve all target IDs through lost ACK and later deletion of the sources", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context);
  const bag = await createRootContainer(page, "Источник сумка первая");
  await createItemInContainer(page, bag, "Источник вещь первая", { weight: "123" });
  await createItemInContainer(page, bag, "Источник вещь вторая", { weight: "234" });
  await createRootContainer(page, "Источник сумка вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2 && Object.keys(f.payload.containers).length === 2);
  const sourceIds = Object.keys(f.payload.items).sort(), before = f.posts.length;
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await selectCatalogBatch(page, "item", [], { action: "copy", ids: sourceIds });
  await page.locator("#confirmOkBtn").click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1); await expect.poll(() => f.injectedFailure).toBe(true);
  const copy = f.posts.at(-1), frozen = JSON.stringify(copy), mapping = copy.body.userCopy.entries;
  expect(mapping.map(entry => entry.sourceId).sort()).toEqual(sourceIds);
  expect(new Set(mapping.map(entry => entry.targetId)).size).toBe(2);
  for (const entry of mapping) {
    expect(copy.body.payload.items[entry.targetId].weight).toBe(copy.body.payload.items[entry.sourceId].weight);
    expect(copy.body.payload.items[entry.targetId].containerId).toBeUndefined();
    for (const layout of Object.values(copy.body.payload.layouts)) expect(layout.arrangement.items).not.toHaveProperty(entry.targetId);
  }
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => Object.keys(f.payload.items).length === 4);
  expect(f.posts.filter(post => post.operationId === copy.operationId)).toHaveLength(1); expect(JSON.stringify(copy)).toBe(frozen);
  await selectCatalogBatch(page, "item", [], { ids: sourceIds });
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => sourceIds.every(id => !f.payload.items[id]));
  expect(Object.keys(f.payload.items).sort()).toEqual(mapping.map(entry => entry.targetId).sort());
  const bagIds = Object.keys(f.payload.containers), beforeBags = f.posts.length;
  await selectCatalogBatch(page, "container", [], { action: "copy", ids: bagIds });
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 4);
  expect(f.posts.length).toBe(beforeBags + 1);
  const bagCopies = f.posts.at(-1).body.userCopy.entries;
  for (const entry of bagCopies) {
    expect(f.payload.containers[entry.targetId].childIds).toBeUndefined();
    expect(f.payload.containers[entry.targetId].itemIds).toBeUndefined();
    for (const layout of Object.values(f.payload.layouts)) {
      expect(layout.arrangement.containers).not.toHaveProperty(entry.targetId);
      expect(layout.arrangement.rootContainerIds).not.toContain(entry.targetId);
    }
  }
  await reloadApp(page);
  expect(Object.keys(f.payload.items).sort()).toEqual(mapping.map(entry => entry.targetId).sort());
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  expect(f.errors).toEqual([]);
});

test("single item and empty bag catalog copy buttons use the same frozen personal queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Одиночная сумка");
  await createItemInContainer(page, bag, "Одиночная вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const itemId = Object.keys(f.payload.items)[0], bagId = Object.keys(f.payload.containers)[0], before = f.posts.length;
  await page.locator('[data-view="items"]').click();
  await page.locator(`[data-copy-item="${itemId}"]`).click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  expect(f.posts.length).toBe(before + 1);
  expect(f.posts.at(-1).body.userCopy.entries).toEqual([{ type: "item", sourceId: itemId, targetId: expect.any(String) }]);
  await page.locator('[data-view="bags"]').click();
  await page.locator(`[data-copy-root="${bagId}"]`).click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  expect(f.posts.length).toBe(before + 2);
  expect(f.posts.at(-1).body.userCopy.entries).toEqual([{ type: "container", sourceId: bagId, targetId: expect.any(String) }]);
  expect(f.errors).toEqual([]);
});

test("quota during real bulk copy retains every new ID in the recovery draft without a partial queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка копирования");
  await createItemInContainer(page, bag, "Копирование первая"); await createItemInContainer(page, bag, "Копирование вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  await selectCatalogBatch(page, "item", [], { action: "copy", ids: Object.keys(f.payload.items) });
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(Object.keys(copy.unconfirmedMemoryDraft.items)).toHaveLength(4);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(Object.keys(f.payload.items)).toHaveLength(2); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

test("actual catalog bulk deletes use one frozen action per selection and recover lost ACK without partial replay", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context);
  const first = await createRootContainer(page, "Пакет сумка первая");
  await createItemInContainer(page, first, "Пакет вещь первая");
  await createItemInContainer(page, first, "Пакет вещь вторая");
  await createRootContainer(page, "Пакет сумка вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2 && Object.keys(f.payload.containers).length === 2);
  const itemIds = Object.keys(f.payload.items).sort(), bagIds = Object.keys(f.payload.containers).sort();
  const before = f.posts.length; f.lose = true;
  f.beforeUpdate = async () => { f.unknown = true; };
  await selectCatalogBatch(page, "item", ["Пакет вещь первая", "Пакет вещь вторая"]);
  await page.locator("#confirmOkBtn").click();
  await page.locator("#syncBtn").click();
  await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const deleted = f.posts.at(-1), frozen = JSON.stringify(deleted);
  expect(deleted.body.userDeletion).toEqual({ type: "batch", operations: itemIds.map(() => ({ type: "item", id: expect.any(String) })) });
  expect(deleted.body.userDeletion.operations.map(entry => entry.id).sort()).toEqual(itemIds);
  expect(deleted.body.payload.items).toEqual({});
  expect(Object.keys(deleted.body.payload.containers).sort()).toEqual(bagIds);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page);
  await synchronize(page, () => Object.keys(f.payload.items).length === 0);
  expect(f.posts.filter(post => post.operationId === deleted.operationId)).toHaveLength(1);
  expect(JSON.stringify(deleted)).toBe(frozen);
  const afterItems = f.posts.length;
  await selectCatalogBatch(page, "container", ["Пакет сумка первая", "Пакет сумка вторая"]);
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.posts.length).toBe(afterItems + 1);
  expect(f.posts.at(-1).body.userDeletion.operations.map(entry => entry.id).sort()).toEqual(bagIds);
  expect(f.payload.layouts["layout-a"].arrangement.rootContainerIds).toEqual([]);
  await reloadApp(page);
  expect(f.payload.items).toEqual({}); expect(f.payload.containers).toEqual({});
  expect(f.errors).toEqual([]);
});

test("deleting the last bag and its inner pocket keeps the items outside all layouts through reload", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Последняя сумка");
  await createItemInContainer(page, bag, "Оставленная вещь");
  await bag.locator("[data-add-to-container]").click();
  await page.locator("#newSubcontainerName").fill("Удаляемый карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const itemId = Object.keys(f.payload.items)[0], rootId = f.payload.layouts["layout-a"].arrangement.rootContainerIds[0];
  const before = f.posts.length;
  await bag.getByRole("heading", { name: "Последняя сумка" }).click();
  await page.locator("#rootContainerDeleteForeverBtn").click();
  await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.containers).length === 0);
  expect(f.posts.length).toBe(before + 1);
  expect(f.posts.at(-1).body.userDeletion).toEqual({ type: "container", id: rootId });
  expect(f.posts.at(-1).body.force).not.toBe(true); expect(f.posts.at(-1).body.forceOverwrite).not.toBe(true);
  expect(f.payload.items[itemId].name).toBe("Оставленная вещь");
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({});
  await reloadApp(page); await page.locator('[data-view="items"]').click();
  await expect(page.locator(`[data-list-item-id="${itemId}"]`)).toContainText("Оставленная вещь");
  expect(f.errors).toEqual([]);
});

async function confirmActiveLayoutDeletion(page) {
  await page.locator("#editLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await page.locator("#deleteEditedLayoutBtn").click();
  await expect(page.locator("#confirmDialog")).toContainText("Удалить укладку");
}

test("actual layout deletion fixes one empty replacement through lost ACK and later uses an existing layout", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Оставляемая сумка");
  await createItemInContainer(page, bag, "Оставляемая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const before = f.posts.length, itemIds = Object.keys(f.payload.items), bagIds = Object.keys(f.payload.containers);
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await confirmActiveLayoutDeletion(page); await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.posts.length).toBe(before + 1);
  await expect.poll(() => f.injectedFailure).toBe(true);
  const action = f.posts.at(-1), replacementId = Object.keys(action.body.payload.layouts)[0];
  expect(action.body.userDeletion).toEqual({ type: "layout", id: "layout-a" });
  expect(Object.keys(action.body.payload.layouts)).toEqual([replacementId]); expect(replacementId).not.toBe("layout-a");
  expect(Object.keys(action.body.payload.items)).toEqual(itemIds); expect(Object.keys(action.body.payload.containers)).toEqual(bagIds);
  expect(action.body.payload.layouts[replacementId].arrangement.items).toEqual({});
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => !f.payload.layouts["layout-a"]);
  await expect(page.locator("#layoutSelect")).toHaveValue(replacementId);
  expect(f.posts.filter(post => post.operationId === action.operationId)).toHaveLength(1);
  await page.locator("#newLayoutBtn").click(); await page.locator("#layoutCreateMode").selectOption("empty");
  await page.locator("#layoutName").fill("Вторая для удаления"); await submitForm(page, "#saveLayoutBtn", "#layoutName");
  await synchronize(page, () => Object.keys(f.payload.layouts).length === 2);
  const secondId = Object.keys(f.payload.layouts).find(id => id !== replacementId), beforeSecond = f.posts.length;
  await confirmActiveLayoutDeletion(page); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => !f.payload.layouts[secondId]);
  expect(f.posts.length).toBe(beforeSecond + 1); expect(Object.keys(f.payload.layouts)).toEqual([replacementId]);
  expect(Object.keys(f.payload.items)).toEqual(itemIds); expect(Object.keys(f.payload.containers)).toEqual(bagIds);
  await reloadApp(page); await expect(page.locator("#layoutSelect")).toHaveValue(replacementId); expect(f.errors).toEqual([]);
});

test("quota during layout deletion keeps its edit window open and exports the complete replacement draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Укладка сбой сумка");
  await createItemInContainer(page, bag, "Укладка сбой вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await confirmActiveLayoutDeletion(page);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.layouts["layout-a"]).toBeUndefined(); expect(Object.keys(draft.layouts)).toHaveLength(1);
  const replacementId = Object.keys(draft.layouts)[0];
  expect(replacementId).toMatch(/^layout-[0-9a-f-]{36}$/); expect(draft.layouts[replacementId].id).toBe(replacementId);
  expect(draft.layouts[replacementId].arrangement.rootContainerIds).toEqual([]);
  expect(Object.keys(draft.items)).toEqual(Object.keys(f.payload.items)); expect(Object.keys(draft.containers)).toEqual(Object.keys(f.payload.containers));
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.payload.layouts["layout-a"]).toBeTruthy(); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function openPreparedHistoryRestore(page, f, snapshot, scoped = false) {
  f.history = [{ id: 101, listId: f.listId, source: "bike_packing_list_history", createdAt: "2026-09-05T10:00:00Z",
    snapshotKind: scoped ? "undo" : "daily", changeScope: scoped ? "layout" : "global", affectedLayoutIds: scoped ? ["layout-a"] : [],
    action: { type: "layout_change" }, payload: structuredClone(snapshot) }];
  await page.locator("#menuBtn").click(); await page.locator("#historyBtn").click();
  await expect(page.locator("#historyDialog [data-restore-history]")).toHaveCount(1);
  await page.locator("#historyDialog [data-restore-history]").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
}

for (const scoped of [false, true]) test(`actual ${scoped ? "scoped" : "full"} history restore survives lost ACK and reload with one fixed action`, async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "До восстановления");
  await createItemInContainer(page, bag, "Сохранённая вещь");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const snapshot = structuredClone(f.payload), originalId = Object.keys(snapshot.containers)[0];
  await createRootContainer(page, "После точки истории");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 2);
  const extraId = Object.keys(f.payload.containers).find(id => id !== originalId), before = f.posts.length;
  await openPreparedHistoryRestore(page, f, snapshot, scoped);
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#historyDialog")).not.toBeVisible();
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts).toHaveLength(before + 1);
  const restored = f.posts.at(-1); expect(restored.kind).toBe("list.restore");
  expect(restored.body.historyRestore.historyId).toBe(101);
  expect(restored.body.historyRestore.layoutIds).toEqual(scoped ? ["layout-a"] : []);
  expect(restored.body.payload.layouts["layout-a"].arrangement.rootContainerIds).toEqual([originalId]);
  expect(Boolean(restored.body.payload.containers[extraId])).toBe(scoped);
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 1);
  expect(f.posts).toHaveLength(before + 1); expect(f.posts.filter(post => post.operationId === restored.operationId)).toHaveLength(1);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(1);
  await createRootContainer(page, "Следующая после восстановления");
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 2);
  expect(f.posts.at(-1).kind).toBe("list.update"); expect(f.posts.at(-1).body.historyRestore).toBeUndefined();
  expect(f.errors).toEqual([]);
});

test("quota before history restore keeps the history window and complete recovery candidate without changing the list", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), snapshot = structuredClone(f.payload);
  await createRootContainer(page, "Не теряем при отказе");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  await openPreparedHistoryRestore(page, f, snapshot);
  const before = f.posts.length, server = structuredClone(f.payload);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#historyDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.containers).toEqual({}); expect(copy.unconfirmedMemoryDraft.items).toEqual({});
  expect(f.posts).toHaveLength(before); expect(f.payload).toEqual(server); expect(f.errors).toEqual([]);
});

function replacementPayload() {
  const payload = initialPayload(), layout = payload.layouts["layout-a"];
  payload.items = { source: { id: "source", name: "Исходная вещь", containerId: "bag", quantity: 1 },
    replacement: { id: "replacement", name: "Вещь для замены", containerId: "", quantity: 1 },
    inside: { id: "inside", name: "Вещь в кармане", containerId: "pocket", quantity: 1 } };
  payload.containers = Object.fromEntries(["bag", "pocket", "newbag", "newpocket"].map(id => [id, {
    id, name: { bag: "Исходная сумка", pocket: "Временный карман", newbag: "Сумка для замены", newpocket: "Съёмная сумка" }[id],
    parentId: id === "pocket" ? "bag" : null, nestable: id === "newpocket", childIds: [], itemIds: [], order: []
  }]));
  Object.assign(payload.containers.bag, { childIds: ["pocket"], itemIds: ["source"], order: [{ type: "item", id: "source" }, { type: "container", id: "pocket" }] });
  Object.assign(payload.containers.pocket, { itemIds: ["inside"], order: [{ type: "item", id: "inside" }] });
  layout.rootContainerIds = ["bag"];
  layout.arrangement = { rootContainerIds: ["bag"], containers: Object.fromEntries(["bag", "pocket"].map(id => {
    const { parentId, childIds, itemIds, order } = payload.containers[id]; return [id, { parentId: parentId || "", childIds, itemIds, order }];
  })), items: { source: "bag", inside: "pocket" }, itemQuantities: { source: 3, inside: 2 }, packedItems: {} };
  return payload;
}

test("actual replacement pickers freeze item bag and pocket swaps through lost ACK without losing quantities", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context, { payload: replacementPayload() });
  await synchronize(page, () => Boolean(f.payload.items.source));
  for (const [source, replacement, action] of [["source", "replacement", "replace-item"], ["bag", "newbag", "replace-container"], ["pocket", "newpocket", "replace-container"]]) {
    const before = f.posts.length; f.lose = true; f.injectedFailure = false; f.beforeUpdate = () => { f.unknown = true; };
    if (action === "replace-item") {
      await page.locator(`#packingView [data-item-id="${source}"] .item-title-hitarea`).click();
      await page.locator("#itemReplaceBtn").click(); await page.locator(`[data-add-existing-item="${replacement}"]`).click();
    } else {
      if (source === "bag") await page.locator('#packingView [data-root-container-id="bag"]').getByRole("heading", { name: "Исходная сумка" }).click();
      else await page.locator('#packingView [data-subcontainer-id="pocket"] .subcontainer-title').click();
      await page.locator("#rootContainerReplaceBtn").click(); await page.locator(`[data-add-layout-root="${replacement}"]`).click();
    }
    await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
    expect(f.errors).toEqual([]); expect(f.posts.length).toBe(before + 1); const post = f.posts.at(-1);
    expect(post.body.userPlacement.action).toBe(action); expect(post.body.userPlacement.ids).toEqual([source]);
    expect(post.body.userPlacement.replacementId).toBe(replacement);
    f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
    await synchronize(page, () => f.receipts.has(post.operationId));
    expect(f.posts.filter(entry => entry.operationId === post.operationId)).toHaveLength(1);
  }
  const placed = f.payload.layouts["layout-a"].arrangement;
  expect(placed.rootContainerIds).toEqual(["newbag"]); expect(placed.items).toEqual({ replacement: "newbag", inside: "newpocket" });
  expect(placed.itemQuantities).toEqual({ replacement: 3, inside: 2 }); expect(placed.containers.newpocket.parentId).toBe("newbag");
  expect(f.payload.items.source).toBeTruthy(); expect(f.payload.containers.bag).toBeTruthy(); expect(f.payload.containers.pocket).toBeUndefined();
  expect(Object.keys(f.payload.containers).sort()).toEqual(["bag", "newbag", "newpocket"]); expect(f.errors).toEqual([]);
});

test("quota in a replacement picker preserves its complete candidate and leaves the existing queue unchanged", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context, { payload: replacementPayload() });
  await synchronize(page, () => Boolean(f.payload.items.source));
  await page.locator('#packingView [data-subcontainer-id="pocket"] .subcontainer-title').click();
  await page.locator("#rootContainerReplaceBtn").click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator('[data-add-layout-root="newpocket"]').click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible(); await expect(page.locator("#layoutRootDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.containers.pocket).toBeUndefined(); expect(draft.layouts["layout-a"].arrangement.items.inside).toBe("newpocket");
  expect(draft.layouts["layout-a"].arrangement.itemQuantities).toEqual({ source: 3, inside: 2 });
  expect(Object.keys(draft.items).sort()).toEqual(Object.keys(f.payload.items).sort());
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.payload.containers.pocket).toBeTruthy(); expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function dispatchPackingDrop(page, handle, containerId) {
  // Exercise the application's actual HTML5 drag handlers, not an exposed
  // mutation hook. Pointer/touch gesture coverage remains a separate check.
  const transfer = await page.evaluateHandle(() => new DataTransfer());
  await handle.dispatchEvent("dragstart", { dataTransfer: transfer });
  const zone = page.locator(`.dropzone[data-container-id="${containerId}"]`).first();
  await zone.scrollIntoViewIfNeeded(); const box = await zone.boundingBox();
  const point = { clientX: box.x + box.width / 2, clientY: box.y + box.height - 2, dataTransfer: transfer };
  await zone.dispatchEvent("dragover", point); await expect(zone.locator(":scope > .drop-placeholder")).toHaveCount(1);
  await zone.dispatchEvent("drop", point); await transfer.dispose();
}

test("drag drop item and pocket keep frozen targets through lost ACK and reload", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Исходная для перемещения");
  const item = await createItemInContainer(page, bag, "Три вещи для перемещения");
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3"); await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await bag.locator("[data-add-to-container]").click(); await page.locator("#newSubcontainerName").fill("Перемещаемый карман");
  await submitForm(page, "#createSubcontainerBtn", "#newSubcontainerName");
  await createRootContainer(page, "Целевая для перемещения"); await synchronize(page, () => Object.keys(f.payload.containers).length === 3);
  const itemId = Object.keys(f.payload.items)[0], pocketId = Object.values(f.payload.containers).find(record => record.name === "Перемещаемый карман").id;
  const targetId = Object.values(f.payload.containers).find(record => record.name === "Целевая для перемещения").id;
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await dispatchPackingDrop(page, page.locator(`[data-item-drag="${itemId}"]`), targetId);
  expect(f.errors).toEqual([]); await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const move = f.posts.at(-1);
  expect(move.body.userPlacement.action).toBe("move-item"); expect(move.body.userPlacement.targetContainerId).toBe(targetId);
  expect(move.body.payload.layouts["layout-a"].arrangement.itemQuantities[itemId]).toBe(3);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.items[itemId] === targetId);
  expect(f.posts.filter(post => post.operationId === move.operationId)).toHaveLength(1);
  await dispatchPackingDrop(page, page.locator(`[data-subcontainer-id="${pocketId}"] .subcontainer-title`).first(), targetId);
  await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.containers[pocketId].parentId === targetId);
  expect(f.posts.at(-1).body.userPlacement.action).toBe("move-container");
  await reloadApp(page); expect(Object.keys(f.payload.items)).toEqual([itemId]); expect(Object.keys(f.payload.containers)).toHaveLength(3);
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[itemId]).toBe(3); expect(f.errors).toEqual([]);
});

test("pointer grouping reserves one group and preserves quantity through lost ACK", async ({ page, context }) => {
  test.setTimeout(120000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка группировки");
  const first = await createItemInContainer(page, bag, "Первый для группы"); await createItemInContainer(page, bag, "Второй для группы");
  await first.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3"); await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await synchronize(page, () => Object.values(f.payload.layouts["layout-a"].arrangement.itemQuantities).includes(3));
  const firstId = Object.values(f.payload.items).find(record => record.name === "Первый для группы").id;
  const secondId = Object.keys(f.payload.items).find(id => id !== firstId), before = f.posts.length;
  f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  const handle = page.locator(`#packingView [data-item-drag="${firstId}"]`); await handle.scrollIntoViewIfNeeded();
  const target = page.locator(`#packingView [data-item-id="${secondId}"]`), start = await handle.boundingBox();
  if (test.info().project.name === "mobile-webkit") {
    // iPhone uses the held touch path, not the desktop mouse path. Dispatch
    // touch events through that actual handler and release on its live target.
    await handle.evaluate((element, point) => {
      const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
      const event = new Event("touchstart", { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: [touch] }, targetTouches: { value: [touch] }, changedTouches: { value: [touch] } });
      element.dispatchEvent(event);
    }, { x: start.x + start.width / 2, y: start.y + start.height / 2 });
    await expect(page.locator("body")).toHaveClass(/dragging-ui/);
    await expect.poll(async () => {
      const current = await target.boundingBox();
      return handle.evaluate((element, point) => {
        const touch = { identifier: 1, target: element, clientX: point.x, clientY: point.y };
        const dispatch = (type, touches) => {
          const event = new Event(type, { bubbles: true, cancelable: true });
          Object.defineProperties(event, { touches: { value: touches }, targetTouches: { value: touches }, changedTouches: { value: [touch] } });
          element.dispatchEvent(event);
        };
        dispatch("touchmove", [touch]);
        if (!document.querySelector(".item-card.group-target")) return false;
        dispatch("touchend", []);
        return true;
      }, { x: current.x + current.width / 2, y: current.y + current.height / 2 });
    }).toBe(true);
  } else {
    await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(start.x + start.width / 2 + 20, start.y + start.height / 2 + 20, { steps: 5 });
    await expect.poll(async () => {
      const current = await target.boundingBox();
      await page.mouse.move(current.x + current.width / 2, current.y + current.height / 2);
      return (await target.getAttribute("class")).includes("group-target");
    }).toBe(true);
    await page.mouse.up();
  }
  await expect(page.locator("[data-subcontainer-id]")).toHaveCount(1);
  expect(f.errors).toEqual([]); await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const group = f.posts.at(-1), groupId = group.body.userPlacement.groupId;
  expect(group.body.userPlacement.action).toBe("group-items"); expect(groupId).toMatch(/^container-[0-9a-f-]{36}$/);
  f.lose = false; f.unknown = false; f.beforeUpdate = null; await reloadApp(page);
  await synchronize(page, () => Boolean(f.payload.containers[groupId]));
  expect(f.posts.filter(post => post.operationId === group.operationId)).toHaveLength(1);
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({ [firstId]: groupId, [secondId]: groupId });
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[firstId]).toBe(3); expect(Object.keys(f.payload.containers)).toHaveLength(2);
  expect(f.errors).toEqual([]);
});

test("packing marks quantity and both item-removal buttons keep frozen actions through lost ACK", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка отметок");
  const first = await createItemInContainer(page, bag, "Первая для отметок");
  await createItemInContainer(page, bag, "Вторая для отметок");
  await first.locator(".item-title-hitarea").click(); await page.locator("#itemQuantity").fill("3");
  await submitForm(page, "#saveItemBtn", "#itemQuantity");
  await synchronize(page, () => Object.values(f.payload.layouts["layout-a"].arrangement.itemQuantities).includes(3));
  const firstId = Object.values(f.payload.items).find(item => item.name === "Первая для отметок").id;
  const ids = Object.keys(f.payload.items), secondId = ids.find(id => id !== firstId);
  await page.locator("#menuBtn").click(); await page.locator("#collectionMenuBtn").click();
  for (const id of ids) {
    await page.locator(`[data-toggle-packed="${id}"]`).click();
    expect(f.errors).toEqual([]);
    await expect(page.locator(`[data-toggle-packed="${id}"]`)).toHaveAttribute("title", "Собрано");
  }
  await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.packedItems).length === 2);
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await page.locator("#unpackAllBtn").click(); await page.locator("#confirmOkBtn").click(); await page.locator("#syncBtn").click();
  await expect.poll(() => f.injectedFailure).toBe(true); expect(f.posts.length).toBe(before + 1);
  const unpack = f.posts.at(-1); expect(unpack.body.userPlacement.packed).toBe(false);
  expect(unpack.body.userPlacement.ids.sort()).toEqual(ids.sort()); expect(unpack.body.payload.layouts["layout-a"].arrangement.packedItems).toEqual({});
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.packedItems).length === 0);
  expect(f.posts.filter(post => post.operationId === unpack.operationId)).toHaveLength(1);
  expect(f.payload.layouts["layout-a"].arrangement.itemQuantities[firstId]).toBe(3);
  await page.locator(`[data-item-id="${firstId}"] .item-title-hitarea`).click(); await page.locator("#itemRemoveFromLayoutBtn").click();
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => !f.payload.layouts["layout-a"].arrangement.items[firstId]);
  expect(f.payload.items[firstId]).toBeTruthy(); expect(f.posts.at(-1).body.userPlacement.ids).toEqual([firstId]);
  await page.locator(`[data-remove-from-layout="${secondId}"]`).click(); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => Object.keys(f.payload.layouts["layout-a"].arrangement.items).length === 0);
  expect(Object.keys(f.payload.items).sort()).toEqual(ids.sort()); await reloadApp(page); expect(f.errors).toEqual([]);
});

test("removing a populated root keeps ten items outside the layout without regression repair after reload", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка десяти вещей");
  for (let i = 0; i < 10; i++) await createItemInContainer(page, bag, `Вещь размещения ${i + 1}`);
  await synchronize(page, () => Object.keys(f.payload.items).length === 10);
  const before = f.posts.length, bagId = Object.keys(f.payload.containers)[0], ids = Object.keys(f.payload.items).sort();
  await bag.getByRole("heading", { name: "Сумка десяти вещей" }).click(); await page.locator("#rootContainerRemoveFromLayoutBtn").click();
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => f.payload.layouts["layout-a"].arrangement.rootContainerIds.length === 0);
  expect(f.posts.length).toBe(before + 1); const action = f.posts.at(-1);
  expect(action.body.userPlacement.action).toBe("remove-container"); expect(action.body.userPlacement.removedItemIds.sort()).toEqual(ids);
  expect(Object.keys(f.payload.items).sort()).toEqual(ids); expect(Object.keys(f.payload.containers)).toEqual([bagId]);
  expect(f.payload.layouts["layout-a"].arrangement.items).toEqual({}); await reloadApp(page);
  await expect(page.locator("#packingView [data-root-container-id]")).toHaveCount(0);
  await page.locator('[data-view="items"]').click(); await expect(page.locator("[data-list-item-id]")).toHaveCount(10);
  expect(f.errors).toEqual([]);
});

test("quota removing a root leaves its dialog open and retains all items with the full placement draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка перед сбоем размещения");
  await createItemInContainer(page, bag, "Сохраняемая вне укладки вещь"); await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await bag.getByRole("heading", { name: "Сумка перед сбоем размещения" }).click(); await page.locator("#rootContainerRemoveFromLayoutBtn").click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible(); const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.layouts["layout-a"].arrangement.items).toEqual({});
  expect(Object.keys(copy.unconfirmedMemoryDraft.items)).toEqual(Object.keys(f.payload.items));
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toEqual(Object.keys(f.payload.containers));
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

async function renameDictionaryInUi(page, type, from, to) {
  await page.locator(`[data-edit-${type}="${from}"]`).click();
  await page.locator(`[data-dictionary-edit-input="${type}"]`).fill(to);
  await submitForm(page, `[data-save-${type}="${from}"]`, `[data-dictionary-edit-input="${type}"]`);
}

test("dictionary UI freezes add rename delete and every linked owner through lost ACK and reload", async ({ page, context }) => {
  test.setTimeout(150000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка справочника");
  await createItemInContainer(page, bag, "Вещь справочника");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const itemId = Object.keys(f.payload.items)[0], bagId = Object.keys(f.payload.containers)[0];
  expect(f.payload.items[itemId].location).toBe("Велосипед"); expect(f.payload.containers[bagId].location).toBe("Велосипед");
  await page.locator('[data-view="settings"]').click();
  await page.locator("#locationInput").fill("Лагерь"); await submitForm(page, "#locationAdd", "#locationInput");
  await synchronize(page, () => f.payload.locations.includes("Лагерь"));
  expect(f.posts.at(-1).body.userDictionary.action).toBe("add");
  const before = f.posts.length; f.lose = true; f.beforeUpdate = async () => { f.unknown = true; };
  await renameDictionaryInUi(page, "location", "Велосипед", "Байк");
  await page.locator("#syncBtn").click(); await expect.poll(() => f.injectedFailure).toBe(true);
  expect(f.posts.length).toBe(before + 1); const rename = f.posts.at(-1);
  expect(rename.body.userDictionary.items).toEqual([itemId]); expect(rename.body.userDictionary.containers).toEqual([bagId]);
  expect(rename.body.payload.items[itemId].location).toBe("Байк"); expect(rename.body.payload.containers[bagId].location).toBe("Байк");
  f.lose = false; f.unknown = false; f.beforeUpdate = null;
  await reloadApp(page); await synchronize(page, () => f.payload.locations.includes("Байк"));
  expect(f.posts.filter(post => post.operationId === rename.operationId)).toHaveLength(1);
  await page.locator('[data-view="settings"]').click(); await page.locator('[data-remove-location="Байк"]').click();
  await expect(page.locator("#confirmDialog")).toContainText("Лагерь");
  await page.locator("#confirmOkBtn").click(); await synchronize(page, () => !f.payload.locations.includes("Байк"));
  expect(f.payload.items[itemId].location).toBe("Лагерь"); expect(f.payload.containers[bagId].location).toBe("Лагерь");
  await page.locator("#categoryInput").fill("Питание"); await submitForm(page, "#categoryAdd", "#categoryInput");
  await synchronize(page, () => f.payload.categories.includes("Питание"));
  await renameDictionaryInUi(page, "category", "Питание", "Еда"); await synchronize(page, () => f.payload.categories.includes("Еда"));
  await page.locator('[data-remove-category="Еда"]').click(); await page.locator("#confirmOkBtn").click();
  await synchronize(page, () => !f.payload.categories.includes("Еда")); await reloadApp(page);
  expect(f.payload.items[itemId].location).toBe("Лагерь"); expect(f.errors).toEqual([]);
});

test("quota during dictionary deletion preserves the entire linked-record draft and old queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка перед удалением места");
  await createItemInContainer(page, bag, "Вещь перед удалением места");
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  await page.locator('[data-view="settings"]').click(); await page.locator('[data-remove-location="Велосипед"]').click();
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click(); await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page), draft = copy.unconfirmedMemoryDraft;
  expect(draft.locations).toEqual([]); expect(Object.values(draft.items)[0].location).toBe(""); expect(Object.values(draft.containers)[0].location).toBe("");
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.payload.locations).toContain("Велосипед"); expect(f.errors).toEqual([]);
});

test("oversized layout notes stop before publication and remain complete in the recovery copy", async ({ page, context }) => {
  test.setTimeout(180000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка перед большим изменением");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length, notes = "я".repeat(1600000);
  await page.locator("#editLayoutBtn").click(); await page.locator("#layoutEditNotes").fill(notes);
  await submitForm(page, "#saveEditedLayoutBtn", "#layoutEditNotes");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.reasonCode).toBe("payload-size"); expect(copy.unconfirmedMemoryDraft.layouts["layout-a"].notes).toBe(notes);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(f.posts.length).toBe(postsBefore); expect(f.errors).toEqual([]);
});

test("quota during real bulk deletion preserves the entire unsaved selection draft and the old queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  const bag = await createRootContainer(page, "Сумка до пакетного сбоя");
  await createItemInContainer(page, bag, "Удаление первая");
  await createItemInContainer(page, bag, "Удаление вторая");
  await synchronize(page, () => Object.keys(f.payload.items).length === 2);
  await selectCatalogBatch(page, "item", ["Удаление первая", "Удаление вторая"]);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.locator("#confirmOkBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.unconfirmedMemoryDraft.items).toEqual({});
  expect(Object.keys(copy.unconfirmedMemoryDraft.containers)).toHaveLength(1);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(Object.keys(f.payload.items)).toHaveLength(2); expect(f.posts.length).toBe(postsBefore);
  // The async bulk handler must absorb the already surfaced latch failure.
  expect(f.errors).toEqual([]);
});

test("quota failure in a real form pauses editing and exports the unsaved draft without rewriting the queue", async ({ page, context }, info) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Уже сохранённая сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const before = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort());
  const postsBefore = f.posts.length;
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#rootContainerName").fill("Несохранённая сумка");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:")) throw new DOMException("Injected quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  const warning = page.locator("#personalSaveRecoveryDialog");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("не хватает места");
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "error");
  await page.keyboard.press("Escape");
  await expect(warning).toBeVisible();
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  const copy = await downloadRecovery(page);
  expect(copy.scopeKey).toBe("id:actor-a");
  expect(copy.automaticImportAllowed).toBe(false);
  expect(Object.values(copy.unconfirmedMemoryDraft.containers).some(entry => entry.name === "Несохранённая сумка")).toBe(true);
  expect(copy.journalEntries.map(({ key, value }) => [key, value]).sort()).toEqual(before);
  expect(await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-save-v1:")).sort())).toEqual(before);
  expect(f.posts.length).toBe(postsBefore);
  const box = await warning.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.screenshot({ path: info.outputPath("personal-save-quota.png") });
  expect(f.errors).toEqual([]);
});

test("corrupt journal at reload shows a blocking recovery dialog without empty-list fallback or POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Сумка до повреждения");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const corruptedKey = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.startsWith("bike-packing-personal-save-v1:") && /:[0-9a-f-]{36}$/.test(key));
    localStorage.setItem(key, "broken journal retained verbatim");
    localStorage.setItem("fixture-auth-token", "not-for-export");
    return key;
  });
  const postsBefore = f.posts.length;
  f.reloading = true;
  await page.reload();
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible({ timeout: 20000 });
  f.reloading = false;
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("недоступна или повреждена");
  const copy = await downloadRecovery(page);
  expect(copy.journalEntries.find(entry => entry.key === corruptedKey).value).toBe("broken journal retained verbatim");
  expect(copy.memoryDraftAvailable).toBe(false);
  expect(JSON.stringify(copy)).not.toContain("not-for-export");
  expect(await page.evaluate(key => localStorage.getItem(key), corruptedKey)).toBe("broken journal retained verbatim");
  expect(f.posts.length).toBe(postsBefore);
  expect(Object.values(f.payload.containers).some(entry => entry.name === "Сумка до повреждения")).toBe(true);
  expect(f.errors).toEqual([]);
});

test("failed local ACK checkpoint pauses the UI and reload settles the same receipt without another POST", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  await createRootContainer(page, "Подтверждённая исходная сумка");
  await synchronize(page, () => Object.keys(f.payload.containers).length === 1);
  const precedingIds = f.posts.map(post => post.operationId);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (String(key).startsWith("bike-packing-personal-save-v1:") && String(key).includes(":applied:")) {
        throw new DOMException("Injected checkpoint quota", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await createRootContainer(page, "Сумка с потерянной локальной отметкой");
  // Let autosave reach the injected checkpoint failure; on mobile the modal
  // may already cover the manual sync button by the time the form closes.
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "error");
  expect(f.posts).toHaveLength(precedingIds.length + 1);
  const operationId = f.posts.at(-1).operationId;
  const copy = await downloadRecovery(page);
  expect(copy.journalEntries.some(entry => entry.key.endsWith(`:${operationId}`))).toBe(true);
  expect(copy.journalEntries.some(entry => entry.key.includes(`:applied:${operationId}`))).toBe(false);
  page.once("dialog", dialog => dialog.accept()); // Explicitly leave only after the recovery download.
  await reloadApp(page);
  await synchronize(page, () => Object.values(f.payload.containers).some(entry => entry.name === "Сумка с потерянной локальной отметкой"));
  expect(f.posts.map(post => post.operationId)).toEqual([...precedingIds, operationId]);
  await expect(page.locator("#personalSaveRecoveryDialog")).toHaveCount(0);
  expect(f.errors).toEqual([]);
});

test("a stale real tab cannot save over another tab and can export its separate draft", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context);
  const other = await context.newPage();
  other.personalFixture = f;
  await other.goto(origin);
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  await createRootContainer(other, "Сумка другой вкладки");
  await page.locator("[data-add-packing-root]").click();
  await page.locator("#createRootForLayoutBtn").click();
  await page.locator("#rootContainerName").fill("Сумка старой вкладки");
  await submitForm(page, "#saveRootContainerBtn", "#rootContainerName");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Другая вкладка");
  const copy = await downloadRecovery(page);
  expect(Object.values(copy.unconfirmedMemoryDraft.containers).some(entry => entry.name === "Сумка старой вкладки")).toBe(true);
  expect(copy.journalEntries.some(entry => entry.value.includes("Сумка другой вкладки"))).toBe(true);
  expect(copy.journalEntries.some(entry => entry.value.includes("Сумка старой вкладки"))).toBe(false);
  expect(f.posts.some(post => Object.values(post.body.payload.containers).some(entry => entry.name === "Сумка старой вкладки"))).toBe(false);
  expect(f.errors).toEqual([]);
});

test("a stale real editor can reconcile its retained draft with the other tab and continue the same queue", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка двух вкладок");
  const item = await createItemInContainer(page, bag, "Общее начало", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], other = await context.newPage(); other.personalFixture = f;
  await other.goto(origin); await expect(other.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  await other.locator("#packingView [data-item-id]").filter({ hasText: "Общее начало" }).locator(".item-title-hitarea").click();
  await other.locator("#itemWeight").fill("333"); await submitForm(other, "#saveItemBtn", "#itemWeight");
  await expect(other.locator("#itemDialog")).not.toBeVisible();
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Черновик старой вкладки");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await expect(page.locator("#personalSaveRecoveryDialog")).toBeVisible();
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  await expect(page.locator("#itemDialog")).not.toBeVisible();
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Черновик старой вкладки" })).toHaveCount(1);
  await synchronize(page, () => f.payload.items[id]?.name === "Черновик старой вкладки" && f.payload.items[id]?.weight === 333);
  expect(new Set(f.posts.map(post => post.operationId)).size).toBe(f.posts.length);
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "Черновик старой вкладки" })).toHaveCount(1);
  expect(f.payload.items[id].weight).toBe(333); expect(f.errors).toEqual([]);
});

test("stale draft choices can be postponed and must be compared again if the other tab edits during the dialog", async ({ page, context }) => {
  test.setTimeout(90000);
  const f = await setup(page, context), bag = await createRootContainer(page, "Сумка сравнения вкладок");
  const item = await createItemInContainer(page, bag, "Общая вещь", { weight: "100" });
  await synchronize(page, () => Object.keys(f.payload.items).length === 1);
  const id = Object.keys(f.payload.items)[0], other = await context.newPage(); other.personalFixture = f;
  await other.goto(origin); await expect(other.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await expect(other.locator("#layoutSelect option[value='layout-a']")).toBeAttached({ timeout: 20000 });
  await other.locator("#layoutSelect").selectOption("layout-a");
  const editOther = async (from, to) => {
    await other.locator("#packingView [data-item-id]").filter({ hasText: from }).locator(".item-title-hitarea").click();
    await other.locator("#itemName").fill(to); await submitForm(other, "#saveItemBtn", "#itemName");
    await expect(other.locator("#itemDialog")).not.toBeVisible();
  };
  await editOther("Общая вещь", "Другой вариант 1");
  await item.locator(".item-title-hitarea").click(); await page.locator("#itemName").fill("Мой отложенный вариант");
  await submitForm(page, "#saveItemBtn", "#itemName");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await expect(page.locator("#conflictList")).toContainText("другой вкладки");
  await expect(page.locator("#conflictList input:checked")).toHaveCount(0);
  await page.locator("#conflictCancelBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Сравнение отложено");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictDialog")).toBeVisible();
  await editOther("Другой вариант 1", "Другой вариант 2");
  await page.locator('#conflictList input[value="local"]').check(); await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).toContainText("Повторите сравнение");
  await page.locator("[data-recover-stale-draft]").click();
  await expect(page.locator("#conflictList")).toContainText("Другой вариант 2");
  await page.locator('#conflictList input[value="remote"]').check(); await page.locator("#conflictApplyBtn").click();
  await expect(page.locator("#personalSaveRecoveryDialog")).not.toBeVisible();
  await synchronize(page, () => f.payload.items[id]?.name === "Другой вариант 2");
  expect(f.posts.some(post => post.body.payload.items[id]?.name === "Мой отложенный вариант")).toBe(false);
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
