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
async function fixture(page, context, { published = false, shared = false, hydrate = false, withContainers = false, layoutOrder = null } = {}) {
  const state = { payload: template(), revision: 7, visibility: "private", receipts: new Map(), posts: [], cancels: [], errors: [], lose: false, hidden: false, hold: null };
  if (layoutOrder !== null) state.payload.layouts["layout-a"].layoutOrder = layoutOrder;
  if (withContainers) {
    state.payload.containers.bag = { id: "bag", name: "Сумка шаблона", weight: 300, location: "Велосипед", categories: [], parentId: "", itemIds: [], childIds: ["pocket"] };
    state.payload.containers.pocket = { id: "pocket", name: "Карман шаблона", weight: 20, location: "Велосипед", categories: [], parentId: "bag", itemIds: ["pump"], childIds: [] };
    state.payload.items.pump.containerId = "pocket";
    state.payload.layouts["layout-a"].rootContainerIds = ["bag"];
    state.payload.layouts["layout-a"].arrangement = { rootContainerIds: ["bag"],
      containers: { bag: { parentId: "", itemIds: [], childIds: ["pocket"], order: [{ type: "container", id: "pocket" }] },
        pocket: { parentId: "bag", itemIds: ["pump"], childIds: [], order: [{ type: "item", id: "pump" }] } },
      items: { pump: "pocket" }, itemQuantities: { pump: 2 }, packedItems: {}, itemQuantityMigrationVersion: 3 };
  }
  const listId = shared ? "public-shared-layout-ui" : "public-demo-state-ui", itemKey = shared ? "shared-layout:ui" : "demo-state:ui";
  const metadata = { title: "Проверяемый шаблон", description: "", language: "ru" }; state.hydrate = hydrate;
  state.visibility = published ? "public" : "private";
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
      else if (suffix === "/bike-packing/admin/template-records") data = { ok: true, lists: state.hydrate ? [{ id: listId, listId,
        publicTemplateKind: shared ? "shared-layout" : "demo", language: "ru", title: "Catalog title", published: false,
        visibility: "private", adminPayloadEndpoint: "/legacy-read-must-not-be-used" }] : [] };
      else if (suffix.startsWith("/bike-packing/lists/personal-list")) data = { ok: true, list: { id: "personal-list", ownerId: "admin-a", role: "owner", canEdit: true, stateRevision: 1, payload: personal() }, payload: personal(), stateRevision: 1 };
      else if (suffix === "/bike-packing/admin/template-operations/prepare") data = { ok: true, actorId: "admin-a", environment: "bike-packing-experiment", itemKey, listId,
        sourceType: "public-template", exists: true, deleted: false, stateRevision: state.revision, visibility: state.visibility, metadata, payload: state.payload, indexes: [] };
      else if (suffix === "/bike-packing/admin/template-operations" || suffix.endsWith("/cancel")) {
        const input = request.postDataJSON(), intent = adminTemplateIntent({ actorId: input.expectedActorId, ...input }), { id, ...binding } = intent;
        const cancel = suffix.endsWith("/cancel"); (cancel ? state.cancels : state.posts).push(input);
        if (!cancel && state.blockBusiness) return route.abort("failed");
        if (!state.receipts.has(id)) {
          if (cancel) {
            const { body, ...identity } = binding;
            state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "rejected" },
              result: { status: 409, payload: { ok: false, code: "operation_cancelled", cancellation: { version: 1, operationId: id, noBusinessEffects: true, operationCannotApply: true } } } });
          } else {
          const base = intent.body.base.stateRevision ?? state.receipts.get(intent.body.base.operationId)?.result.payload.stateRevision;
          if (base !== state.revision) {
            const { body, ...identity } = binding;
            const receipt = { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "rejected" },
              result: { status: 409, payload: { ok: false, code: "template_revision_conflict" } } };
            state.receipts.set(id, receipt); return route.fulfill({ headers, json: { ok: true, ...receipt } });
          }
          state.revision++;
          if (intent.kind === "template.save") state.payload = structuredClone(intent.body.payload);
          if (intent.kind === "template.publication") state.visibility = intent.body.published ? "public" : "private";
          if (intent.kind === "template.archive") { state.visibility = "private"; state.archived = true; }
          if (intent.kind === "template.metadata") Object.assign(metadata, intent.body.metadata);
          const { body, ...identity } = binding;
          state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "committed" },
            result: { status: 200, payload: { ok: true, listId, itemKey, stateRevision: state.revision, visibility: state.visibility, indexes: [] } } });
          }
        }
        if (state.hold) await state.hold;
        if (state.lose || cancel && state.cancelLose) { state.hidden = true; return route.abort("failed"); }
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
  await page.goto(origin);
  if (hydrate || shared) {
    await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => window.__adminUiTest?.user()?.id === "admin-a");
    if (hydrate) await page.evaluate(() => __adminUiTest.refreshDrafts());
    await page.evaluate(target => __adminUiTest.openPrepared(target), shared ? { type: "shared", sharedId: "ui" } : { type: "demo", demoListId: listId, language: "ru" });
    await page.waitForFunction(() => Object.values(__adminUiTest.state().layouts).some(layout => layout.adminCausalSource));
  } else await openEditor(page);
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

async function newDraftFixture(page, context) {
  const state = await fixture(page, context), created = new Map(); state.created = created;
  state.createLose = false; state.createHidden = new Set();
  await context.route("**/bike-packing/admin/template-operations**", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith("/prepare")) return route.fallback();
    if (request.method() === "GET") {
      const id = url.pathname.split("/").at(-1);
      if (state.createHidden.has(id)) return route.abort("failed");
      return route.fulfill({ headers, json: { ok: true, ...(state.receipts.get(id) || { operation: { id, state: "unknown" } }) } });
    }
    const input = request.postDataJSON(), intent = adminTemplateIntent({ ...input, actorId: input.expectedActorId }), { id, ...binding } = intent;
    state.posts.push(input);
    if (!state.receipts.has(id)) {
      if (input.kind === "template.create") {
        expect(created.has(input.listId)).toBe(false); expect(input.body.base).toBeNull();
        created.set(input.listId, { revision: 0, payload: structuredClone(input.body.payload), metadata: input.body.metadata });
      }
      const row = created.get(input.listId); expect(row).toBeTruthy();
      if (input.kind !== "template.create") expect(input.body.base).toEqual({ stateRevision: row.revision });
      if (input.kind === "template.metadata") row.metadata = structuredClone(input.body.metadata);
      row.revision++;
      const { body, ...identity } = binding;
      state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "committed" },
        result: { status: 200, payload: { ok: true, listId: input.listId, itemKey: input.itemKey, stateRevision: row.revision, visibility: "private", indexes: [] } } });
    }
    if (state.createLose) { state.createHidden.add(id); return route.abort("failed"); }
    return route.fulfill({ headers, json: { ok: true, ...state.receipts.get(id) } });
  });
  return state;
}

async function submitNewAdminDraft(page, kind, name) {
  await page.getByRole("button", { name: "Создать новую укладку", exact: true }).click();
  await page.locator("#layoutCreateMode").selectOption(kind + "-template");
  await page.locator("#layoutName").fill(name); await page.locator("#layoutName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveLayoutBtn").tap();
  else await page.locator("#saveLayoutBtn").click();
}

for (const kind of ["demo", "shared"]) for (const lost of [false, true]) test(`new admin ${kind} draft creates privately with stable identity${lost ? " after lost ACK and reload" : ""}`, async ({ page, context }) => {
  const state = await newDraftFixture(page, context); state.createLose = lost;
  await submitNewAdminDraft(page, kind, "Новый причинный шаблон");
  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  await expect.poll(() => state.posts.length).toBe(1);
  const original = structuredClone(state.posts[0]); expect(original.kind).toBe("template.create");
  expect(Object.values(original.body.payload.items)).toHaveLength(0);
  expect(Object.values(original.body.payload.containers)).toHaveLength(0);
  if (lost) {
    await expect.poll(() => state.createHidden.size).toBe(1); state.createLose = false; state.createHidden.clear();
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(({ kind, listId }) => __adminUiTest.openPrepared(kind === "demo" ? { type: "demo", demoListId: listId }
      : { type: "shared", sharedId: listId.slice("public-shared-layout-".length) }), { kind, listId: original.listId });
  }
  await confirmedRevision(page, 1); expect(state.posts).toEqual([original]); expect(state.created.size).toBe(1);
  await renameTemplate(page, "Название после создания"); await confirmedRevision(page, 2);
  expect(state.posts).toHaveLength(2); expect(state.posts[1].kind).toBe("template.metadata");
  expect(state.posts[1].listId).toBe(original.listId); expect(state.posts[1].body.base).toEqual({ stateRevision: 1 });
  expect(state.errors).toEqual([]);
});

test("new admin draft mirror quota leaves the creation form and sends nothing", async ({ page, context }) => {
  const state = await newDraftFixture(page, context);
  const before = await page.evaluate(() => structuredClone(__adminUiTest.state().layouts));
  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith("bike-packing-prototype-state-v1") && value.includes("Новый причинный шаблон")) throw new DOMException("Quota", "QuotaExceededError");
    return set.call(this, key, value);
  }; });
  await submitNewAdminDraft(page, "demo", "Новый причинный шаблон");
  await expect(page.locator("#layoutDialog")).toBeVisible(); await expect(page.locator("#layoutName")).toHaveValue("Новый причинный шаблон");
  await expect(page.getByText("Не удалось создать черновик:", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => structuredClone(__adminUiTest.state().layouts))).toEqual(before);
  expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
});

for (const kind of ["demo", "shared"]) test(`new admin ${kind} draft keeps its target when plan capture fails before reload`, async ({ page, context }) => {
  const state = await newDraftFixture(page, context);
  await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith("bike-packing-admin-save-plans-v1:")) throw new DOMException("Quota", "QuotaExceededError");
    return set.call(this, key, value);
  }; });
  await submitNewAdminDraft(page, kind, "Новый причинный шаблон");
  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  await expect(page.locator("body")).toContainText("Сохранение шаблона приостановлено");
  const source = await page.evaluate(() => Object.values(__adminUiTest.state().layouts).find(layout => layout.name === "Новый причинный шаблон").adminCausalSource);
  expect(source.exists).toBe(false); expect(source.planId).toBeNull(); expect(state.posts).toEqual([]);
  await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
  await page.evaluate(({ kind, listId }) => __adminUiTest.openPrepared(kind === "demo" ? { type: "demo", demoListId: listId }
    : { type: "shared", sharedId: listId.slice("public-shared-layout-".length) }), { kind, listId: source.binding.listId });
  await confirmedRevision(page, 1); expect(state.posts).toHaveLength(1);
  expect(state.posts[0].listId).toBe(source.binding.listId); expect(state.posts[0].kind).toBe("template.create");
  expect(state.errors).toEqual([]);
});

async function legacyDraftFixture(page, context, shared) {
  const state = await fixture(page, context, { shared });
  state.localId = await page.evaluate(() => {
    const current = __adminUiTest.state(), layout = Object.values(current.layouts).find(row => row.adminCausalSource);
    delete layout.adminCausalSource; layout.name = "Старый местный вариант";
    Object.values(current.items).find(row => row.publicCatalogLayoutId).name = "Местный насос";
    for (const key of Object.keys(localStorage).filter(key => key.startsWith("bike-packing-prototype-state-v1"))) {
      const saved = JSON.parse(localStorage.getItem(key));
      if (saved.layouts?.[layout.id]) localStorage.setItem(key, JSON.stringify(current));
    }
    return layout.id;
  });
  return state;
}
async function beginLegacyComparison(page, shared) {
  await page.evaluate(shared => { window.__legacyOpenDone = false;
    void __adminUiTest.openPrepared(shared ? { type: "shared", sharedId: "ui" } : { type: "demo", demoListId: "public-demo-state-ui", language: "ru" })
      .then(() => { window.__legacyOpenDone = true; });
  }, shared);
}
for (const shared of [false, true]) for (const outcome of ["confirm", "lost", "cancel", "choice-quota", "plan-quota", "conflict"]) {
  test(`legacy ${shared ? "shared" : "demo"} comparison retains the explicit choice (${outcome})`, async ({ page, context }) => {
    const state = await legacyDraftFixture(page, context, shared);
    await beginLegacyComparison(page, shared); await expect(page.locator("#confirmDialog")).toBeVisible();
    await expect(page.locator("#confirmDialog")).toContainText("Старый местный вариант");
    await expect(page.locator("#confirmDialog")).toContainText("Проверяемый шаблон");
    expect(state.posts).toEqual([]);
    if (outcome.endsWith("quota")) await page.evaluate(kind => {
      const prefix = kind === "choice-quota" ? "bike-packing-admin-legacy-choice-v1:" : "bike-packing-admin-save-plans-v1:";
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (key.startsWith(prefix)) throw new DOMException("Quota", "QuotaExceededError"); return set.call(this, key, value);
      };
    }, outcome);
    if (outcome === "lost") state.lose = true;
    if (outcome === "conflict") state.revision++;
    await page.locator(outcome === "cancel" ? "#confirmCancelBtn" : "#confirmOkBtn").click();
    await page.waitForFunction(() => __legacyOpenDone);
    const local = await page.evaluate(id => __adminUiTest.state().layouts[id], state.localId);
    expect(local.name).toBe("Старый местный вариант");
    if (outcome === "cancel" || outcome === "choice-quota") {
      expect(local.adminCausalSource).toBeUndefined(); expect(state.posts).toEqual([]);
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("bike-packing-admin-legacy-choice-v1:")))).toBe(false);
      return;
    }
    const choice = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith("bike-packing-admin-legacy-choice-v1:")))).choice);
    expect(choice.server.stateRevision).toBe(7); expect(choice.server.payload.items.pump.name).toBe("Насос шаблона");
    expect(Object.values(choice.local.payload.items).some(row => row.name === "Местный насос")).toBe(true);
    if (outcome === "plan-quota") expect(state.posts).toEqual([]);
    if (outcome !== "confirm") {
      state.lose = false; state.hidden = false;
      await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
      await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
      await beginLegacyComparison(page, shared); await page.waitForFunction(() => __legacyOpenDone);
      await expect(page.locator("#confirmDialog")).not.toBeVisible();
    }
    expect(state.posts).toHaveLength(1); expect(state.posts[0].operationId).toBe(choice.id);
    expect(state.posts[0].kind).toBe("template.save"); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    if (outcome === "conflict") {
      expect(state.receipts.get(choice.id).operation.state).toBe("rejected");
      expect(state.payload.items.pump.name).toBe("Насос шаблона");
    } else {
      await confirmedRevision(page, 8); expect(state.visibility).toBe("private");
      expect(Object.values(state.payload.items).some(row => row.name === "Местный насос")).toBe(true);
    }
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) test(`legacy ${shared ? "shared" : "demo"} draft selected in the real list requires comparison`, async ({ page, context }) => {
  const state = await legacyDraftFixture(page, context, shared);
  await page.evaluate(id => {
    __adminUiTest.state().layouts[id].adminTemplateCopy = true;
    __adminUiTest.setOrderCatalog({ demo: [], shared: [] });
  }, state.localId);
  await page.locator("#layoutSelect").selectOption("template-draft:" + state.localId);
  await expect(page.locator("#confirmDialog")).toBeVisible(); await expect(page.locator("#confirmDialog")).toContainText("Сверить старый черновик");
  expect(state.posts).toEqual([]);
  await page.locator("#confirmOkBtn").click(); await confirmedRevision(page, 8);
  expect(state.posts).toHaveLength(1); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
  expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) test(`legacy ${shared ? "shared" : "demo"} duplicate drafts cannot choose a local variant implicitly`, async ({ page, context }) => {
  const state = await legacyDraftFixture(page, context, shared);
  const before = await page.evaluate(id => {
    const local = __adminUiTest.state().layouts;
    local["duplicate-draft"] = { ...structuredClone(local[id]), id: "duplicate-draft", name: "Другой местный вариант" };
    return structuredClone(local);
  }, state.localId);
  await beginLegacyComparison(page, shared); await page.waitForFunction(() => __legacyOpenDone);
  await expect(page.locator("#confirmDialog")).not.toBeVisible();
  await expect(page.locator("body")).toContainText("Найдено несколько местных черновиков");
  expect(await page.evaluate(() => __adminUiTest.state().layouts)).toEqual(before);
  expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) for (const mode of ["queued", "accepted", "lost-stop", "quota"]) {
  test(`real admin ${shared ? "shared" : "demo"} recovery dialog stops its retained chain (${mode})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared });
    if (mode === "accepted") state.lose = true; else state.blockBusiness = true;
    await editItem(page, "Местная правка перед остановкой");
    await expect.poll(() => state.posts.length).toBeGreaterThan(0);
    await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
    await expect(dialog).toBeVisible(); await expect(dialog.locator("[data-admin-stop]")).toBeEnabled();
    const before = state.posts.length;
    state.lose = false; state.hidden = false;
    if (mode === "lost-stop") state.cancelLose = true;
    if (mode === "quota") await page.evaluate(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("bike-packing-admin-stop-v1:")) throw new DOMException("Stop quota", "QuotaExceededError"); return set.call(this, key, value);
    }; });
    await dialog.locator("[data-admin-stop]").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
    await page.locator("#confirmOkBtn").click(); await expect(dialog.locator("[data-admin-recovery-close]")).toBeEnabled();
    if (mode === "quota") {
      await expect(dialog).toContainText("Stop quota"); expect(state.cancels).toEqual([]);
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("bike-packing-admin-stop-v1:")))).toBe(false);
    } else {
      if (mode === "lost-stop") {
        expect(state.cancels).toHaveLength(1); state.cancelLose = false; state.hidden = false;
        await page.reload(); await openEditorForTarget(page, shared);
        await page.locator("#syncBtn").click(); await expect(dialog).toBeVisible();
      }
      await expect(dialog).toContainText("Отправка остановлена");
      expect(state.cancels).toHaveLength(mode === "accepted" ? 0 : 1);
      await dialog.locator("[data-admin-recovery-close]").click();
      await page.reload(); await openEditorForTarget(page, shared);
      await page.locator("#syncBtn").click(); await expect(dialog).toContainText("Отправка остановлена");
      await expect(dialog.locator("[data-admin-resume]")).toBeDisabled();
    }
    expect(state.posts).toHaveLength(before); expect(state.visibility).toBe("private");
    expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).some(row => row.name === "Местная правка перед остановкой"))).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) test(`admin ${shared ? "shared" : "demo"} recovery checks and resumes a lost receipt without a new write`, async ({ page, context }) => {
  const state = await fixture(page, context, { shared }); state.lose = true;
  await editItem(page, "Правка для проверки результата"); await expect.poll(() => state.hidden).toBe(true);
  await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
  await expect(dialog.locator("[data-admin-check-result]")).toBeEnabled();
  state.lose = false; state.hidden = false;
  await dialog.locator("[data-admin-check-result]").click(); await expect(dialog).toContainText("Сервер подтвердил все записанные действия");
  expect(state.posts).toHaveLength(1); expect(state.cancels).toEqual([]);
  await dialog.locator("[data-admin-resume]").click(); await confirmedRevision(page, 8);
  await expect(dialog).toContainText("Нет действий, ожидающих отправки");
  expect(state.posts).toHaveLength(1); expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) test(`admin ${shared ? "shared" : "demo"} recovery stops publication after the data save was accepted`, async ({ page, context }) => {
  const state = await fixture(page, context, { shared }); state.lose = true;
  await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
  await page.locator("#publishEditedTemplateBtn").click(); await expect.poll(() => state.hidden).toBe(true);
  await expect(page.locator("#publishEditedTemplateBtn")).toBeEnabled();
  await page.locator("#layoutEditDialog").getByRole("button", { name: "Закрыть", exact: true }).click();
  await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
  await expect(dialog.locator("[data-admin-stop]")).toBeEnabled(); state.lose = false; state.hidden = false;
  await dialog.locator("[data-admin-stop]").click(); await page.locator("#confirmOkBtn").click();
  await expect(dialog).toContainText("Отправка остановлена");
  expect(state.posts).toHaveLength(1); expect(state.posts[0].kind).toBe("template.save");
  expect(state.cancels).toHaveLength(1); expect(state.cancels[0].kind).toBe("template.publication");
  expect(state.cancels[0].body.base).toEqual({ operationId: state.posts[0].operationId });
  expect(state.visibility).toBe("private"); expect(state.revision).toBe(8);
  await dialog.locator("[data-admin-recovery-close]").click(); await page.reload(); await openEditorForTarget(page, shared);
  expect(state.posts).toHaveLength(1); expect(state.cancels).toHaveLength(1); expect(state.visibility).toBe("private");
  expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) for (const mode of ["save", "decline", "choice-quota", "plan-quota", "mirror-quota", "lost-ack", "conflict"]) {
  test(`post-stop ${shared ? "shared" : "demo"} comparison uses the explicit retained choice (${mode})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared }); state.blockBusiness = true;
    await editItem(page, "Местный вариант после остановки"); await expect.poll(() => state.posts.length).toBeGreaterThan(0);
    await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
    await expect(dialog.locator("[data-admin-stop]")).toBeEnabled();
    await dialog.locator("[data-admin-stop]").click(); await page.locator("#confirmOkBtn").click();
    await expect(dialog).toContainText("Отправка остановлена"); const attempts = state.posts.length;
    state.blockBusiness = false; state.revision = 12; state.visibility = "public";
    if (["choice-quota", "plan-quota", "mirror-quota"].includes(mode)) await page.evaluate(mode => {
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        const prefix = mode === "choice-quota" ? "bike-packing-admin-stop-choice-v1:" : mode === "plan-quota"
          ? "bike-packing-admin-save-plans-v1:" : "bike-packing-prototype-state-v1";
        if (key.startsWith(prefix)) throw new DOMException("Comparison quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    await dialog.locator("[data-admin-compare]").click(); await expect(page.locator("#confirmDialog")).toBeVisible();
    await expect(page.locator("#confirmDialog")).toContainText("Местный вариант после остановки");
    await expect(page.locator("#confirmDialog")).toContainText("Насос шаблона");
    await expect(page.locator("#confirmDialog")).toContainText("будут видны другим пользователям");
    expect(state.posts).toHaveLength(attempts);
    if (mode === "conflict") state.revision = 13;
    if (mode === "lost-ack") state.lose = true;
    await page.locator(mode === "decline" ? "#confirmCancelBtn" : "#confirmOkBtn").click();
    await expect(dialog.locator("[data-admin-recovery-close]")).toBeEnabled();
    const saved = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(key => key.startsWith("bike-packing-admin-stop-choice-v1:"));
      return key ? JSON.parse(localStorage.getItem(key)).choice : null;
    });
    if (["decline", "choice-quota"].includes(mode)) {
      expect(saved).toBeNull(); expect(state.posts).toHaveLength(attempts);
      if (mode === "decline") await expect(dialog).toContainText("Отправка остановлена");
      else await expect(dialog).toContainText("Comparison quota");
    } else {
      expect(saved.server.stateRevision).toBe(12); expect(saved.id).not.toBe(saved.priorPlanId);
      expect(Object.values(saved.local.payload.items).some(item => item.name === "Местный вариант после остановки")).toBe(true);
      expect(Object.values(saved.server.payload.items).some(item => item.name === "Насос шаблона")).toBe(true);
      if (["plan-quota", "mirror-quota"].includes(mode)) {
        expect(state.posts).toHaveLength(attempts);
        await page.reload(); await openEditorForTarget(page, shared);
      } else if (mode === "lost-ack") {
        expect(state.posts).toHaveLength(attempts + 1); state.lose = false; state.hidden = false;
        await page.reload(); await openEditorForTarget(page, shared);
      }
      if (mode !== "conflict") await confirmedRevision(page, 13);
      else {
        await expect(dialog).toContainText("отклонена сервером");
        await dialog.locator("[data-admin-recovery-close]").click(); await page.reload(); await openEditorForTarget(page, shared);
        expect(await page.evaluate(() => Object.values(__adminUiTest.state().layouts).find(layout => layout.adminCausalSource)?.adminCausalSource.planId)).toBe(saved.id);
      }
      expect(state.posts).toHaveLength(attempts + 1); const sent = state.posts.at(-1);
      expect(sent.operationId).toBe(saved.id); expect(sent.kind).toBe("template.save"); expect(sent.body.base).toEqual({ stateRevision: 12 });
      expect(state.visibility).toBe("public"); expect(state.cancels).toHaveLength(1);
    }
    expect(state.errors).toEqual([]);
  });
}

test("admin recovery cancellation prompt can be declined without changing the pending action", async ({ page, context }) => {
  const state = await fixture(page, context); state.blockBusiness = true;
  await editItem(page, "Оставить действие ожидающим"); await expect.poll(() => state.posts.length).toBeGreaterThan(0);
  await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
  await expect(dialog.locator("[data-admin-stop]")).toBeEnabled();
  await dialog.locator("[data-admin-stop]").click(); await page.locator("#confirmCancelBtn").click();
  await expect(dialog.locator("[data-admin-stop]")).toBeEnabled(); expect(state.cancels).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("bike-packing-admin-stop-v1:")))).toBe(false);
  expect(state.errors).toEqual([]);
});

async function orderFixture(page, context, shared) {
  const state = await fixture(page, context, { published: true, shared, layoutOrder: 1 });
  const rows = ["ui", "second"].map((id, index) => {
    const payload = template(); payload.layouts["layout-a"].layoutOrder = index + 1;
    return { id, listId: shared ? "public-shared-layout-" + id : "public-demo-state-" + id,
      itemKey: (shared ? "shared-layout:" : "demo-state:") + id, revision: 7, payload,
      metadata: { title: index ? "Второй шаблон" : "Проверяемый шаблон", description: "", language: "ru" } };
  });
  state.orderRows = rows; state.orderFail = false; state.orderHidden = new Set();
  await context.route("**/bike-packing/admin/template-operations**", async route => {
    const request = route.request(), url = new URL(request.url()), headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let data;
    if (url.pathname.endsWith("/prepare")) {
      const row = rows.find(row => row.itemKey === request.postDataJSON().itemKey); expect(row).toBeTruthy();
      data = { ok: true, actorId: "admin-a", environment: "bike-packing-experiment", listId: row.listId, itemKey: row.itemKey,
        sourceType: "public-template", exists: true, deleted: false, stateRevision: row.revision, visibility: "public", indexes: [], metadata: row.metadata, payload: row.payload };
    } else if (request.method() === "POST") {
      const input = request.postDataJSON(), row = rows.find(row => row.listId === input.listId);
      const intent = adminTemplateIntent({ ...input, actorId: input.expectedActorId }), { id, ...binding } = intent;
      state.posts.push(input);
      if (!state.receipts.has(id)) {
        const revision = input.body.base.stateRevision ?? state.receipts.get(input.body.base.operationId)?.result.payload.stateRevision;
        if (revision !== row.revision) {
          const { body, ...identity } = binding;
          const receipt = { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "rejected" },
            result: { status: 409, payload: { ok: false, code: "template_revision_conflict" } } };
          state.receipts.set(id, receipt); return route.fulfill({ headers, json: { ok: true, ...receipt } });
        }
        row.revision++;
        if (input.kind === "template.metadata") row.payload.layouts["layout-a"].layoutOrder = input.body.metadata.layoutOrder;
        else if (input.kind === "template.save") row.payload = structuredClone(input.body.payload);
        else if (input.kind === "template.publication") expect(input.body.published).toBe(true);
        else throw Error("Unexpected order fixture operation: " + input.kind);
        const { body, ...identity } = binding;
        state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "committed" },
          result: { status: 200, payload: { ok: true, listId: row.listId, itemKey: row.itemKey, stateRevision: row.revision, visibility: "public", indexes: [] } } });
      }
      if (state.orderFail && row.id === "second") { state.orderHidden.add(id); return route.abort("failed"); }
      data = { ok: true, ...state.receipts.get(id) };
    } else {
      const id = url.pathname.split("/").at(-1);
      if (state.orderHidden.has(id)) return route.abort("failed");
      data = { ok: true, ...(state.receipts.get(id) || { operation: { id, state: "unknown" } }) };
    }
    return route.fulfill({ headers, json: data });
  });
  state.seedOrder = async () => {
    await page.evaluate(({ rows, shared }) => {
      const entries = rows.map(row => ({ id: shared ? row.id : row.listId, listId: row.listId, name: row.metadata.title,
        title: row.metadata.title, language: "ru", layoutOrder: row.payload.layouts["layout-a"].layoutOrder }));
      // Catalog fixture only; order changes themselves use the actual dialog.
      __adminUiTest.setOrderCatalog({ demo: shared ? [] : entries, shared: shared ? entries : [] });
    }, { rows, shared });
  };
  await state.seedOrder(); return state;
}

for (const shared of [false, true]) for (const outcome of ["confirmed", "retry", "reload"]) {
  test(`real admin ${shared ? "shared" : "demo"} order dialog retains its complete batch (${outcome})`, async ({ page, context }) => {
    const state = await orderFixture(page, context, shared); state.orderFail = outcome !== "confirmed";
    await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
    await page.locator("#layoutOrderToggleBtn").click(); await expect(page.locator("#layoutOrderDialog")).toBeVisible();
    const section = page.locator(`#layoutOrderList section[data-layout-order-section="${shared ? "shared" : "demo"}"]`);
    await expect(section.locator(".layout-order-row")).toHaveCount(2);
    await section.locator('[data-layout-order-action="down"]').first().click();
    await page.locator("#saveLayoutOrderBtn").click(); await expect.poll(() => state.posts.length).toBe(2);
    const originals = structuredClone(state.posts);
    expect(originals.every(row => row.kind === "template.metadata")).toBe(true);
    expect(originals.map(row => row.body.base)).toEqual([{ stateRevision: 7 }, { stateRevision: 7 }]);
    if (outcome !== "confirmed") {
      await expect(page.locator("#saveLayoutOrderBtn")).toBeEnabled();
      expect(await page.locator("#layoutOrderList").getAttribute("inert")).not.toBeNull();
      state.orderFail = false; state.orderHidden.clear();
      if (outcome === "reload") {
        await page.reload(); await openEditorForTarget(page, shared); await state.seedOrder();
        await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
        await page.locator("#layoutOrderToggleBtn").click(); await expect(page.locator("#layoutOrderDialog")).toBeVisible();
      }
      await page.locator("#saveLayoutOrderBtn").click();
    }
    await expect(page.locator("#layoutOrderDialog")).not.toBeVisible();
    expect(state.posts).toEqual(originals); expect(state.orderRows.map(row => row.payload.layouts["layout-a"].layoutOrder)).toEqual([2, 1]);
    await page.locator('#layoutEditDialog button[value="cancel"]').click();
    await editItem(page, "Правка после изменения порядка"); await confirmedRevision(page, 10);
    expect(state.posts).toHaveLength(4);
    expect(state.posts[2].body.base).toEqual({ stateRevision: 8 }); expect(state.posts[2].kind).toBe("template.save");
    expect(state.posts[3].body.base).toEqual({ operationId: state.posts[2].operationId });
    expect(state.posts[2].body.payload.layouts[state.posts[2].body.payload.activeLayoutId].layoutOrder).toBe(2);
    expect(state.errors).toEqual([]);
  });
}

for (const fault of ["quota", "conflict"]) test(`admin order ${fault} preserves the chosen batch and pauses safely`, async ({ page, context }) => {
  const state = await orderFixture(page, context, false);
  await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
  await page.locator("#layoutOrderToggleBtn").click(); await expect(page.locator("#layoutOrderDialog")).toBeVisible();
  const section = page.locator('#layoutOrderList section[data-layout-order-section="demo"]');
  await section.locator('[data-layout-order-action="down"]').first().click();
  const chosen = await section.locator(".layout-order-title strong").allTextContents();
  if (fault === "quota") await page.evaluate(() => {
    const original = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("bike-packing-admin-order-v1:")) throw new DOMException("Quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  else state.orderRows[0].revision++;
  await page.locator("#saveLayoutOrderBtn").click();
  await expect(page.getByText("Не удалось сохранить порядок укладок:", { exact: false })).toBeVisible();
  await expect(page.locator("#layoutOrderDialog")).toBeVisible();
  expect(await section.locator(".layout-order-title strong").allTextContents()).toEqual(chosen);
  expect(state.orderRows.map(row => row.payload.layouts["layout-a"].layoutOrder)).toEqual([1, 2]);
  const posts = structuredClone(state.posts); expect(posts).toHaveLength(fault === "quota" ? 0 : 1);
  await page.locator("#saveLayoutOrderBtn").click(); await expect(page.locator("#saveLayoutOrderBtn")).toBeEnabled();
  expect(state.posts).toEqual(posts); expect(state.errors).toEqual([]);
});
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

async function renameTemplate(page, name) {
  await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await page.locator("#layoutEditName").fill(name); await page.locator("#layoutEditName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveEditedLayoutBtn").tap();
  else await page.locator("#saveEditedLayoutBtn").click();
}

for (const shared of [false, true]) for (const outcome of ["confirmed", "retry", "reload"]) {
  test(`real admin ${shared ? "shared" : "demo"} unpublish button keeps one immutable command (${outcome})`, async ({ page, context }) => {
    const state = await fixture(page, context, { published: true, shared });
    state.lose = outcome !== "confirmed";
    const before = structuredClone(state.payload);
    await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
    await page.locator("#publishEditedTemplateBtn").click();
    await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    await expect.poll(() => state.posts.length).toBe(1);
    const original = structuredClone(state.posts[0]);
    expect(original.kind).toBe("template.publication");
    expect(original.body).toEqual({ version: 1, base: { stateRevision: 7 }, published: false, indexes: [] });
    if (outcome !== "confirmed") {
      await expect.poll(() => state.hidden).toBe(true);
      // Keep receipt reads unavailable until the original handler reports its
      // lost result. Otherwise its own GET can succeed and finish the dialog.
      await expect(page.getByText("Шаблон сохранён локально как черновик, но сервер не подтвердил снятие с публикации.", { exact: false })).toBeVisible();
      await expect(page.locator("#publishEditedTemplateBtn")).toBeEnabled();
      state.lose = false; state.hidden = false;
      if (outcome === "reload") {
        await page.reload(); await openEditorForTarget(page, shared); await confirmedRevision(page, 8);
        await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
      }
      await expect(page.locator("#publishEditedTemplateBtn")).toBeEnabled();
      await page.locator("#publishEditedTemplateBtn").click();
    }
    await expect(page.locator("#layoutEditDialog")).not.toBeVisible(); await confirmedRevision(page, 8);
    expect(state.posts).toEqual([original]); expect(state.visibility).toBe("private"); expect(state.payload).toEqual(before);
    expect(await page.evaluate(() => Object.values(__adminUiTest.state().layouts).some(row => row.templateUnpublishPending))).toBe(false);
    expect(state.errors).toEqual([]);
  });
}

async function openEditorForTarget(page, shared) {
  if (!shared) return openEditor(page);
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.waitForFunction(() => window.__adminUiTest?.user()?.id === "admin-a");
  await page.evaluate(() => __adminUiTest.openPrepared({ type: "shared", sharedId: "ui", language: "ru" }));
}

test("a corrupted retained receipt cannot finish unpublish from local flags alone", async ({ page, context }) => {
  const state = await fixture(page, context, { published: true }); state.lose = true;
  await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
  await page.locator("#publishEditedTemplateBtn").click(); await page.locator("#confirmOkBtn").click();
  await expect.poll(() => state.hidden).toBe(true); const original = structuredClone(state.posts[0]);
  await expect(page.getByText("Шаблон сохранён локально как черновик, но сервер не подтвердил снятие с публикации.", { exact: false })).toBeVisible();
  await expect(page.locator("#publishEditedTemplateBtn")).toBeEnabled();
  state.lose = false; state.hidden = false;
  await page.reload(); await openEditor(page); await confirmedRevision(page, 8);
  await page.evaluate(() => {
    const source = Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource).adminCausalSource;
    const [key, value] = Object.entries(localStorage).find(([key, value]) => key.startsWith("bike-packing-admin-template-v1:")
      && JSON.parse(value).intent.id === source.lastConfirmedOperation.id);
    const row = JSON.parse(value); row.receipt.operation.payloadDigest = "0".repeat(64); localStorage.setItem(key, JSON.stringify(row));
  });
  await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
  await page.locator("#publishEditedTemplateBtn").click();
  await expect(page.getByText("Шаблон сохранён локально как черновик, но сервер не подтвердил снятие с публикации.", { exact: false })).toBeVisible();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  expect(state.posts).toEqual([original]);
  expect(await page.evaluate(() => Object.values(__adminUiTest.state().layouts).some(row => row.templateUnpublishPending))).toBe(true);
  expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) for (const outcome of ["confirmed", "retry", "reload"]) {
  test(`real admin ${shared ? "shared" : "demo"} publish button keeps its save-before-publication plan (${outcome})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared }); state.lose = outcome !== "confirmed";
    await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
    await page.locator("#publishEditedTemplateBtn").click();
    await expect.poll(() => state.posts.length).toBeGreaterThan(0);
    const first = structuredClone(state.posts[0]); expect(first.kind).toBe("template.save");
    if (outcome !== "confirmed") {
      await expect.poll(() => state.hidden).toBe(true); expect(state.visibility).toBe("private");
      state.lose = false; state.hidden = false;
      if (outcome === "reload") { await page.reload(); await openEditorForTarget(page, shared); }
      else { await expect(page.locator("#publishEditedTemplateBtn")).toBeEnabled(); await page.locator("#publishEditedTemplateBtn").click(); }
    }
    await confirmedRevision(page, 9); await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
    expect(state.posts).toHaveLength(2); expect(state.posts[0]).toEqual(first);
    expect(state.posts[1].kind).toBe("template.publication"); expect(state.posts[1].body.published).toBe(true);
    expect(state.posts[1].body.base).toEqual({ operationId: first.operationId }); expect(state.visibility).toBe("public");
    expect(Object.values(state.payload.items).some(item => item.name === "Насос шаблона")).toBe(true);
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const lost of [false, true]) {
  test(`real admin ${shared ? "shared" : "demo"} draft removal archives once${lost ? " across reload" : ""}`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared }); state.lose = lost;
    const layoutId = await page.evaluate(() => Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource)?.id);
    const originalPayload = structuredClone(state.payload);
    const remove = async () => {
      await page.getByRole("button", { name: "Редактировать текущую укладку", exact: true }).click();
      await page.locator("#deleteEditedLayoutBtn").click();
      await expect(page.locator("#confirmDialog")).toBeVisible(); await page.locator("#confirmOkBtn").click();
    };
    await remove(); await expect.poll(() => state.posts.length).toBe(1);
    const original = structuredClone(state.posts[0]); expect(original.kind).toBe("template.archive");
    expect(original.body).toEqual({ version: 1, base: { stateRevision: 7 }, indexes: [] });
    if (lost) {
      await expect.poll(() => state.hidden).toBe(true); state.lose = false; state.hidden = false;
      await page.reload(); await openEditorForTarget(page, shared); await confirmedRevision(page, 8);
      await remove();
    }
    await expect.poll(() => page.evaluate(id => Boolean(__adminUiTest.state().layouts[id]), layoutId)).toBe(false);
    expect(state.posts).toEqual([original]); expect(state.archived).toBe(true); expect(state.payload).toEqual(originalPayload);
    expect(state.errors).toEqual([]);
  });
}

async function editContainer(page, oldName, newName) {
  const id = await page.evaluate(name => Object.values(__adminUiTest.state().containers).find(row => row.name === name)?.id, oldName);
  expect(id).toBeTruthy(); await page.evaluate(id => __adminUiTest.openContainer(id), id);
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await page.locator("#rootContainerName").fill(newName); await page.locator("#rootContainerName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveRootContainerBtn").tap();
  else await page.locator("#saveRootContainerBtn").click();
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible();
}

for (const place of [false, true]) test(`admin new container retains its ID and ${place ? "placement" : "catalog entry"} across lost acknowledgement`, async ({ page, context }) => {
  const state = await fixture(page, context, { withContainers: true }); state.lose = true;
  if (place) {
    await page.locator('[data-view="packing"]').click();
    await page.locator("[data-add-packing-root]").click(); await page.locator("#createRootForLayoutBtn").click();
  } else {
    await page.locator('[data-view="bags"]').click(); await page.locator("#addRootContainerBtn").click();
  }
  await page.locator("#rootContainerName").fill("Новая административная сумка"); await page.locator("#rootContainerName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveRootContainerBtn").tap();
  else await page.locator("#saveRootContainerBtn").click();
  await expect(page.locator("#rootContainerDialog")).not.toBeVisible(); await expect.poll(() => state.hidden).toBe(true);
  const original = structuredClone(state.posts[0]);
  const added = Object.values(state.payload.containers).find(row => row.name === "Новая административная сумка");
  expect(added?.id).toBeTruthy(); expect(Object.keys(state.payload.containers)).toHaveLength(3);
  const roots = Object.values(state.payload.layouts)[0].arrangement.rootContainerIds;
  expect(roots.includes(added.id)).toBe(place);
  state.lose = false; state.hidden = false;
  await page.reload(); await openEditor(page); await confirmedRevision(page, 8);
  expect(state.posts).toEqual([original]);
  expect(await page.evaluate(id => __adminUiTest.state().containers[id]?.name, added.id)).toBe("Новая административная сумка");
  expect(state.errors).toEqual([]);
});

test("admin add-subcontainer form saves its exact parent and preserves existing contents", async ({ page, context }) => {
  const state = await fixture(page, context, { withContainers: true });
  await page.locator('[data-view="packing"]').click();
  const bag = page.locator("#packingView [data-root-container-id]").filter({ hasText: "Сумка шаблона" });
  await bag.locator("[data-add-to-container]").first().click();
  await page.locator("#newSubcontainerName").fill("Новый карман администратора"); await page.locator("#newSubcontainerName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#createSubcontainerBtn").tap();
  else await page.locator("#createSubcontainerBtn").click();
  await expect(page.locator("#addToContainerDialog")).not.toBeVisible(); await confirmedRevision(page, 8);
  expect(state.posts).toHaveLength(1);
  const added = Object.values(state.payload.containers).find(row => row.name === "Новый карман администратора");
  const layout = Object.values(state.payload.layouts)[0], root = layout.arrangement.rootContainerIds[0];
  expect(layout.arrangement.containers[root].childIds).toContain(added.id);
  expect(layout.arrangement.containers[added.id].parentId).toBe(root);
  expect(Object.keys(state.payload.containers)).toHaveLength(3); expect(Object.keys(state.payload.items)).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) for (const owner of ["Сумка шаблона", "Карман шаблона"]) {
  test(`real admin ${shared ? "shared" : "demo"} container form preserves the complete tree and quantities (${owner})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared, withContainers: true });
    await editContainer(page, owner, "Изменённая сумка"); await confirmedRevision(page, 8);
    expect(state.posts).toHaveLength(1); expect(state.posts[0].kind).toBe("template.save");
    expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(Object.values(state.payload.containers).map(row => row.name)).toContain("Изменённая сумка");
    const layout = Object.values(state.payload.layouts)[0], bagId = layout.arrangement.rootContainerIds[0];
    const pocketId = layout.arrangement.containers[bagId].childIds[0], pumpId = layout.arrangement.containers[pocketId].itemIds[0];
    expect(Object.keys(state.payload.containers)).toHaveLength(2);
    expect(state.payload.items[pumpId].name).toBe("Насос шаблона");
    expect(layout.arrangement.itemQuantities[pumpId]).toBe(2);
    expect(layout.arrangement.containers[pocketId].parentId).toBe(bagId);
    expect(state.errors).toEqual([]);
  });
}

test("admin container lost acknowledgement survives reload before a subsequent nested edit", async ({ page, context }) => {
  const state = await fixture(page, context, { withContainers: true }); state.lose = true;
  await editContainer(page, "Сумка шаблона", "Сумка после обрыва");
  await expect.poll(() => state.hidden).toBe(true); const original = structuredClone(state.posts[0]);
  state.lose = false; state.hidden = false;
  await page.reload(); await openEditor(page); await confirmedRevision(page, 8);
  expect(state.posts).toEqual([original]);
  await editContainer(page, "Карман шаблона", "Следующая правка кармана"); await confirmedRevision(page, 9);
  expect(state.posts).toHaveLength(2); expect(state.posts[1].body.base).toEqual({ stateRevision: 8 });
  expect(Object.values(state.payload.containers).map(row => row.name).sort()).toEqual(["Следующая правка кармана", "Сумка после обрыва"]);
  expect(state.errors).toEqual([]);
});
for (const published of [false, true]) test(`the real ${published ? "public template" : "private draft"} label form sends only an immutable metadata command`, async ({ page, context }) => {
  const state = await fixture(page, context, { published }); const before = structuredClone(state.payload);
  await renameTemplate(page, "Новое название шаблона"); await confirmedRevision(page, 8);
  expect(state.posts).toHaveLength(1);
  expect(state.posts[0].kind).toBe("template.metadata");
  expect(state.posts[0].body).toEqual({ version: 1, base: { stateRevision: 7 }, metadata: { title: "Новое название шаблона", language: "ru" } });
  expect(state.visibility).toBe(published ? "public" : "private"); expect(state.payload).toEqual(before);
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible(); expect(state.errors).toEqual([]);
});

test("a lost metadata response keeps the named draft and recovers the original command after reload", async ({ page, context }) => {
  const state = await fixture(page, context); state.lose = true;
  await renameTemplate(page, "Название с потерянным ответом"); await expect.poll(() => state.hidden).toBe(true);
  const original = structuredClone(state.posts[0]);
  expect(await page.evaluate(() => Object.values(__adminUiTest.state().layouts).some(layout => layout.name === "Название с потерянным ответом"))).toBe(true);
  state.lose = false; state.hidden = false;
  await page.reload(); await openEditor(page); await confirmedRevision(page, 8);
  expect(state.posts).toEqual([original]); expect(state.errors).toEqual([]);
});

for (const shared of [false, true]) test(`hydrating a ${shared ? "shared" : "demo"} draft retains its source revision and background refresh preserves a pending edit`, async ({ page, context }) => {
  const state = await fixture(page, context, { hydrate: true, shared });
  expect(await page.evaluate(() => Object.values(__adminUiTest.state().layouts).filter(layout => layout.adminCausalSource).length)).toBe(1);
  await editItem(page, "Изменение загруженного черновика");
  await page.evaluate(() => __adminUiTest.refreshDrafts());
  await confirmedRevision(page, 8);
  expect(state.posts).toHaveLength(1); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
  expect(Object.values(state.payload.items).some(item => item.name === "Изменение загруженного черновика")).toBe(true);
  expect(state.errors).toEqual([]);
});
