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
        if (body.kind === "list.update" && state.beforeUpdate) await state.beforeUpdate(body);
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
  await expect(page.locator("#syncStatus")).toContainText("по-разному", { timeout: 20000 });
  expect(f.posts.slice(before)).toHaveLength(1);
  expect(f.payload.items[id].name).toBe("На другом устройстве");
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
  delete f.payload.items[id]; f.revision++;
  await page.locator("#syncBtn").click();
  await expect(page.locator("#syncStatus")).toContainText("по-разному");
  expect(f.posts.slice(before)).toHaveLength(1); expect(f.payload.items[id]).toBeUndefined();
  await reloadApp(page);
  await expect(page.locator("#packingView [data-item-id]").filter({ hasText: "На этом устройстве" })).toHaveCount(1);
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
  await page.locator("#personalSaveRecoveryDialog button").click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("bike-packing-recovery.json");
  return JSON.parse(await readFile(await file.path(), "utf8"));
}

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
