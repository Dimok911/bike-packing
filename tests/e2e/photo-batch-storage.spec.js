import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";

const origin = "https://experiment.vniipo-help.ru";
async function fixture(page, context) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && /^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    if (url.origin === origin && url.pathname === "/__batch-test") return route.fulfill({ contentType: "text/html", body: `<script type="module">
      import {createPersonalPhotoActionStore} from '/src/sync/personal-photo-action-store.js';
      import {preparePersonalPhotoAttachmentBatch} from '/src/sync/personal-photo-batch-plan.js';
      import {inspectPersonalPhotoRecovery} from '/src/sync/personal-photo-recovery-inventory.js';
      import {createPersonalPhotoRecoveryArchive} from '/src/sync/personal-photo-recovery-archive.js';
      import {createPersonalSaveOutbox} from '/src/sync/personal-save-outbox.js';
      import {createExperimentTransport} from '/src/sync/experiment-transport.js';
      import {createListOperationQueue} from '/src/sync/list-operation-queue.js';
      import {createPersonalPhotoStaging} from '/src/sync/personal-photo-staging.js';
      import {readZipEntries,zipText} from '/src/utils/simple-zip.js';
      window.binding={environment:'bike-packing-experiment',actorId:'actor-a',listId:'list-a',scopeKey:'id:actor-a'};
      window.editContext={...binding,scope:'personal',generation:'edit-1'};
      window.batchStore=(options={})=>createPersonalPhotoActionStore({...binding,environmentId:binding.environment,
        getContext:()=>editContext,enabled:true,batchEnabled:true,...options});
      window.batchInput=()=>{
        const payload={items:{item:{id:'item',name:'Frozen owner',photos:[]}},containers:{},layouts:{}};
        const plan=preparePersonalPhotoAttachmentBatch({binding,snapshot:payload,basePayload:payload,baseStateRevision:1,
          entityType:'item',entityId:'item',baseEntityRevision:1,
          files:[1,2].map(i=>({fileName:'selected-'+i+'.png',file:new Blob(['full '+i],{type:'image/png'}),
            thumb:new Blob(['thumb '+i],{type:'image/png'})}))},{enabled:true});
        return {snapshot:plan.snapshot,files:plan.files,action:{...binding,operationId:plan.operationId,kind:'photos.mutate',
          generation:1,body:{...plan.body,causal:{dependsOn:[],reads:[]}}}};
      };
      window.inspectBatch=()=>inspectPersonalPhotoRecovery({store:batchStore(),outbox:createPersonalSaveOutbox({...binding,storage:localStorage}),getContext:()=>editContext});
      window.exportBatch=()=>createPersonalPhotoRecoveryArchive({store:batchStore(),getContext:()=>editContext,
        getRecoveryCopy:()=>({environment:binding.environment,scopeKey:binding.scopeKey,automaticImportAllowed:false})});
      window.readBatchZip=readZipEntries; window.batchZipText=zipText; window.batchReady=true;
      window.batchRuntime=()=>{
        const transport=createExperimentTransport({selection:'direct'}), store=batchStore();
        return {store,outbox:createPersonalSaveOutbox({...binding,storage:localStorage,photoEnabled:true,photoBatchEnabled:true}),
          queue:createListOperationQueue({transport,getContext:()=>editContext,enabled:true,photoEnabled:true}),
          staging:createPersonalPhotoStaging({store,transport,getContext:()=>editContext,enabled:true,batchEnabled:true})};
      };
      window.registerBatch=async()=>{
        const input=batchInput(), current=batchRuntime(), base=structuredClone(input.snapshot); base.items.item.photos=[];
        current.outbox.adoptRemoteBaseline({snapshot:base,payload:base,stateRevision:1});
        const body={...input.action.body}; delete body.causal;
        const plan=current.outbox.preparePhoto({snapshot:input.snapshot,payload:input.snapshot,body,operationId:input.action.operationId});
        await current.store.captureBatch({...input,...plan});
        return current.outbox.capturePhoto({plan,store:current.store,getContext:()=>editContext});
      };
      window.drainBatch=async()=>{
        const current=batchRuntime();
        try {await current.outbox.drain({queue:current.queue,getContext:()=>editContext,photoStore:current.store,photoStaging:current.staging}); return 'confirmed';}
        catch(error){return {blocked:true,message:error.message};}
      };
    </script>` });
    return route.abort();
  });
  await page.goto(`${origin}/__batch-test`); await page.waitForFunction(() => window.batchReady);
}

test("whole photo batch commits once with strict durability and exact files survive reload with writers disabled", async ({ page, context }) => {
  await fixture(page, context);
  const initial = await page.evaluate(async () => {
    const native = IDBDatabase.prototype.transaction; let strict = false, completed = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = native.apply(this, args);
      if (args[1] === "readwrite") { strict ||= args[2]?.durability === "strict"; tx.addEventListener("complete", () => { completed = true; }); }
      return tx;
    };
    try {
      const input = batchInput(), id = input.action.operationId, pending = batchStore().captureBatch(input);
      input.files.reverse(); input.snapshot.items.item.name = "After click"; input.action.body.changes.reverse();
      const saved = await pending;
      return { id, strict, completed, name: saved.snapshot.items.item.name, count: saved.files.length, hash: saved.intentHash };
    } finally { IDBDatabase.prototype.transaction = native; }
  });
  expect(initial).toMatchObject({ strict: true, completed: true, name: "Frozen owner", count: 2 });
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  const restored = await page.evaluate(async id => {
    const saved = await batchStore({ enabled: false, batchEnabled: false }).read(id);
    return { hash: saved.intentHash, bytes: await Promise.all(saved.files.map(async part => [await part.file.text(), await part.thumb.text()])),
      inventory: await inspectBatch() };
  }, initial.id);
  expect(restored.hash).toBe(initial.hash); expect(restored.bytes).toEqual([["full 1", "thumb 1"], ["full 2", "thumb 2"]]);
  expect(restored.inventory.entries).toMatchObject([{ operationId: initial.id, state: "unlinked", batch: true, photoCount: 2, dispatchAllowed: false }]);
});

test("two real tabs share immutable batch and separate once-only claims for every file", async ({ page, context }) => {
  await fixture(page, context);
  const initial = await page.evaluate(async () => {
    const input = batchInput(), saved = await batchStore().captureBatch(input);
    return { id: saved.action.operationId, stages: saved.files.map(part => part.stage.operationId) };
  });
  const second = await context.newPage(); await second.goto(`${origin}/__batch-test`); await second.waitForFunction(() => window.batchReady);
  const claim = (tab, stage) => tab.evaluate(async ({ id, stage }) => batchStore().claimStage(id, stage), { id: initial.id, stage });
  for (const stage of initial.stages) {
    const claims = await Promise.all([claim(page, stage), claim(second, stage)]);
    expect(claims.map(value => value.fresh).sort()).toEqual([false, true]);
    expect(claims[0].intentHash).toBe(claims[1].intentHash);
  }
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  expect((await claim(page, initial.stages[0])).fresh).toBe(false);
  const outcome = await page.evaluate(async ({ id, stages }) => {
    const store = batchStore(), saved = await store.read(id);
    await store.captureBatch(saved); // Identical ID and bytes: no replacement.
    saved.files[1].file = new Blob(["different bytes"], { type: "image/png" });
    let rejected; try { await store.captureBatch(saved); } catch (error) { rejected = error.code; }
    return { rejected, claims: (await store.recoveryRecords())[0].claims.map(claim => claim.stageOperationId).sort(),
      retained: await (await store.readStage(id, stages[1])).file.text() };
  }, initial);
  expect(outcome).toEqual({ rejected: "operation-id-reused", claims: [...initial.stages].sort(), retained: "full 2" });
});

for (const mode of ["abort", "quota", "context"]) test(`whole batch ${mode} retains all original files and creates no partial record`, async ({ page, context }) => {
  await fixture(page, context);
  const result = await page.evaluate(async mode => {
    const input = batchInput(), nativeAdd = IDBObjectStore.prototype.add, nativeRead = Blob.prototype.arrayBuffer;
    if (mode !== "context") IDBObjectStore.prototype.add = function (...args) {
      if (this.name !== "actions") return nativeAdd.apply(this, args);
      if (mode === "quota") throw new DOMException("Fixture full storage", "QuotaExceededError");
      const request = nativeAdd.apply(this, args); request.addEventListener("success", () => this.transaction.abort()); return request;
    };
    else Blob.prototype.arrayBuffer = async function () { const bytes = await nativeRead.call(this); editContext.generation = "changed"; return bytes; };
    let error;
    try { await batchStore().captureBatch(input); } catch (caught) { error = caught; }
    finally { IDBObjectStore.prototype.add = nativeAdd; Blob.prototype.arrayBuffer = nativeRead; }
    return { blocked: error?.isPersonalPhotoStorageBlocked, files: await Promise.all(error.unconfirmedPhotoDraft.files.map(part => part.file.text())),
      snapshot: error.unconfirmedPhotoDraft.snapshot.items.item.name, ids: await batchStore().ids() };
  }, mode);
  expect(result).toEqual({ blocked: true, files: ["full 1", "full 2"], snapshot: "Frozen owner", ids: [] });
});

test("damaged batch is fenced and raw export retains every available part and its independent dispatch claims", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => {
    const input = batchInput(), store = batchStore(); await store.captureBatch(input);
    for (const part of input.files) await store.claimStage(input.action.operationId, part.stage.operationId);
    const row = (await store.recoveryRecords())[0], open = indexedDB.open("bike-packing-personal-photo-actions-v1", 2);
    const db = await new Promise(resolve => { open.onsuccess = () => resolve(open.result); });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("actions", "readwrite"); row.record.files[1].file = null; row.record.intentHash = "damaged";
      tx.objectStore("actions").put(row.record); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); db.close(); return input.action.operationId;
  });
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  const result = await page.evaluate(async id => {
    const inventory = await inspectBatch(), archive = await exportBatch(), entries = await readBatchZip(archive.blob), prefix = `photos/${id}`;
    return { state: inventory.entries[0].state, needsRecovery: inventory.needsRecovery,
      metadata: JSON.parse(batchZipText(entries.get(`${prefix}/record.json`))), manifest: archive.manifest,
      original: batchZipText(entries.get(`${prefix}/parts/0/original.bin`)),
      retainedThumb: batchZipText(entries.get(`${prefix}/parts/1/thumbnail.bin`)),
      missingFileExported: entries.has(`${prefix}/parts/1/original.bin`), stillPresent: await batchStore().ids() };
  }, id);
  expect(result).toMatchObject({ state: "corrupt-file", needsRecovery: true, original: "full 1", retainedThumb: "thumb 2", missingFileExported: false, stillPresent: [id] });
  expect(result.metadata.intentHash).toBe("damaged"); expect(result.metadata.dispatchClaims).toHaveLength(2);
  expect(result.manifest).toMatchObject({ automaticImportAllowed: false, serverConfirmationIncluded: false });
  expect(result.manifest.files[0].parts).toMatchObject([{ fullBytesIncluded: true }, { fullBytesIncluded: false, thumbnailBytesIncluded: true }]);
});

test("native batch queue loses file and owner ACKs then reloads their exact receipts without repeating either upload", async ({ page, context }) => {
  await fixture(page, context);
  const record = await page.evaluate(() => registerBatch()), stages = new Map(), posts = [];
  // WebKit's intercepted postDataBuffer omits file bodies. Observe the actual
  // native FormData before fetch, not an empty debug-protocol representation.
  await page.addInitScript(() => {
    window.batchSentFiles = {};
    const original = window.fetch;
    window.fetch = async (url, options) => {
      if (options?.body instanceof FormData) {
        const file = options.body.get("file"), thumb = options.body.get("thumb");
        const hash = async blob => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(byte => byte.toString(16).padStart(2, "0")).join("");
        window.batchSentFiles[options.body.get("operationId")] = { fileHash: await hash(file), thumbHash: await hash(thumb), fileText: await file.text(), thumbText: await thumb.text() };
      }
      return original(url, options);
    };
  });
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  let phase = "files", ownerReceipt;
  await context.route("**/letters-vniipo/api/**", async route => {
    const request = route.request(), url = new URL(request.url()), leaf = url.pathname.split("/").at(-1);
    if (leaf === "me") return route.fulfill({ json: { user: { id: "actor-a" } } });
    if (leaf === "capabilities") return route.fulfill({ json: { capabilities: ["personalListCausalOperationsV1", "personalCausalPhotoPublicationV1", "personalStagedPhotoAssetsV1"] } });
    if (leaf === "freshness") return route.fulfill({ json: { stateRevision: ownerReceipt ? 2 : 1 } });
    if (request.method() === "POST" && leaf === "photo-assets") {
      const multipart = await new Request(request.url(), { method: "POST", headers: request.headers(), body: request.postDataBuffer() }).formData();
      const id = multipart.get("operationId"), change = record.action.body.changes.find(change => change.assetId === id);
      expect(change).toBeTruthy(); expect(multipart.get("expectedActorId")).toBe("actor-a");
      const sent = await page.evaluate(id => batchSentFiles[id], id), index = record.action.body.changes.indexOf(change) + 1;
      expect(sent.fileText).toBe(`full ${index}`); expect(sent.thumbText).toBe(`thumb ${index}`);
      const receipt = { ok: true, operation: { id, state: "committed", environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a",
        entityType: change.entityType, entityId: change.entityId, photoId: change.photoId, payloadDigest: "a".repeat(64) },
        asset: { id, state: "ready", publication: "not-published", fileHash: sent.fileHash, thumbHash: sent.thumbHash, storedFileHash: sent.fileHash, storedThumbHash: sent.thumbHash } };
      posts.push(id); stages.set(id, receipt); return route.abort("failed");
    }
    if (request.method() === "POST" && leaf === "list-operations") {
      const body = request.postDataJSON(); expect(stages.size).toBe(2); expect(body.body).toEqual(record.action.body);
      const payload = structuredClone(record.photoState.payload), outcomes = [];
      for (const [index, change] of body.body.changes.entries()) {
        const photo = { ...payload.items.item.photos[index], status: "synced", url: `https://example.test/${change.photoId}`, thumbUrl: `https://example.test/thumb/${change.photoId}` };
        payload.items.item.photos[index] = photo;
        const photoIds = [...change.expectedPhotoIds]; photoIds.splice(change.index, 0, change.photoId);
        outcomes.push({ index, action: "attach", entityType: "item", entityId: "item", photoId: change.photoId, assetId: change.assetId, photoIds, photo });
      }
      const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: "list-a", body: body.body };
      ownerReceipt = { ok: true, operation: { ...binding, id: body.operationId, state: "committed",
        payloadDigest: createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex") },
        result: { status: 200, payload: { ok: true, stateRevision: 2, list: { id: "list-a", stateRevision: 2, payload }, photoChanges: outcomes } } };
      posts.push(body.operationId); return route.abort("failed");
    }
    if (url.pathname.includes("/photo-assets/")) {
      const last = leaf === record.action.body.changes[1].assetId;
      return route.fulfill({ json: phase === "files" && last ? { ok: true, operation: { state: "unknown" } } : stages.get(leaf) });
    }
    if (url.pathname.includes("/list-operations/")) return route.fulfill({ json: phase === "done" && ownerReceipt || { ok: true, operation: { state: "unknown" } } });
    return route.abort();
  });
  expect(await page.evaluate(() => drainBatch())).toMatchObject({ blocked: true });
  expect(posts).toEqual(record.action.body.changes.map(change => change.assetId));
  expect(ownerReceipt).toBeUndefined(); phase = "owner";
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  expect(await page.evaluate(() => drainBatch())).toMatchObject({ blocked: true });
  expect(posts).toHaveLength(3); expect(posts[2]).toBe(record.action.operationId); phase = "done";
  await page.reload(); await page.waitForFunction(() => window.batchReady);
  expect(await page.evaluate(() => drainBatch())).toBe("confirmed");
  expect(posts).toHaveLength(3);
  const result = await page.evaluate(async id => ({ action: batchRuntime().outbox.recover().action,
    files: await Promise.all((await batchStore().read(id)).files.map(part => part.file.text())),
    claims: (await batchStore().recoveryRecords())[0].claims.length }), record.action.operationId);
  expect(result).toEqual({ action: record.action, files: ["full 1", "full 2"], claims: 2 });
});
