import { test as base, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { adminPhotoTreeCopyRecordInput } from "../fixtures/admin-template-photo-tree-copy-record-fixture.js";
import { encodeAdminTemplatePhotoTreeCopyRecord, prepareAdminTemplatePhotoTreeCopyRecord } from "../../src/sync/admin-template-photo-tree-copy-record.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const origin = "https://tree-store.localhost", pageUrl = origin + "/__tree-store";
const databaseName = "bike-packing-admin-template-photo-tree-copy-actions-v1";
const bootstrap = `
import { createAdminTemplatePhotoTreeCopyActionStore } from '/src/sync/admin-template-photo-tree-copy-action-store.js';
window.configureTreeStore = (binding, enabled) => {
  window.treeContext = {...structuredClone(binding),scope:'admin-template',admin:true,generation:'native-generation'};
  window.treeStore = createAdminTemplatePhotoTreeCopyActionStore({binding,getContext:()=>window.treeContext,
    ...(enabled === undefined ? {} : {enabled})});
};
window.treeInvoke = async (method, ...args) => {
  try { return {ok:true,value:await window.treeStore[method](...args)}; }
  catch(error) { return {ok:false,code:error.code,hasUnconfirmed:Object.hasOwn(error,'unconfirmedAdminPhotoTreeCopy')}; }
};
// Observe a real committed native transaction. This changes context only;
// request/result/commit/abort/durability behavior is never replaced.
window.switchAfterNativeCommit = (field,value) => {
  const native = IDBDatabase.prototype.transaction;
  window.observedNativeCommit = false;
  IDBDatabase.prototype.transaction = function(...args) {
    const transaction = native.apply(this,args);
    if(this.name === '${databaseName}' && args[1] === 'readwrite') {
      IDBDatabase.prototype.transaction = native;
      transaction.addEventListener('complete',()=>{
        window.observedNativeCommit = true;
        window.treeContext[field] = value;
      },{once:true});
    }
    return transaction;
  };
};
window.treeStoreReady = true;
`;

const test = base.extend({
  localProof: [async ({ context }, use, testInfo) => {
    const unexpected = [], errors = [], requests = [], sources = new Map();
    const watch = page => {
      page.on("pageerror", error => errors.push(error.stack || error.message));
      page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    };
    context.pages().forEach(watch); context.on("page", watch);
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      requests.push({ method: request.method(), url: request.url() });
      if (request.method() === "GET" && url.origin === origin && !url.search) {
        if (url.pathname === "/__tree-store") return route.fulfill({ contentType: "text/html", body: '<!doctype html><meta charset="utf-8"><title>Native tree store proof</title><script type="module" src="/__tree-store.js"></script>' });
        if (url.pathname === "/__tree-store.js") return route.fulfill({ contentType: "text/javascript", body: bootstrap });
        if (/^\/src\/[A-Za-z0-9_/-]+\.js$/.test(url.pathname)) {
          const file = path.resolve(root, "." + url.pathname);
          const relative = path.relative(path.join(root, "src"), file);
          if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
            const body = await readFile(file, "utf8"), digest = createHash("sha256").update(body).digest("hex");
            if (sources.has(url.pathname)) expect(sources.get(url.pathname), "Reload/tabs must use identical source bytes").toBe(digest);
            sources.set(url.pathname, digest);
            return route.fulfill({ contentType: "text/javascript", body });
          }
        }
      }
      unexpected.push(request.method() + " " + request.url());
      return route.fulfill({ status: 500, contentType: "text/plain", body: "Unexpected request in local native store proof" });
    });
    await use({ requests });
    await testInfo.attach("native-tree-store-proof", { contentType: "application/json", body: Buffer.from(JSON.stringify({
      browser: context.browser()?.version(), project: testInfo.project.name, requests, unexpected, errors,
      sources: Object.fromEntries([...sources].sort(([left], [right]) => left.localeCompare(right))),
      scope: "Real IndexedDB in a browser context; fresh documents and two tabs; no native quota exhaustion claim",
    }, null, 2)) });
    expect(unexpected, "Every request must be served locally by the explicit allowlist").toEqual([]);
    expect(errors, "Native browser and application errors remain visible").toEqual([]);
    expect(requests.every(request => request.method === "GET" && new URL(request.url).origin === origin)).toBe(true);
  }, { auto: true }],
});

async function open(page, input, enabled = true) {
  await page.goto(pageUrl);
  await page.waitForFunction(() => window.treeStoreReady === true);
  await page.evaluate(({ binding, enabled }) => window.configureTreeStore(binding, enabled), { binding: input.binding, enabled });
}
const invoke = (page, method, ...args) => page.evaluate(({ method, args }) => window.treeInvoke(method, ...args), { method, args });
const selection = input => ({ action: input.action, snapshot: input.snapshot });
const operationId = input => input.action.operationId;
const stageIds = input => input.action.body.photoCopy.owners.flatMap(owner => owner.photos.map(photo => photo.assetId));
const storageError = name => `admin-template-photo-tree-copy-storage-${name}`;
const prepare = () => adminPhotoTreeCopyRecordInput({ owners: 7, photos: 4 });

async function rawNativeRows(page) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(["actions", "stage-dispatches"], "readonly");
      const actions = tx.objectStore("actions").getAll(), claims = tx.objectStore("stage-dispatches").getAll();
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve({ actions: actions.result, claims: claims.result }); };
    };
  }), databaseName);
}

test("native capture freezes full selection before hashing and survives reload plus a fresh page", async ({ page, context }) => {
  const input = await prepare(), expected = await prepareAdminTemplatePhotoTreeCopyRecord(input), encoded = await encodeAdminTemplatePhotoTreeCopyRecord(input);
  await open(page, input);
  const captured = await page.evaluate(async input => {
    const pending = window.treeInvoke("capture", input);
    input.action.body.photoCopy.fields.name = "Late caller edit";
    input.snapshot.copiedOwners[0].localId = "late-local-id";
    return pending;
  }, selection(input));
  expect(captured).toEqual({ ok: true, value: expected });
  expect(await rawNativeRows(page)).toEqual({ actions: [encoded], claims: [] });
  await page.evaluate(async id => { const record = await window.treeStore.read(id); record.snapshot.target.metadata.title = "Mutated returned object"; }, operationId(input));
  await open(page, input);
  expect(await invoke(page, "read", operationId(input))).toEqual({ ok: true, value: expected });
  await page.close();
  const cold = await context.newPage(); await open(cold, input);
  expect(await invoke(cold, "read", operationId(input))).toEqual({ ok: true, value: expected });
  expect((await invoke(cold, "ids")).value).toEqual([operationId(input)]);
  for (const [index, id] of stageIds(input).entries()) {
    const stage = await invoke(cold, "readStage", operationId(input), id);
    expect(stage.ok).toBe(true);
    expect(stage.value).toEqual({ binding: expected.binding, action: expected.action, snapshot: expected.snapshot,
      intentHash: expected.intentHash, stage: expected.stages[index],
      assetDigest: input.action.body.photoCopy.owners.flatMap(owner => owner.photos)[index].assetDigest });
  }
  expect(await rawNativeRows(cold)).toEqual({ actions: [encoded], claims: [] });
});

test("two native tabs admit exactly one competing same-base intent and preserve exact retries", async ({ page, context }) => {
  const inputs = await Promise.all([prepare(), prepare()]);
  expect(inputs[0].binding).toEqual(inputs[1].binding);
  expect(operationId(inputs[0])).not.toBe(operationId(inputs[1]));
  await open(page, inputs[0]); const other = await context.newPage(); await open(other, inputs[1]);
  const results = await Promise.all([invoke(page, "capture", selection(inputs[0])), invoke(other, "capture", selection(inputs[1]))]);
  expect(results.filter(result => result.ok)).toHaveLength(1);
  expect(results.find(result => !result.ok).code).toBe(storageError("base-already-captured"));
  const index = results.findIndex(result => result.ok), winner = inputs[index], expected = await encodeAdminTemplatePhotoTreeCopyRecord(winner);
  const before = await rawNativeRows(page);
  expect(before).toEqual({ actions: [expected], claims: [] });
  const retries = await Promise.all([invoke(page, "capture", selection(winner)), invoke(other, "capture", selection(winner))]);
  expect(retries).toEqual([results[index], results[index]]);
  expect(await rawNativeRows(other)).toEqual(before);
  await other.close(); await open(page, winner);
  expect((await invoke(page, "ids")).value).toEqual([operationId(winner)]);
});

test("native per-stage claims have one fresh winner across tabs and never reset after cold reopen", async ({ page, context }) => {
  const input = await prepare(); await open(page, input);
  expect((await invoke(page, "capture", selection(input))).ok).toBe(true);
  const other = await context.newPage(); await open(other, input);
  for (const stageId of stageIds(input)) {
    const results = await Promise.all([invoke(page, "claimStage", operationId(input), stageId), invoke(other, "claimStage", operationId(input), stageId)]);
    expect(results.every(result => result.ok)).toBe(true);
    expect(results.map(result => result.value.fresh).sort()).toEqual([false, true]);
    const [{ fresh: _a, ...left }, { fresh: _b, ...right }] = results.map(result => result.value);
    expect(left).toEqual(right); expect(left.actionOperationId).toBe(operationId(input)); expect(left.stageOperationId).toBe(stageId);
  }
  const before = await rawNativeRows(page); expect(before.actions).toHaveLength(1); expect(before.claims).toHaveLength(4);
  await page.close(); await other.close();
  const cold = await context.newPage(); await open(cold, input);
  for (const id of stageIds(input)) expect((await invoke(cold, "claimStage", operationId(input), id)).value.fresh).toBe(false);
  expect(await rawNativeRows(cold)).toEqual(before);
});

test("default OFF cold reads retain the complete proof and claims while new capture/claim stay blocked", async ({ page, context }) => {
  const input = await prepare(), expected = await prepareAdminTemplatePhotoTreeCopyRecord(input); await open(page, input);
  expect((await invoke(page, "capture", selection(input))).ok).toBe(true);
  expect((await invoke(page, "claimStage", operationId(input), stageIds(input)[0])).value.fresh).toBe(true);
  const before = await rawNativeRows(page); await page.close();
  const cold = await context.newPage(); await open(cold, input);
  // Omit the option to exercise the actual frozen module's default OFF flag.
  await cold.evaluate(binding => window.configureTreeStore(binding), input.binding);
  expect(await invoke(cold, "read", operationId(input))).toEqual({ ok: true, value: expected });
  expect((await invoke(cold, "ids")).value).toEqual([operationId(input)]);
  expect((await invoke(cold, "readStage", operationId(input), stageIds(input)[0])).value.stage).toEqual(expected.stages[0]);
  for (const [method, args] of [["capture", [selection(input)]], ["claimStage", [operationId(input), stageIds(input)[1]]]]) {
    expect((await invoke(cold, method, ...args)).code).toBe(storageError("disabled"));
  }
  expect(await rawNativeRows(cold)).toEqual(before);
});

test("actor switch at native commit refuses adoption but preserves the original actor's exact record", async ({ page, context }) => {
  const input = await prepare(), expected = await prepareAdminTemplatePhotoTreeCopyRecord(input), encoded = await encodeAdminTemplatePhotoTreeCopyRecord(input);
  await open(page, input);
  await page.evaluate(() => window.switchAfterNativeCommit("actorId", "other-admin"));
  const result = await invoke(page, "capture", selection(input));
  expect(await page.evaluate(() => window.observedNativeCommit)).toBe(true);
  expect(result).toEqual({ ok: false, code: storageError("context-changed"), hasUnconfirmed: false });
  expect((await invoke(page, "read", operationId(input))).code).toBe(storageError("context-changed"));
  expect(await rawNativeRows(page)).toEqual({ actions: [encoded], claims: [] });
  await page.evaluate(binding => window.configureTreeStore({ ...binding, actorId: "other-admin" }, false), input.binding);
  expect(await invoke(page, "read", operationId(input))).toEqual({ ok: true, value: null });
  expect((await invoke(page, "ids")).value).toEqual([]);
  await page.close(); const cold = await context.newPage(); await open(cold, input, false);
  expect(await invoke(cold, "read", operationId(input))).toEqual({ ok: true, value: expected });
  expect(await rawNativeRows(cold)).toEqual({ actions: [encoded], claims: [] });
});

test("context generation switch after native claim commit never grants a second fresh dispatch", async ({ page, context }) => {
  const input = await prepare(); await open(page, input);
  expect((await invoke(page, "capture", selection(input))).ok).toBe(true);
  const stageId = stageIds(input)[0];
  await page.evaluate(() => window.switchAfterNativeCommit("generation", "new-route"));
  expect((await invoke(page, "claimStage", operationId(input), stageId)).code).toBe(storageError("context-changed"));
  expect(await page.evaluate(() => window.observedNativeCommit)).toBe(true);
  const before = await rawNativeRows(page); expect(before.actions).toHaveLength(1); expect(before.claims).toHaveLength(1);
  await page.close(); const cold = await context.newPage(); await open(cold, input);
  const claim = await invoke(cold, "claimStage", operationId(input), stageId);
  expect(claim.ok).toBe(true); expect(claim.value.fresh).toBe(false);
  expect(await rawNativeRows(cold)).toEqual(before);
});
