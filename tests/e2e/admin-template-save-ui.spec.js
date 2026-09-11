import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { trackBrowserLifecycle } from "../fixtures/browser-lifecycle.js";
import { stripAdminTemplateEditorMetadata } from "../../src/public/admin-template-causal-save-flow.js";
import { adminTemplateIntent, canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { projectAdminTemplateCopy, adminTemplateCopyPayloadDigest } from "../../src/sync/admin-template-copy-projection.js";
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
test.beforeEach(async ({ page }) => { page.adminBrowserDiagnostics = trackBrowserLifecycle(page); });
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    const diagnostics = await page.evaluate(() => ({ helper: Boolean(window.__adminUiTest), user: window.__adminUiTest?.user()?.id,
      scope: window.__adminUiTest?.scope(), layouts: window.__adminUiTest?.state()?.layouts }))
      .catch(error => ({ unavailable: error.message }));
    await info.attach("admin-ui-state", { body: JSON.stringify(diagnostics), contentType: "application/json" });
    await info.attach("browser-lifecycle", { body: JSON.stringify(page.adminBrowserDiagnostics), contentType: "application/json" });
  }
});
async function fixture(page, context, { published = false, shared = false, hydrate = false, withContainers = false, layoutOrder = null, catalogPair = false, detachedTree = "", nestableTree = false, detachedItemLink = false } = {}) {
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
  if (catalogPair) {
    state.payload.items.second = { ...structuredClone(state.payload.items.pump), id: "second", name: "Вторая вещь шаблона", containerId: "", quantity: 3, weight: 234, notes: "Отдельная заметка источника" };
    state.payload.containers.secondBag = { id: "secondBag", name: "Вторая сумка шаблона", weight: 400, parentId: "", childIds: [], itemIds: [], order: [] };
  }
  if (detachedTree) {
    const full = detachedTree === "tree";
    state.payload.containers.spare = { id: "spare", name: "Запасная сумка", weight: 90, parentId: "", childIds: full ? ["spare-pocket"] : [], itemIds: [],
      order: full ? [{ type: "container", id: "spare-pocket" }] : [] };
    if (nestableTree) state.payload.containers.spare.nestable = true;
    if (full) {
      state.payload.containers["spare-pocket"] = { id: "spare-pocket", name: "Запасной карман", parentId: "spare", childIds: [], itemIds: ["spare-item"], order: [{ type: "item", id: "spare-item" }] };
      state.payload.items["spare-item"] = { id: "spare-item", name: "Запасная вещь", weight: 30, containerId: "spare-pocket", quantity: 3, categories: [] };
    }
  }
  if (detachedItemLink) {
    state.payload.items["spare-stays"] = { ...structuredClone(state.payload.items["spare-item"]), id: "spare-stays", name: "Остающаяся вещь", quantity: 4 };
    state.payload.containers["spare-pocket"].itemIds.push("spare-stays");
    state.payload.containers["spare-pocket"].order.push({ type: "item", id: "spare-stays" });
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
        capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "adminTemplateCausalOperationsV1", "adminTemplateCopyV1", "adminTemplateSourceSaveV1"] };
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
async function editItem(page, name, currentName = null, layoutId = null) {
  const itemId = await page.evaluate(({ currentName, layoutId }) => Object.values(__adminUiTest.state().items)
    .find(item => item.publicCatalogLayoutId && (!layoutId || item.publicCatalogLayoutId === layoutId) && (!currentName || item.name === currentName))?.id, { currentName, layoutId });
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

async function crossTemplateFixture(page, context, sourceShared, targetShared, detachedItem = false) {
  const server = await fixture(page, context, { shared: sourceShared, withContainers: true, hydrate: true, catalogPair: detachedItem });
  const target = { payload: structuredClone(server.payload), revision: 19, visibility: "private",
    listId: targetShared ? "public-shared-layout-cross" : "public-demo-state-cross",
    itemKey: targetShared ? "shared-layout:cross" : "demo-state:cross",
    metadata: { title: "Целевой шаблон", description: "", language: "ru" } };
  target.payload.layouts["layout-a"].name = target.metadata.title;
  target.payload.containers.bag.name = "Целевая сумка"; target.payload.containers.pocket.name = "Целевой карман";
  target.payload.items.pump.name = "Вещь цели"; server.target = target;
  await context.route("**/bike-packing/admin/template-operations**", async route => {
    const request = route.request(), headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (request.method() !== "POST") return route.fallback();
    const input = request.postDataJSON();
    if (new URL(request.url()).pathname.endsWith("/prepare")) {
      if (input.itemKey !== target.itemKey) return route.fallback();
      return route.fulfill({ headers, json: { ok: true, actorId: "admin-a", environment: "bike-packing-experiment", itemKey: target.itemKey, listId: target.listId,
        sourceType: targetShared ? "curated-bikepacker" : "public-template", exists: true, deleted: false, stateRevision: target.revision,
        visibility: target.visibility, metadata: target.metadata, payload: target.payload, indexes: [] } });
    }
    if (input.listId !== target.listId) return route.fallback();
    server.posts.push(input);
    const intent = adminTemplateIntent({ ...input, actorId: input.expectedActorId }), { id, ...binding } = intent, { body, ...identity } = binding;
    if (!server.receipts.has(id)) {
      const base = body.base.stateRevision ?? server.receipts.get(body.base.operationId)?.result.payload.stateRevision;
      const sourceChanged = body.source && (body.source.listId !== (sourceShared ? "public-shared-layout-ui" : "public-demo-state-ui")
        || body.source.base.stateRevision !== server.revision || body.source.payloadDigest !== await adminTemplateCopyPayloadDigest(server.payload));
      const code = base !== target.revision ? "template_source_changed" : sourceChanged ? "template_copy_source_changed" : null;
      if (!code) {
        target.revision++; if (intent.kind === "template.save") target.payload = structuredClone(body.payload);
        if (intent.kind === "template.metadata") Object.assign(target.metadata, body.metadata);
      }
      server.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: code ? "rejected" : "committed" },
        result: { status: code ? 409 : 200, payload: code ? { ok: false, code } : { ok: true, listId: target.listId, itemKey: target.itemKey,
          stateRevision: target.revision, visibility: target.visibility, indexes: [] } } });
    }
    if (server.lose) { server.hidden = true; return route.abort("failed"); }
    return route.fulfill({ headers, json: { ok: true, ...server.receipts.get(id) } });
  });
  await page.evaluate(target => __adminUiTest.openPrepared(target), targetShared ? { type: "shared", sharedId: "cross" }
    : { type: "demo", demoListId: target.listId, language: "ru" });
  await page.evaluate(target => __adminUiTest.openPrepared(target), sourceShared ? { type: "shared", sharedId: "ui" }
    : { type: "demo", demoListId: "public-demo-state-ui", language: "ru" });
  return server;
}

const crossTreeCases = [];
for (const sourceShared of [false, true]) for (const targetShared of [false, true]) for (const shape of ["tree", "shell"]) crossTreeCases.push({ sourceShared, targetShared, shape, mode: "confirmed" });
for (const sourceShared of [false, true]) crossTreeCases.push({ sourceShared, targetShared: !sourceShared, shape: "nested", mode: "confirmed" });
for (const mode of ["lost", "plan-quota", "pointer-quota", "mirror-quota", "source-conflict", "target-conflict", "changed-source", "changed-target", "changed-account", "pending-source", "pending-target", "cancel"]) {
  crossTreeCases.push({ sourceShared: false, targetShared: true, shape: "tree", mode });
}
for (const sourceShared of [false, true]) for (const targetShared of [false, true]) for (const shape of ["item-root", "item-nested"]) crossTreeCases.push({ sourceShared, targetShared, shape, mode: "confirmed" });
for (const sourceShared of [false, true]) crossTreeCases.push({ sourceShared, targetShared: !sourceShared, shape: "item-detached", mode: "confirmed" });
for (const mode of ["lost", "plan-quota", "pointer-quota", "mirror-quota", "source-conflict", "target-conflict", "changed-source", "changed-target", "changed-account", "pending-source", "pending-target", "cancel"]) {
  crossTreeCases.push({ sourceShared: false, targetShared: true, shape: "item-root", mode });
}
for (const { sourceShared, targetShared, shape, mode } of crossTreeCases) {
  test(`admin cross ${shape.startsWith("item-") ? "item" : "tree"} ${sourceShared ? "shared" : "demo"} to ${targetShared ? "shared" : "demo"} ${shape} (${mode})`, async ({ page, context }) => {
    const itemCopy = shape.startsWith("item-"), detached = shape === "item-detached";
    const server = await crossTemplateFixture(page, context, sourceShared, targetShared, detached), target = server.target;
    const before = await page.evaluate(({ targetListId, detached, itemCopy }) => {
      const current = __adminUiTest.state(), target = Object.values(current.layouts).find(row => row.adminCausalSource?.binding.listId === targetListId);
      const source = Object.values(current.layouts).find(row => row.adminCausalSource && row !== target);
      const find = (layout, name) => Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === name).id;
      return { sourceId: source.id, targetId: target.id, sourceBag: find(source, "Сумка шаблона"), sourceChild: find(source, "Карман шаблона"),
        targetBag: find(target, "Целевая сумка"), targetChild: find(target, "Целевой карман"),
        sourceItem: Object.values(current.items).find(row => row.publicCatalogLayoutId === source.id && row.name === (detached ? "Вторая вещь шаблона" : "Насос шаблона")).id,
        source: __adminUiTest.snapshot(source.id), target: __adminUiTest.snapshot(target.id), ids: Object.keys(itemCopy ? current.items : current.containers) };
    }, { targetListId: target.listId, detached, itemCopy });
    const sourceRoot = shape === "nested" ? before.sourceChild : before.sourceBag;
    if (itemCopy) await page.evaluate(id => __adminUiTest.openItem(id), before.sourceItem);
    else if (shape === "shell") {
      await page.locator('[data-view="bags"]').click(); await page.locator(`#bagsView [data-root-card="${sourceRoot}"] [data-root-title]`).click();
    } else await page.evaluate(id => __adminUiTest.openContainer(id), sourceRoot);
    await expect(page.locator(itemCopy ? "#itemDialog" : "#rootContainerDialog")).toBeVisible();
    await page.locator(itemCopy ? "#itemCopyToContainerBtn" : "#rootContainerCopyToContainerBtn").click();
    await expect(page.locator("#containerPickerDialog")).toBeVisible(); await page.locator("#containerPickerLayoutSelect").selectOption(before.targetId);
    if (itemCopy) await page.locator(`#containerPickerBoard [data-pick-container="${shape === "item-nested" ? before.targetChild : before.targetBag}"]`).click();
    else if (shape === "nested") await page.locator(`#containerPickerBoard [data-pick-container-parent="${before.targetBag}"][data-pick-container-index="0"]`).click();
    else await page.locator('#containerPickerBoard [data-pick-root-index="0"]').click();
    await expect(page.locator("#confirmDialog")).toContainText(itemCopy ? "Скопировать вещь" : shape === "shell" ? "пустую копию" : "со всем содержимым");
    await expect(page.locator("#confirmAlternateBtn")).toBeHidden();
    if (mode.startsWith("changed-") || mode.startsWith("pending-")) await page.evaluate(({ mode, before, itemCopy }) => {
      const current = __adminUiTest.state();
      if (mode === "changed-source") (itemCopy ? current.items[before.sourceItem] : current.containers[before.sourceBag]).name = "Позднее изменение";
      if (mode === "changed-target") current.containers[before.targetBag].name = "Поздняя цель";
      if (mode === "changed-account") __adminUiTest.user().id = "admin-b";
      if (mode === "pending-source") current.layouts[before.sourceId].templateDraftSyncPending = true;
      if (mode === "pending-target") current.layouts[before.targetId].templateDraftSyncPending = true;
    }, { mode, before, itemCopy });
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; let mirrored = false;
      Storage.prototype.setItem = function(key, value) {
        const mirror = key.startsWith("bike-packing-prototype-state-v1"), marker = value.includes('"adminCausalCopyPlan"');
        if (mirror && marker) mirrored = true;
        if (mode === "plan-quota" && key.startsWith("bike-packing-admin-save-plans-v1:") || mode === "mirror-quota" && mirror && marker
          || mode === "pointer-quota" && mirror && mirrored && !marker) throw new DOMException("Cross copy quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    if (mode === "source-conflict") server.revision++;
    if (mode === "target-conflict") target.revision++;
    server.lose = mode === "lost";
    await page.locator(mode === "cancel" ? "#confirmCancelBtn" : "#confirmOkBtn").click();
    if (mode === "cancel" || mode === "mirror-quota" || mode.startsWith("changed-") || mode.startsWith("pending-")) {
      if (mode !== "cancel") await expect(page.locator("body")).toContainText(mode === "mirror-quota" ? "Cross copy quota" : "Шаблон изменился");
      expect(server.posts).toEqual([]); expect(await page.evaluate(itemCopy => Object.keys(__adminUiTest.state()[itemCopy ? "items" : "containers"]), itemCopy)).toEqual(before.ids);
      if (mode === "cancel" || mode === "mirror-quota") expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.targetId)).toEqual(before.target);
      expect(server.errors).toEqual([]); return;
    }
    const snapshot = async () => {
      const value = await page.evaluate(id => __adminUiTest.snapshot(id), before.targetId); value.payload = stripAdminTemplateEditorMetadata(value.payload); return value;
    };
    const collection = itemCopy ? "items" : "containers";
    await expect.poll(async () => Object.keys((await snapshot()).payload[collection]).length).toBe(Object.keys(before.target.payload[collection]).length + (shape === "tree" ? 2 : 1));
    const chosen = await snapshot(); let planId;
    if (["plan-quota", "pointer-quota"].includes(mode)) {
      planId = await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.targetId); expect(server.posts).toEqual([]);
    } else { await expect.poll(() => server.posts.length).toBe(1); planId = server.posts[0].operationId; }
    if (mode === "lost") await expect.poll(() => server.hidden).toBe(true);
    server.lose = false; server.hidden = false;
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(target => __adminUiTest.openPrepared(target), targetShared ? { type: "shared", sharedId: "cross" } : { type: "demo", demoListId: target.listId, language: "ru" });
    expect(server.posts).toHaveLength(1); const action = server.posts[0]; expect(action.operationId).toBe(planId);
    expect(action.kind).toBe("template.save"); expect(action.body.base).toEqual({ stateRevision: 19 }); expect(action.body.source.base).toEqual({ stateRevision: 7 });
    expect(action.body.source.payloadDigest).toBe(await adminTemplateCopyPayloadDigest(server.payload)); expect(action.body.payload).toEqual(chosen.payload);
    if (mode.endsWith("conflict")) { expect(server.receipts.get(planId).operation.state).toBe("rejected"); return; }
    await confirmedRevision(page, 20); expect(target.payload).toEqual(chosen.payload);
    expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.sourceId)).toEqual(before.source);
    const added = Object.values(target.payload.items).filter(row => !before.target.payload.items[row.id]);
    expect(added).toHaveLength(shape === "shell" ? 0 : 1);
    const arrangement = Object.values(target.payload.layouts)[0].arrangement;
    for (const row of added) { expect(arrangement.itemQuantities[row.id]).toBe(itemCopy ? detached ? 3 : 1 : 2); expect(arrangement.packedItems[row.id]).toBeUndefined();
      if (itemCopy) {
        const destination = Object.values(before.target.payload.containers).find(row => row.name === (shape === "item-nested" ? "Целевой карман" : "Целевая сумка")).id;
        expect(arrangement.items[row.id]).toBe(destination);
        expect(arrangement.containers[destination].order.at(-1)).toEqual({ type: "item", id: row.id });
        const previous = structuredClone(arrangement);
        delete previous.items[row.id]; delete previous.itemQuantities[row.id];
        previous.containers[destination].itemIds = previous.containers[destination].itemIds.filter(id => id !== row.id);
        previous.containers[destination].order = previous.containers[destination].order.filter(entry => entry.id !== row.id);
        expect(previous).toEqual(Object.values(before.target.payload.layouts)[0].arrangement);
        expect(target.payload.containers).toHaveProperty(destination);
        expect(row.quantity).toBe(1);
      } }
    await editItem(page, "Правка после межшаблонной копии", "Вещь цели", before.targetId); await confirmedRevision(page, 21);
    expect(server.posts).toHaveLength(2); expect(server.posts[1].body.base).toEqual({ stateRevision: 20 }); expect(server.posts[1].body.source).toBeUndefined();
    expect(server.errors).toEqual([]);
  });
}

async function newDraftFixture(page, context, options = {}) {
  const state = await fixture(page, context, options), created = new Map(); state.created = created;
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
    if (!["template.copy", "template.create"].includes(input.kind) && !created.has(input.listId)) return route.fallback();
    state.posts.push(input);
    if (!state.receipts.has(id)) {
      if (input.kind === "template.copy") {
        expect(created.has(input.listId)).toBe(false); expect(input.body.base).toBeNull();
        expect(input.body.source.listId).toBe(options.shared ? "public-shared-layout-ui" : "public-demo-state-ui");
        expect(input.body.source.payloadDigest).toBe(await adminTemplateCopyPayloadDigest(state.payload));
        if (state.copyConflict) {
          const { body, ...identity } = binding;
          state.receipts.set(id, { operation: { id, ...identity, payloadDigest: createHash("sha256").update(canonicalTemplateJson(binding)).digest("hex"), state: "rejected" },
            result: { status: 409, payload: { ok: false, code: "template_copy_source_changed" } } });
          return route.fulfill({ headers, json: { ok: true, ...state.receipts.get(id) } });
        }
        created.set(input.listId, { revision: 0, payload: projectAdminTemplateCopy(state.payload, id, input.body.metadata), metadata: input.body.metadata });
      }
      if (input.kind === "template.create") {
        expect(created.has(input.listId)).toBe(false); expect(input.body.base).toBeNull();
        created.set(input.listId, { revision: 0, payload: structuredClone(input.body.payload), metadata: input.body.metadata });
      }
      const row = created.get(input.listId); expect(row).toBeTruthy();
      if (!["template.create", "template.copy"].includes(input.kind)) expect(input.body.base).toEqual({ stateRevision: row.revision });
      if (input.kind === "template.metadata") row.metadata = structuredClone(input.body.metadata);
      if (input.kind === "template.save") row.payload = structuredClone(input.body.payload);
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

for (const shared of [false, true]) for (const shape of ["tree", "shell", "nested", "link-tree", "link-shell"])
  for (const mode of ["confirmed", "lost", "plan-quota", "pointer-quota", "mirror-quota", "conflict", "changed-choice", "changed-target", "changed-account", "pending-source", "cancel"]) {
  test(`admin tree copy ${shared ? "shared" : "demo"} ${shape} retains its full saved result (${mode})`, async ({ page, context }) => {
    const linking = shape.startsWith("link-"), shell = shape.endsWith("shell"), nestedTarget = shape === "nested";
    const state = await fixture(page, context, { shared, withContainers: true, detachedTree: linking ? shape.slice(5) : "", hydrate: ["plan-quota", "pointer-quota"].includes(mode) });
    const before = await page.evaluate(() => {
      const current = __adminUiTest.state(), layout = Object.values(current.layouts).find(row => row.adminCausalSource);
      const bag = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === "Сумка шаблона");
      const child = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === "Карман шаблона");
      const spare = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === "Запасная сумка");
      return { layoutId: layout.id, binding: layout.adminCausalSource.binding, bagId: bag.id, childId: child.id,
        spareId: spare?.id, snapshot: __adminUiTest.snapshot(layout.id), localIds: Object.keys(current.containers) };
    });
    const sourceId = linking ? before.spareId : shape === "nested" ? before.childId : before.bagId;
    if (shell) {
      await page.locator('[data-view="bags"]').click();
      await page.locator(`#bagsView [data-root-card="${sourceId}"] [data-root-title]`).click();
    } else {
      await page.locator('[data-view="packing"]').click();
      await page.evaluate(id => __adminUiTest.openContainer(id), sourceId);
    }
    await expect(page.locator("#rootContainerDialog")).toBeVisible();
    await page.locator("#rootContainerCopyToContainerBtn").click(); await expect(page.locator("#containerPickerDialog")).toBeVisible();
    await expect(page.locator("#containerPickerLayoutSelect")).toHaveValue(before.layoutId);
    if (nestedTarget) await page.locator(`#containerPickerBoard [data-pick-container-parent="${before.bagId}"][data-pick-container-index="0"]`).click();
    else await page.locator('#containerPickerBoard [data-pick-root-index="0"]').click();
    await expect(page.locator("#confirmDialog")).toContainText(shell ? "пустую копию" : "со всем содержимым");
    if (linking) await expect(page.locator("#confirmAlternateBtn")).toHaveText("Добавить существующую");
    else await expect(page.locator("#confirmAlternateBtn")).toBeHidden();
    if (mode === "changed-choice") await page.evaluate(id => { __adminUiTest.state().containers[id].name = "Источник изменился"; }, sourceId);
    if (mode === "changed-target") await page.evaluate(id => { __adminUiTest.state().layouts[id].arrangement.itemQuantities[Object.keys(__adminUiTest.state().layouts[id].arrangement.items)[0]] = 5; }, before.layoutId);
    if (mode === "changed-account") await page.evaluate(() => { __adminUiTest.user().id = "admin-b"; });
    if (mode === "pending-source") await page.evaluate(id => { __adminUiTest.state().layouts[id].templateDraftSyncPending = true; }, before.layoutId);
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; let mirrored = false; Storage.prototype.setItem = function(key, value) {
        const mirror = key.startsWith("bike-packing-prototype-state-v1"), marker = value.includes('"adminCausalCopyPlan"');
        if (mirror && marker) mirrored = true;
        if (mode === "plan-quota" && key.startsWith("bike-packing-admin-save-plans-v1:") || mode === "mirror-quota" && mirror && marker
          || mode === "pointer-quota" && mirror && mirrored && !marker) throw new DOMException("Tree copy quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    state.lose = mode === "lost"; if (mode === "conflict") state.revision = 8;
    await page.locator(mode === "cancel" ? "#confirmCancelBtn" : linking ? "#confirmAlternateBtn" : "#confirmOkBtn").click();
    if (["mirror-quota", "changed-choice", "changed-target", "changed-account", "pending-source", "cancel"].includes(mode)) {
      if (mode !== "cancel") await expect(page.locator("body")).toContainText(mode === "mirror-quota" ? "Tree copy quota" : "Шаблон изменился");
      expect(state.posts).toEqual([]); expect(await page.evaluate(() => Object.keys(__adminUiTest.state().containers))).toEqual(before.localIds);
      if (["mirror-quota", "cancel"].includes(mode)) expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId)).toEqual(before.snapshot);
      expect(state.errors).toEqual([]); return;
    }
    const candidate = async () => {
      const value = await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId);
      value.payload = stripAdminTemplateEditorMetadata(value.payload); return value;
    };
    if (linking) await expect.poll(async () => JSON.stringify((await candidate()).payload)).not.toBe(JSON.stringify(stripAdminTemplateEditorMetadata(before.snapshot.payload)));
    else await expect.poll(async () => Object.keys((await candidate()).payload.containers).length).toBe(Object.keys(before.snapshot.payload.containers).length + (shape === "tree" ? 2 : 1));
    const chosen = await candidate(); let planId;
    if (["plan-quota", "pointer-quota"].includes(mode)) {
      planId = await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.layoutId); expect(state.posts).toEqual([]);
      if (mode === "pointer-quota") await expect.poll(() => page.evaluate(id => Object.entries(localStorage).some(([key, value]) =>
        key.startsWith("bike-packing-admin-save-plans-v1:") && JSON.parse(value).plan?.id === id), planId)).toBe(true);
      await page.evaluate(() => __adminUiTest.refreshDrafts()); expect(await candidate()).toEqual(chosen);
    } else { await expect.poll(() => state.posts.length).toBe(1); planId = state.posts[0].operationId; }
    if (mode === "lost") await expect.poll(() => state.hidden).toBe(true);
    state.lose = false; state.hidden = false;
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(binding => __adminUiTest.openPrepared(binding.itemKey.startsWith("demo-state")
      ? { type: "demo", demoListId: binding.listId } : { type: "shared", sharedId: binding.itemKey.slice(14) }), before.binding);
    expect(state.posts).toHaveLength(1); expect(state.posts[0].operationId).toBe(planId);
    expect(state.posts[0].kind).toBe("template.save"); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(state.posts[0].body.payload).toEqual(chosen.payload);
    expect(JSON.stringify(state.posts[0].body.payload)).not.toContain("adminCausalCopyPlan");
    if (mode === "conflict") { expect(state.receipts.get(planId).operation.state).toBe("rejected"); return; }
    await confirmedRevision(page, 8); expect(state.payload).toEqual(chosen.payload);
    const addedContainers = Object.keys(state.payload.containers).filter(id => !before.snapshot.payload.containers[id]);
    const addedItems = Object.keys(state.payload.items).filter(id => !before.snapshot.payload.items[id]);
    expect(addedItems).toHaveLength(linking || shell ? 0 : 1);
    const arrangement = Object.values(state.payload.layouts)[0].arrangement, oldArrangement = Object.values(before.snapshot.payload.layouts)[0].arrangement;
    for (const [id, row] of Object.entries(before.snapshot.payload.items)) {
      // Placed quantities live in the arrangement; the catalog stays normalized.
      expect(state.payload.items[id]).toEqual(linking && row.name === "Запасная вещь" ? { ...row, quantity: 1 } : row);
    }
    for (const id of Object.keys(oldArrangement.items)) {
      expect(arrangement.items[id]).toBe(oldArrangement.items[id]); expect(arrangement.itemQuantities[id]).toBe(oldArrangement.itemQuantities[id]);
      expect(arrangement.packedItems[id]).toBe(oldArrangement.packedItems[id]);
    }
    const root = linking ? Object.values(state.payload.containers).find(row => row.name === "Запасная сумка").id
      : addedContainers.find(id => !addedContainers.includes(state.payload.containers[id].parentId));
    expect(root).toBeTruthy();
    if (linking) {
      expect(addedContainers).toEqual([]); expect(Object.keys(state.payload.items).sort()).toEqual(Object.keys(before.snapshot.payload.items).sort());
      expect(Object.keys(state.payload.containers).sort()).toEqual(Object.keys(before.snapshot.payload.containers).sort());
      expect(await page.evaluate(() => Object.keys(__adminUiTest.state().containers))).toEqual(before.localIds);
      if (!shell) {
        const linkedItem = Object.values(state.payload.items).find(row => row.name === "Запасная вещь").id;
        expect(arrangement.itemQuantities[linkedItem]).toBe(3); expect(arrangement.packedItems[linkedItem]).toBeUndefined();
      }
    }
    if (nestedTarget) {
      const parentId = Object.values(state.payload.containers).find(row => row.name === "Сумка шаблона").id;
      expect(arrangement.containers[root].parentId).toBe(parentId); expect(arrangement.containers[parentId].order[0]).toEqual({ type: "container", id: root });
    } else expect(arrangement.rootContainerIds[0]).toBe(root);
    for (const id of addedContainers) expect(state.payload.containers[id].sharedSourceId).toBeUndefined();
    for (const id of addedItems) {
      expect(arrangement.itemQuantities[id]).toBe(2); expect(arrangement.packedItems[id]).toBeUndefined();
      expect(state.payload.items[id].quantity).toBe(1); expect(state.payload.items[id].sharedSourceId).toBeUndefined();
    }
    await editItem(page, "Правка после дерева", "Насос шаблона", before.layoutId); await confirmedRevision(page, 9);
    expect(state.posts).toHaveLength(2); expect(state.posts[1].body.base).toEqual({ stateRevision: 8 });
    for (const id of addedContainers) expect(state.payload.containers[id]).toEqual(chosen.payload.containers[id]);
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const nested of [false, true]) for (const sourceTree of [false, true])
  for (const mode of ["confirmed", "lost", "plan-quota", "pointer-quota", "mirror-quota"]) {
  test(`admin existing item placement ${shared ? "shared" : "demo"} ${nested ? "nested" : "root"} ${sourceTree ? "tree-item" : "standalone"} (${mode})`, async ({ page, context }) => {
    const itemName = sourceTree ? "Запасная вещь" : "Вторая вещь шаблона";
    const server = await fixture(page, context, { shared, withContainers: true, catalogPair: !sourceTree, detachedTree: sourceTree ? "tree" : "", detachedItemLink: sourceTree, hydrate: true });
    const before = await page.evaluate(({ nested, itemName }) => {
      const current = __adminUiTest.state(), layout = Object.values(current.layouts).find(row => row.adminCausalSource);
      const item = Object.values(current.items).find(row => row.publicCatalogLayoutId === layout.id && row.name === itemName);
      const bag = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === (nested ? "Карман шаблона" : "Сумка шаблона"));
      return { layoutId: layout.id, itemId: item.id, bagId: bag.id, snapshot: __adminUiTest.snapshot(layout.id), ids: Object.keys(current.items) };
    }, { nested, itemName });
    await page.locator('[data-view="packing"]').click();
    const bag = page.locator(nested ? `#packingView [data-subcontainer-id="${before.bagId}"]` : `#packingView [data-root-container-id="${before.bagId}"]`);
    await bag.locator("[data-add-to-container]").first().click(); await expect(page.locator("#addToContainerDialog")).toBeVisible();
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; let mirrored = false; Storage.prototype.setItem = function(key, value) {
        const mirror = key.startsWith("bike-packing-prototype-state-v1"), marker = value.includes('"adminCausalCopyPlan"');
        if (mirror && marker) mirrored = true;
        if (mode === "plan-quota" && key.startsWith("bike-packing-admin-save-plans-v1:")
          || mode === "mirror-quota" && mirror && marker
          || mode === "pointer-quota" && mirror && mirrored && !marker) throw new DOMException("Existing item quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    server.lose = mode === "lost";
    await page.locator(`[data-add-existing-item="${before.itemId}"]`).click();
    if (mode === "mirror-quota") {
      await expect(page.locator("body")).toContainText("Existing item quota");
      await expect(page.locator("#addToContainerDialog")).toBeVisible(); expect(server.posts).toEqual([]);
      expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId)).toEqual(before.snapshot);
      expect(await page.evaluate(() => Object.keys(__adminUiTest.state().items))).toEqual(before.ids);
      expect(server.errors).toEqual([]); return;
    }
    await expect(page.locator("#addToContainerDialog")).not.toBeVisible();
    if (["plan-quota", "pointer-quota"].includes(mode)) await expect(page.locator("body")).toContainText("Сохранение шаблона приостановлено");
    else { await expect.poll(() => server.posts.length).toBe(1); if (mode === "lost") await expect.poll(() => server.hidden).toBe(true); }
    const local = await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId);
    expect(await page.evaluate(() => Object.keys(__adminUiTest.state().items))).toEqual(before.ids);
    server.lose = false; server.hidden = false;
    const priorAction = server.posts[0] && structuredClone(server.posts[0]);
    const planId = priorAction?.operationId || await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.layoutId);
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(target => __adminUiTest.openPrepared(target), shared ? { type: "shared", sharedId: "ui" } : { type: "demo", demoListId: "public-demo-state-ui", language: "ru" });
    await confirmedRevision(page, 8); expect(server.posts).toHaveLength(1);
    if (priorAction) expect(server.posts[0]).toEqual(priorAction);
    expect(server.posts[0].operationId).toBe(planId);
    expect(server.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(server.payload).toEqual(stripAdminTemplateEditorMetadata(local.payload));
    const item = Object.values(server.payload.items).find(row => row.name === itemName), target = Object.values(server.payload.containers)
      .find(row => row.name === (nested ? "Карман шаблона" : "Сумка шаблона"));
    const previousItem = Object.values(before.snapshot.payload.items).find(row => row.name === item.name);
    expect(item.id).toBe(previousItem.id); expect(item.quantity).toBe(1);
    if (sourceTree) {
      const oldParent = Object.values(before.snapshot.payload.containers).find(row => row.name === "Запасной карман");
      expect(server.payload.containers[oldParent.id]).toEqual({ ...oldParent,
        itemIds: oldParent.itemIds.filter(id => id !== item.id), order: oldParent.order.filter(row => row.type !== "item" || row.id !== item.id) });
      const stays = Object.values(server.payload.items).find(row => row.name === "Остающаяся вещь");
      expect(stays.containerId).toBe(oldParent.id); expect(stays.quantity).toBe(4);
    }
    const arrangement = Object.values(server.payload.layouts)[0].arrangement;
    expect(arrangement.items[item.id]).toBe(target.id); expect(arrangement.itemQuantities[item.id]).toBe(3);
    expect(arrangement.packedItems[item.id]).toBeUndefined();
    expect(arrangement.containers[target.id].order.at(-1)).toEqual({ type: "item", id: item.id });
    await editItem(page, "Правка после добавления", "Насос шаблона", before.layoutId); await confirmedRevision(page, 9);
    expect(server.posts).toHaveLength(2); expect(server.posts[1].body.base).toEqual({ stateRevision: 8 });
    expect(Object.values(server.payload.layouts)[0].arrangement.itemQuantities[item.id]).toBe(3);
    expect(server.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const shape of ["tree", "shell"]) for (const nested of [false, true, "layout-root"])
  for (const mode of ["confirmed", "lost", "plan-quota", "pointer-quota", "mirror-quota"]) {
  test(`admin existing bag placement ${shared ? "shared" : "demo"} ${shape} ${nested === "layout-root" ? "layout-root" : nested ? "nested" : "root"} (${mode})`, async ({ page, context }) => {
    const rootTarget = nested === "layout-root", dialog = rootTarget ? "#layoutRootDialog" : "#addToContainerDialog";
    const server = await fixture(page, context, { shared, withContainers: true, detachedTree: shape, nestableTree: true, hydrate: true });
    const before = await page.evaluate(nested => {
      const current = __adminUiTest.state(), layout = Object.values(current.layouts).find(row => row.adminCausalSource);
      const source = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === "Запасная сумка");
      const target = Object.values(current.containers).find(row => row.publicCatalogLayoutId === layout.id && row.name === (nested ? "Карман шаблона" : "Сумка шаблона"));
      return { layoutId: layout.id, sourceId: source.id, targetId: target.id, snapshot: __adminUiTest.snapshot(layout.id),
        ids: [Object.keys(current.containers), Object.keys(current.items)] };
    }, nested);
    await page.locator('[data-view="packing"]').click();
    if (rootTarget) await page.locator("[data-add-packing-root]").click();
    else {
      const bag = page.locator(nested ? `#packingView [data-subcontainer-id="${before.targetId}"]` : `#packingView [data-root-container-id="${before.targetId}"]`);
      await bag.locator("[data-add-to-container]").first().click();
    }
    await expect(page.locator(dialog)).toBeVisible();
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; let mirrored = false; Storage.prototype.setItem = function(key, value) {
        const mirror = key.startsWith("bike-packing-prototype-state-v1"), marker = value.includes('"adminCausalCopyPlan"');
        if (mirror && marker) mirrored = true;
        if (mode === "plan-quota" && key.startsWith("bike-packing-admin-save-plans-v1:")
          || mode === "mirror-quota" && mirror && marker
          || mode === "pointer-quota" && mirror && mirrored && !marker) throw new DOMException("Existing bag quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    server.lose = mode === "lost";
    await page.locator(rootTarget ? `[data-add-layout-root="${before.sourceId}"]` : `[data-add-existing-container="${before.sourceId}"]`).click();
    if (mode === "mirror-quota") {
      await expect(page.locator("body")).toContainText("Existing bag quota");
      await expect(page.locator(dialog)).toBeVisible(); expect(server.posts).toEqual([]);
      expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId)).toEqual(before.snapshot);
      expect(await page.evaluate(() => [Object.keys(__adminUiTest.state().containers), Object.keys(__adminUiTest.state().items)])).toEqual(before.ids);
      expect(server.errors).toEqual([]); return;
    }
    await expect(page.locator(dialog)).not.toBeVisible();
    if (["plan-quota", "pointer-quota"].includes(mode)) await expect(page.locator("body")).toContainText("Сохранение шаблона приостановлено");
    else { await expect.poll(() => server.posts.length).toBe(1); if (mode === "lost") await expect.poll(() => server.hidden).toBe(true); }
    const local = await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId);
    expect(await page.evaluate(() => [Object.keys(__adminUiTest.state().containers), Object.keys(__adminUiTest.state().items)])).toEqual(before.ids);
    server.lose = false; server.hidden = false;
    const priorAction = server.posts[0] && structuredClone(server.posts[0]);
    const planId = priorAction?.operationId || await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.layoutId);
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(target => __adminUiTest.openPrepared(target), shared ? { type: "shared", sharedId: "ui" } : { type: "demo", demoListId: "public-demo-state-ui", language: "ru" });
    await confirmedRevision(page, 8); expect(server.posts).toHaveLength(1);
    if (priorAction) expect(server.posts[0]).toEqual(priorAction);
    expect(server.posts[0].operationId).toBe(planId); expect(server.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(server.payload).toEqual(stripAdminTemplateEditorMetadata(local.payload));
    const original = before.snapshot.payload, find = (payload, name) => Object.values(payload.containers).find(row => row.name === name);
    const source = find(server.payload, "Запасная сумка"), target = find(server.payload, nested ? "Карман шаблона" : "Сумка шаблона");
    expect(source.id).toBe(find(original, "Запасная сумка").id);
    expect(Object.keys(server.payload.containers).sort()).toEqual(Object.keys(original.containers).sort());
    expect(Object.keys(server.payload.items).sort()).toEqual(Object.keys(original.items).sort());
    const arrangement = Object.values(server.payload.layouts)[0].arrangement;
    expect(arrangement.containers[source.id].parentId || "").toBe(rootTarget ? "" : target.id);
    if (rootTarget) expect(arrangement.rootContainerIds).toEqual([...Object.values(original.layouts)[0].arrangement.rootContainerIds, source.id]);
    else expect(arrangement.containers[target.id].order.at(-1)).toEqual({ type: "container", id: source.id });
    if (shape === "tree") {
      const pocket = find(server.payload, "Запасной карман"), item = Object.values(server.payload.items).find(row => row.name === "Запасная вещь");
      expect(arrangement.containers[pocket.id].parentId).toBe(source.id);
      expect(arrangement.items[item.id]).toBe(pocket.id); expect(arrangement.itemQuantities[item.id]).toBe(3);
      expect(arrangement.packedItems[item.id]).toBeUndefined();
    }
    await editItem(page, "Правка после добавления сумки", "Насос шаблона", before.layoutId); await confirmedRevision(page, 9);
    expect(server.posts).toHaveLength(2); expect(server.posts[1].body.base).toEqual({ stateRevision: 8 });
    expect(Object.values(server.payload.layouts)[0].arrangement).toEqual(arrangement);
    expect(server.errors).toEqual([]);
  });
}

async function submitAdminTemplateCopy(page, name) {
  const sourceId = await page.evaluate(() => {
    const layout = Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource);
    return layout.id;
  });
  await page.getByRole("button", { name: "Создать новую укладку", exact: true }).click();
  await page.locator("#layoutCreateMode").selectOption("template-copy");
  await page.locator("#layoutCopyFrom").selectOption("template-draft:" + sourceId);
  await page.locator("#layoutName").fill(name); await page.locator("#layoutName").blur();
  if (test.info().project.name === "mobile-webkit") await page.locator("#saveLayoutBtn").tap();
  else await page.locator("#saveLayoutBtn").click();
}

for (const shared of [false, true]) for (const type of ["item", "container"])
  for (const placement of type === "item" ? ["", "root", "nested"] : [""])
  for (const mode of placement ? ["confirmed", "lost", "plan-quota", "pointer-quota", "mirror-quota", "conflict", "changed-choice", "changed-target", "changed-account", "pending-source", "cancel"]
    : ["confirmed", "lost", "plan-quota", "pointer-quota", "mirror-quota", "conflict", "changed-choice"]) {
  test(`admin ${placement ? "placement " + placement : "catalog"} copy ${shared ? "shared" : "demo"} ${type} keeps one frozen batch (${mode})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared, withContainers: true, hydrate: ["plan-quota", "pointer-quota"].includes(mode) });
    const collection = type === "item" ? "items" : "containers";
    const before = await page.evaluate(collection => {
      const current = __adminUiTest.state(), layout = Object.values(current.layouts).find(row => row.adminCausalSource);
      const row = Object.values(current[collection]).find(row => row.publicCatalogLayoutId === layout.id && (collection === "items" || !row.parentId));
      return { id: row.id, row: structuredClone(row), layoutId: layout.id, binding: layout.adminCausalSource.binding,
        localIds: Object.values(current[collection]).filter(row => row.publicCatalogLayoutId === layout.id).map(row => row.id),
        snapshot: __adminUiTest.snapshot(layout.id) };
    }, collection);
    let targetId;
    if (placement) {
      targetId = await page.evaluate(({ layoutId, nested }) => Object.values(__adminUiTest.state().containers)
        .find(row => row.publicCatalogLayoutId === layoutId && Boolean(row.parentId) === nested).id, { layoutId: before.layoutId, nested: placement === "nested" });
      await page.evaluate(id => __adminUiTest.openItem(id), before.id);
      await page.locator("#itemCopyToContainerBtn").click(); await expect(page.locator("#containerPickerDialog")).toBeVisible();
      await expect(page.locator("#containerPickerLayoutSelect")).toHaveValue(before.layoutId);
      await page.locator(`#containerPickerBoard [data-pick-container="${targetId}"]`).click();
    } else {
      await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
      await page.locator(`[data-copy-${type === "item" ? "item" : "root"}="${before.id}"]`).filter({ visible: true }).first().click();
    }
    await expect(page.locator("#confirmDialog")).toBeVisible();
    if (mode === "changed-choice") await page.evaluate(({ collection, id }) => { __adminUiTest.state()[collection][id].name = "Источник изменился до выбора"; }, { collection, id: before.id });
    if (mode === "changed-account") await page.evaluate(() => { __adminUiTest.user().id = "admin-b"; });
    if (mode === "pending-source") await page.evaluate(id => { __adminUiTest.state().layouts[id].templateDraftSyncPending = true; }, before.layoutId);
    if (mode === "changed-target") await page.evaluate(({ layoutId, targetId }) => {
      __adminUiTest.state().layouts[layoutId].arrangement.containers[targetId].order.reverse();
      __adminUiTest.state().containers[targetId].name = "Сумка назначения изменилась";
    }, { layoutId: before.layoutId, targetId });
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; let mirrored = false; Storage.prototype.setItem = function(key, value) {
        const mirror = key.startsWith("bike-packing-prototype-state-v1"), marker = value.includes('"adminCausalCopyPlan"');
        if (mirror && marker) mirrored = true;
        if (mode === "plan-quota" && key.startsWith("bike-packing-admin-save-plans-v1:")
          || mode === "mirror-quota" && mirror && marker
          || mode === "pointer-quota" && mirror && mirrored && !marker) throw new DOMException("Catalog copy quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    if (mode === "conflict") state.revision = 8;
    state.lose = mode === "lost";
    await page.locator(mode === "cancel" ? "#confirmCancelBtn" : "#confirmOkBtn").click();
    const local = () => page.evaluate(({ collection, layoutId }) => Object.values(__adminUiTest.state()[collection]).filter(row => row.publicCatalogLayoutId === layoutId), { collection, layoutId: before.layoutId });
    if (["mirror-quota", "changed-choice", "changed-target", "changed-account", "pending-source", "cancel"].includes(mode)) {
      if (mode !== "cancel") await expect(page.locator("body")).toContainText(mode === "mirror-quota" ? "Catalog copy quota" : "Шаблон изменился");
      expect((await local()).map(row => row.id).sort()).toEqual(before.localIds.sort());
      if (placement && ["mirror-quota", "cancel"].includes(mode)) expect(await page.evaluate(id => __adminUiTest.snapshot(id), before.layoutId)).toEqual(before.snapshot);
      expect(state.posts).toEqual([]); expect(state.errors).toEqual([]); return;
    }
    await expect.poll(async () => (await local()).length).toBe(Object.keys(before.snapshot.payload[collection]).length + 1);
    const copied = (await local()).find(row => !before.localIds.includes(row.id));
    expect(copied.id).not.toBe(before.id); expect(copied.publicCatalogLayoutId).toBe(before.layoutId);
    expect(copied.weight).toBe(before.row.weight);
    if (type === "item") expect(copied.containerId).toBe(targetId || "");
    else { expect(copied.childIds).toEqual([]); expect(copied.itemIds).toEqual([]); expect(copied.order).toEqual([]); }
    let planId;
    if (["plan-quota", "pointer-quota"].includes(mode)) {
      await expect.poll(() => page.evaluate(id => Boolean(__adminUiTest.state().layouts[id].adminCausalCopyPlan), before.layoutId)).toBe(true); expect(state.posts).toEqual([]);
      planId = await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.layoutId);
      if (mode === "pointer-quota") await expect.poll(() => page.evaluate(id => Object.entries(localStorage)
        .some(([key, value]) => key.startsWith("bike-packing-admin-save-plans-v1:") && JSON.parse(value).plan?.id === id), planId)).toBe(true);
      expect(await page.evaluate(id => __adminUiTest.state().layouts[id].templateDraftSyncPending, before.layoutId)).toBe(true);
      await page.evaluate(() => __adminUiTest.refreshDrafts());
      expect((await local()).some(row => row.id === copied.id)).toBe(true);
    } else {
      await expect.poll(() => state.posts.length).toBe(1); planId = state.posts[0].operationId;
      if (mode === "lost") await expect.poll(() => state.hidden).toBe(true);
    }
    state.lose = false; state.hidden = false;
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(binding => __adminUiTest.openPrepared(binding.itemKey.startsWith("demo-state")
      ? { type: "demo", demoListId: binding.listId } : { type: "shared", sharedId: binding.itemKey.slice(14) }), before.binding);
    expect(state.posts).toHaveLength(1); expect(state.posts[0].operationId).toBe(planId);
    expect(state.posts[0].kind).toBe("template.save"); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(JSON.stringify(state.posts[0].body.payload)).not.toContain("adminCausalCopyPlan");
    expect((await local()).some(row => row.id === copied.id)).toBe(true);
    if (mode === "conflict") { expect(state.receipts.get(planId).operation.state).toBe("rejected"); return; }
    await confirmedRevision(page, 8);
    expect(state.payload[collection][copied.id]).toBeTruthy();
    for (const [id, row] of Object.entries(before.snapshot.payload[collection])) expect(state.payload[collection][id]).toEqual(row);
    const arrangement = structuredClone(Object.values(state.payload.layouts)[0].arrangement);
    if (placement) {
      const destination = Object.values(state.payload.containers).find(row => row.name === (placement === "nested" ? "Карман шаблона" : "Сумка шаблона")).id;
      expect(arrangement.items[copied.id]).toBe(destination); expect(arrangement.itemQuantities[copied.id]).toBe(1);
      expect(arrangement.packedItems[copied.id]).toBeUndefined();
      expect(arrangement.containers[destination].order.at(-1)).toEqual({ type: "item", id: copied.id });
      delete arrangement.items[copied.id]; delete arrangement.itemQuantities[copied.id];
      arrangement.containers[destination].itemIds = arrangement.containers[destination].itemIds.filter(id => id !== copied.id);
      arrangement.containers[destination].order = arrangement.containers[destination].order.filter(row => row.id !== copied.id);
      await expect(page.locator(`#packingView [data-item-id="${copied.id}"]`)).toBeVisible();
    }
    expect(arrangement).toEqual(Object.values(before.snapshot.payload.layouts)[0].arrangement);
    await editItem(page, "Правка после копии", "Насос шаблона", before.layoutId); await confirmedRevision(page, 9);
    expect(state.posts).toHaveLength(2); expect(state.posts[1].body.base).toEqual({ stateRevision: 8 });
    expect(state.payload[collection][copied.id]).toBeTruthy(); expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const type of ["item", "container"]) for (const mode of ["confirmed", "lost", "plan-quota"]) {
  test(`admin catalog bulk copy ${shared ? "shared" : "demo"} ${type} remains atomic (${mode})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared, withContainers: true, catalogPair: true, published: mode === "confirmed" });
    const collection = type === "item" ? "items" : "containers";
    const before = await page.evaluate(collection => {
      const value = __adminUiTest.state(), layout = Object.values(value.layouts).find(row => row.adminCausalSource);
      return { layoutId: layout.id, binding: layout.adminCausalSource.binding, snapshot: __adminUiTest.snapshot(layout.id),
        ids: Object.values(value[collection]).filter(row => row.publicCatalogLayoutId === layout.id && (collection === "items" || !row.parentId)).map(row => row.id) };
    }, collection);
    expect(before.ids).toHaveLength(2);
    if (type === "item") {
      expect(Object.values(before.snapshot.payload.items).find(row => row.name === "Вторая вещь шаблона").quantity).toBe(3);
      expect(Object.values(before.snapshot.payload.layouts)[0].arrangement.itemQuantities["item-pump"]).toBe(2);
    }
    await page.locator(`[data-view="${type === "item" ? "items" : "bags"}"]`).click();
    const selector = type === "item" ? "#itemsView [data-list-item-id]" : "#bagsView [data-root-card]";
    const card = id => page.locator(`${selector}[${type === "item" ? "data-list-item-id" : "data-root-card"}="${id}"]`);
    for (const id of before.ids) await card(id).click({ modifiers: ["Control"], position: { x: 8, y: 8 } });
    await card(before.ids[0]).locator(`[data-copy-${type === "item" ? "item" : "root"}]`).click();
    await expect(page.locator("#confirmDialog")).toContainText(type === "item" ? "выбранные вещи" : "выбранные сумки");
    if (mode === "plan-quota") await page.evaluate(() => {
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (key.startsWith("bike-packing-admin-save-plans-v1:")) throw new DOMException("Batch plan quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    });
    state.lose = mode === "lost"; await page.locator("#confirmOkBtn").click();
    const retained = () => page.evaluate(({ collection, layoutId }) => __adminUiTest.snapshot(layoutId).payload[collection], { collection, layoutId: before.layoutId });
    await expect.poll(async () => Object.keys(await retained()).length).toBe(Object.keys(before.snapshot.payload[collection]).length + 2);
    const candidate = await retained(), copiedIds = Object.keys(candidate).filter(id => !Object.hasOwn(before.snapshot.payload[collection], id));
    expect(copiedIds).toHaveLength(2); let planId;
    if (mode === "plan-quota") {
      planId = await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalCopyPlan.id, before.layoutId); expect(state.posts).toEqual([]);
    } else { await expect.poll(() => state.posts.length).toBe(1); planId = state.posts[0].operationId; }
    if (mode === "lost") await expect.poll(() => state.hidden).toBe(true);
    state.lose = false; state.hidden = false;
    await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
    await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
    await page.evaluate(binding => __adminUiTest.openPrepared(binding.itemKey.startsWith("demo-state")
      ? { type: "demo", demoListId: binding.listId } : { type: "shared", sharedId: binding.itemKey.slice(14) }), before.binding);
    await confirmedRevision(page, 8); expect(state.posts).toHaveLength(1); expect(state.posts[0].operationId).toBe(planId);
    expect(state.posts[0].kind).toBe("template.save"); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(state.visibility).toBe(mode === "confirmed" ? "public" : "private");
    expect(state.payload[collection]).toEqual(candidate);
    for (const [id, value] of Object.entries(before.snapshot.payload[collection])) expect(candidate[id]).toEqual(value);
    for (const id of copiedIds) expect(candidate[id].sharedSourceId).toBeUndefined();
    for (const id of copiedIds) {
      const originals = Object.values(before.snapshot.payload[collection]).filter(row => candidate[id].name.startsWith(row.name));
      expect(originals).toHaveLength(1);
      for (const key of ["weight", "quantity", "notes", "location", "categories"]) expect(candidate[id][key]).toEqual(originals[0][key]);
    }
    expect(Object.values(state.payload.layouts)[0].arrangement).toEqual(Object.values(before.snapshot.payload.layouts)[0].arrangement);
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const mode of ["confirmed", "lost", "plan-quota", "mirror-quota", "conflict"]) {
  test(`whole admin template copy ${shared ? "shared" : "demo"} preserves the prepared source and target (${mode})`, async ({ page, context }) => {
    const state = await newDraftFixture(page, context, { shared, withContainers: true, layoutOrder: 17 });
    await page.evaluate(shared => {
      Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource).adminTemplateCopy = true;
      const row = { id: shared ? "ui" : "public-demo-state-ui", listId: shared ? "public-shared-layout-ui" : "public-demo-state-ui",
        name: "Проверяемый шаблон", title: "Проверяемый шаблон", language: "ru", layoutOrder: 17 };
      __adminUiTest.setOrderCatalog({ demo: shared ? [] : [row], shared: shared ? [row] : [] });
    }, shared);
    const sourceBefore = await page.evaluate(() => {
      const id = Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource).id;
      return { id, snapshot: __adminUiTest.snapshot(id) };
    });
    const before = await page.evaluate(() => structuredClone(__adminUiTest.state())); state.createLose = mode === "lost"; state.copyConflict = mode === "conflict";
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (key.startsWith(mode === "plan-quota" ? "bike-packing-admin-save-plans-v1:" : "bike-packing-prototype-state-v1")
          && value.includes("Проверенная копия")) throw new DOMException("Copy quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    await submitAdminTemplateCopy(page, "Проверенная копия");
    if (mode === "mirror-quota") {
      await expect(page.locator("#layoutDialog")).toBeVisible(); await expect(page.locator("body")).toContainText("Copy quota");
      expect(await page.evaluate(() => __adminUiTest.state().layouts)).toEqual(before.layouts);
      expect(state.posts).toEqual([]); expect(state.created.size).toBe(0); return;
    }
    await expect(page.locator("#layoutDialog")).not.toBeVisible();
    const copy = await page.evaluate(() => Object.values(__adminUiTest.state().layouts).find(layout => layout.name === "Проверенная копия"));
    expect(copy).toBeTruthy(); const binding = copy.adminCausalSource.binding;
    if (mode === "conflict") {
      expect(state.posts).toHaveLength(1); expect(state.created.size).toBe(0);
      expect(state.receipts.get(state.posts[0].operationId).operation.state).toBe("rejected");
    }
    if (mode === "plan-quota") { expect(state.posts).toEqual([]); expect(copy.adminCausalCopyPlan.operations[0].kind).toBe("template.copy"); }
    if (mode !== "confirmed") {
      if (mode === "lost") await expect.poll(() => state.createHidden.size).toBe(1);
      state.createLose = false; state.createHidden.clear();
      await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
      await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
      await page.evaluate(binding => __adminUiTest.openPrepared(binding.itemKey.startsWith("demo-state")
        ? { type: "demo", demoListId: binding.listId } : { type: "shared", sharedId: binding.itemKey.slice(14) }), binding);
    }
    if (mode === "conflict") {
      expect(state.posts).toHaveLength(1); expect(state.created.size).toBe(0);
      expect(await page.evaluate(id => __adminUiTest.state().layouts[id].adminCausalSource.planId, copy.id)).toBe(state.posts[0].operationId);
      expect(state.errors).toEqual([]); return;
    }
    await confirmedRevision(page, 1); expect(state.posts).toHaveLength(1); expect(state.created.size).toBe(1);
    expect(state.posts[0].kind).toBe("template.copy"); expect(state.posts[0].body.source.base).toEqual({ stateRevision: 7 });
    const value = await page.evaluate(() => structuredClone(__adminUiTest.state())), layout = value.layouts[copy.id];
    expect(layout.templatePublished).toBe(false); expect(layout.layoutOrder).toBe(17); expect(layout.adminCausalCopyPlan).toBeUndefined();
    const items = Object.values(value.items).filter(item => item.publicCatalogLayoutId === copy.id);
    expect(items).toHaveLength(1); expect(items[0].name).toBe("Насос шаблона"); expect(layout.arrangement.itemQuantities[items[0].id]).toBe(2);
    expect(await page.evaluate(id => __adminUiTest.snapshot(id), sourceBefore.id)).toEqual(sourceBefore.snapshot);
    await renameTemplate(page, "Параметры копии"); await confirmedRevision(page, 2);
    expect(state.posts.at(-1).listId).toBe(binding.listId); expect(state.posts.at(-1).kind).toBe("template.metadata");
    expect(state.posts.at(-1).body.base).toEqual({ stateRevision: 1 }); expect(state.errors).toEqual([]);
    await editItem(page, "Вещь в копии", "Насос шаблона", copy.id); await confirmedRevision(page, 3);
    expect(state.posts.at(-1).kind).toBe("template.save"); expect(state.posts.at(-1).body.base).toEqual({ stateRevision: 2 });
    expect(JSON.stringify(state.posts.at(-1).body.payload)).not.toContain("adminCausalCopyPlan");
    expect(await page.evaluate(id => __adminUiTest.snapshot(id), sourceBefore.id)).toEqual(sourceBefore.snapshot);
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) test(`whole admin template copy ${shared ? "shared" : "demo"} cannot use an unconfirmed source`, async ({ page, context }) => {
  const state = await newDraftFixture(page, context, { shared }); state.blockBusiness = true;
  await page.evaluate(() => { Object.values(__adminUiTest.state().layouts).find(row => row.adminCausalSource).adminTemplateCopy = true; });
  await editItem(page, "Неподтверждённая правка источника"); await expect.poll(() => state.posts.length).toBeGreaterThan(0);
  const before = state.posts.length;
  await submitAdminTemplateCopy(page, "Копия неподтверждённого источника");
  await expect(page.locator("#layoutDialog")).toBeVisible(); await expect(page.locator("body")).toContainText("дождитесь подтверждения изменений исходного шаблона");
  expect(state.posts).toHaveLength(before); expect(state.created.size).toBe(0);
  expect(state.posts.every(row => row.kind !== "template.copy")).toBe(true); expect(state.errors).toEqual([]);
});

async function legacyDraftFixture(page, context, shared, options = {}) {
  const state = await fixture(page, context, { ...options, shared });
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

for (const shared of [false, true]) for (const mode of ["adopt", "mirror-quota", "choice-quota", "changed-server"]) {
  test(`legacy server variant ${shared ? "shared" : "demo"} retains both drafts and adopts without a write (${mode})`, async ({ page, context }) => {
    const state = await legacyDraftFixture(page, context, shared, { withContainers: true, layoutOrder: 17 });
    state.payload.items.pump.name = "Серверный насос";
    state.payload.containers.detached = { id: "detached", name: "Вне укладки", parentId: "", childIds: ["detachedPocket"], itemIds: [], order: [{ type: "container", id: "detachedPocket" }] };
    state.payload.containers.detachedPocket = { id: "detachedPocket", name: "Вложенный карман", parentId: "detached", childIds: [], itemIds: ["outside"], order: [{ type: "item", id: "outside" }] };
    state.payload.items.outside = { id: "outside", name: "Запасная вещь", containerId: "detachedPocket", quantity: 3, weight: 10 };
    state.payload.layouts["layout-a"].arrangement.packedItems.pump = true;
    const before = await page.evaluate(() => structuredClone(__adminUiTest.state()));
    await beginLegacyComparison(page, shared);
    await expect(page.locator("#confirmDialog")).toContainText("Местный насос");
    await expect(page.locator("#confirmDialog")).toContainText("Серверный насос");
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (key.startsWith(mode === "choice-quota" ? "bike-packing-admin-legacy-choice-v1:" : "bike-packing-prototype-state-v1")) throw new DOMException("Legacy adoption quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    if (mode === "changed-server") { state.revision = 12; state.payload.items.pump.name = "Поздняя серверная правка"; }
    await page.locator("#confirmAlternateBtn").click(); await page.waitForFunction(() => __legacyOpenDone);
    expect(state.posts).toEqual([]); expect(state.cancels).toEqual([]);
    const choice = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(key => key.startsWith("bike-packing-admin-legacy-choice-v1:"));
      return key ? JSON.parse(localStorage.getItem(key)).choice : null;
    });
    if (mode.endsWith("quota")) {
      const current = await page.evaluate(() => structuredClone(__adminUiTest.state()));
      expect(current.layouts[state.localId]).toEqual(before.layouts[state.localId]);
      expect(current.items).toEqual(before.items); expect(current.containers).toEqual(before.containers);
      if (mode === "choice-quota") { expect(choice).toBeNull(); expect(state.errors).toEqual([]); return; }
      // The decision survived; losing only the editor mirror must apply that
      // frozen decision after reload, even if the server has since changed.
      state.revision = 12; state.payload.items.pump.name = "Поздняя серверная правка";
      await page.reload(); await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
      await page.waitForFunction(() => __adminUiTest.user()?.id === "admin-a");
      await beginLegacyComparison(page, shared); await page.waitForFunction(() => __legacyOpenDone);
      await expect(page.locator("#confirmDialog")).not.toBeVisible();
    }
    expect(choice.variant).toBe("server"); expect(choice.server.stateRevision).toBe(7);
    expect(Object.values(choice.local.payload.items).some(row => row.name === "Местный насос")).toBe(true);
    expect(choice.server.payload.items.pump.name).toBe("Серверный насос");
    await confirmedRevision(page, 7);
    const adopted = await page.evaluate(() => structuredClone(__adminUiTest.state()));
    const layout = adopted.layouts[state.localId], pump = Object.values(adopted.items).find(row => row.name === "Серверный насос");
    expect(pump).toBeTruthy(); expect(layout.adminCausalSource.planId).toBeNull(); expect(layout.layoutOrder).toBe(17);
    expect(layout.arrangement.itemQuantities[pump.id]).toBe(2); expect(layout.arrangement.packedItems[pump.id]).toBe(true);
    expect(Object.values(adopted.items).some(row => row.name === "Местный насос")).toBe(false);
    for (const [id, row] of Object.entries(before.layouts)) if (id !== state.localId) expect(adopted.layouts[id]).toEqual(row);
    const checkDetached = value => {
      const bag = Object.values(value.containers).find(row => row.name === "Вне укладки");
      const pocket = Object.values(value.containers).find(row => row.name === "Вложенный карман");
      const item = Object.values(value.items).find(row => row.name === "Запасная вещь");
      expect(bag.childIds).toEqual([pocket.id]); expect(pocket.parentId).toBe(bag.id);
      expect(pocket.itemIds).toEqual([item.id]); expect(item.containerId).toBe(pocket.id); expect(item.quantity).toBe(3);
    };
    checkDetached(adopted);
    await page.reload(); await openEditorForTarget(page, shared); await confirmedRevision(page, 7);
    const reopened = await page.evaluate(() => structuredClone(__adminUiTest.state())); checkDetached(reopened);
    expect(Object.values(reopened.items).find(row => row.name === "Серверный насос")?.id).toBe(pump.id);
    expect(state.posts).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("bike-packing-admin-save-plans-v1:")))).toBe(false);
    await editItem(page, "Правка после старого черновика", "Серверный насос");
    await expect.poll(() => state.posts.length).toBe(1); expect(state.posts[0].body.base).toEqual({ stateRevision: 7 });
    expect(state.posts[0].kind).toBe("template.save"); checkDetached(state.posts[0].body.payload);
    if (mode === "adopt") await confirmedRevision(page, 8);
    else expect(state.receipts.get(state.posts[0].operationId).operation.state).toBe("rejected");
    expect(state.errors).toEqual([]);
  });
}

for (const shared of [false, true]) for (const mode of ["unowned", "foreign-reference"]) {
  test(`legacy server variant ${shared ? "shared" : "demo"} preserves ambiguous catalog ownership (${mode})`, async ({ page, context }) => {
    const state = await legacyDraftFixture(page, context, shared, { withContainers: true });
    const before = await page.evaluate(({ id, mode }) => {
      const current = __adminUiTest.state(), layout = current.layouts[id];
      if (mode === "unowned") {
        for (const row of Object.values(current.containers)) if (row.publicCatalogLayoutId === id) delete row.publicCatalogLayoutId;
      } else current.layouts["personal-reference"] = { id: "personal-reference", name: "Личная укладка со ссылкой", rootContainerIds: [...layout.rootContainerIds], arrangement: structuredClone(layout.arrangement) };
      return structuredClone(current);
    }, { id: state.localId, mode });
    await beginLegacyComparison(page, shared); await expect(page.locator("#confirmDialog")).toBeVisible();
    await page.locator("#confirmAlternateBtn").click(); await page.waitForFunction(() => __legacyOpenDone);
    await expect(page.locator("body")).toContainText("отдельной сверки связей");
    const after = await page.evaluate(() => structuredClone(__adminUiTest.state()));
    expect(after.layouts).toEqual(before.layouts); expect(after.items).toEqual(before.items); expect(after.containers).toEqual(before.containers);
    expect(state.posts).toEqual([]); expect(state.errors).toEqual([]);
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

for (const shared of [false, true]) for (const mode of ["adopt", "mirror-quota", "choice-quota", "changed-server"]) {
  test(`server variant ${shared ? "shared" : "demo"} adoption preserves both drafts without a write (${mode})`, async ({ page, context }) => {
    const state = await fixture(page, context, { shared, withContainers: true, layoutOrder: 17 }); state.blockBusiness = true;
    await editItem(page, "Местный насос для сверки"); await expect.poll(() => state.posts.length).toBeGreaterThan(0);
    await page.locator("#syncBtn").click(); const dialog = page.locator("#adminTemplateRecoveryDialog");
    await dialog.locator("[data-admin-stop]").click(); await page.locator("#confirmOkBtn").click();
    await expect(dialog).toContainText("Отправка остановлена"); const attempts = state.posts.length;
    state.blockBusiness = false; state.payload.items.pump.name = "Серверный насос";
    state.payload.containers.detached = { id: "detached", name: "Сумка вне укладки", parentId: "", childIds: ["detachedPocket"], itemIds: [], order: [{ type: "container", id: "detachedPocket" }] };
    state.payload.containers.detachedPocket = { id: "detachedPocket", name: "Вложенная сумка вне укладки", parentId: "detached", childIds: [], itemIds: ["outside"], order: [{ type: "item", id: "outside" }] };
    state.payload.items.outside = { id: "outside", name: "Вещь вне укладки", containerId: "detachedPocket", quantity: 3, weight: 10 };
    state.payload.layouts["layout-a"].arrangement.packedItems.pump = true;
    const before = await page.evaluate(() => structuredClone(__adminUiTest.state()));
    const editorId = Object.values(before.layouts).find(row => row.adminCausalSource).id;
    expect(Object.values(before.items).filter(row => row.name === "Местный насос для сверки").every(row => row.publicCatalogLayoutId === editorId)).toBe(true);
    if (mode.endsWith("quota")) await page.evaluate(mode => {
      const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
        if (key.startsWith(mode === "choice-quota" ? "bike-packing-admin-stop-choice-v1:" : "bike-packing-prototype-state-v1")) throw new DOMException("Adoption quota", "QuotaExceededError");
        return set.call(this, key, value);
      };
    }, mode);
    await dialog.locator("[data-admin-compare]").click(); await expect(page.locator("#confirmDialog")).toContainText("Серверный насос");
    if (mode === "changed-server") { state.revision = 12; state.payload.items.pump.name = "Поздняя серверная правка"; }
    await page.locator("#confirmAlternateBtn").click(); await expect(dialog.locator("[data-admin-recovery-close]")).toBeEnabled();
    expect(state.posts).toHaveLength(attempts); expect(state.cancels).toHaveLength(1);
    if (mode === "choice-quota") {
      await expect(dialog).toContainText("Adoption quota");
      expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).some(row => row.name === "Местный насос для сверки"))).toBe(true);
      expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("bike-packing-admin-stop-choice-v1:")))).toBe(false);
      return;
    }
    if (mode === "mirror-quota") {
      expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).some(row => row.name === "Местный насос для сверки"))).toBe(true);
      await page.reload(); await openEditorForTarget(page, shared);
    } else { await expect(dialog).toContainText("Нет действий, ожидающих отправки"); await dialog.locator("[data-admin-recovery-close]").click(); }
    await confirmedRevision(page, 7);
    const adopted = await page.evaluate(() => structuredClone(__adminUiTest.state())), layout = adopted.layouts[editorId];
    const pump = Object.values(adopted.items).find(row => row.name === "Серверный насос"); expect(pump).toBeTruthy();
    expect(layout.arrangement.itemQuantities[pump.id]).toBe(2); expect(layout.arrangement.packedItems[pump.id]).toBe(true);
    expect(layout.layoutOrder).toBe(17); expect(Object.values(adopted.items).some(row => row.name === "Вещь вне укладки")).toBe(true);
    const detachedTree = value => {
      const bag = Object.values(value.containers).find(row => row.name === "Сумка вне укладки");
      const pocket = Object.values(value.containers).find(row => row.name === "Вложенная сумка вне укладки");
      const item = Object.values(value.items).find(row => row.name === "Вещь вне укладки");
      expect(bag.childIds).toEqual([pocket.id]); expect(pocket.parentId).toBe(bag.id);
      expect(pocket.itemIds).toEqual([item.id]); expect(item.containerId).toBe(pocket.id); expect(item.quantity).toBe(3);
      expect(Object.values(value.layouts)[0].rootContainerIds).not.toContain(bag.id);
    };
    detachedTree({ ...adopted, layouts: { [editorId]: layout } });
    expect(Object.values(adopted.items).some(row => row.name === "Местный насос для сверки")).toBe(false);
    for (const [id, row] of Object.entries(before.layouts)) if (id !== editorId) expect(adopted.layouts[id]).toEqual(row);
    const choice = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.startsWith("bike-packing-admin-stop-choice-v1:")))).choice);
    expect(choice.variant).toBe("server"); expect(choice.server.stateRevision).toBe(7);
    expect(Object.values(choice.local.payload.items).some(row => row.name === "Местный насос для сверки")).toBe(true);
    await page.reload(); await openEditorForTarget(page, shared); await confirmedRevision(page, 7);
    const reopened = await page.evaluate(() => structuredClone(__adminUiTest.state())); detachedTree({ ...reopened, layouts: { [editorId]: reopened.layouts[editorId] } });
    expect(await page.evaluate(() => Object.values(__adminUiTest.state().items).find(row => row.name === "Серверный насос")?.id)).toBe(pump.id);
    expect(state.posts).toHaveLength(attempts);
    await editItem(page, "Правка после серверного выбора", "Серверный насос");
    await expect.poll(() => state.posts.length).toBe(attempts + 1); expect(state.posts.at(-1).body.base).toEqual({ stateRevision: 7 });
    expect(state.posts.at(-1).kind).toBe("template.save"); detachedTree(state.posts.at(-1).body.payload);
    if (mode !== "changed-server") await confirmedRevision(page, 8);
    else expect(state.receipts.get(state.posts.at(-1).operationId).operation.state).toBe("rejected");
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
