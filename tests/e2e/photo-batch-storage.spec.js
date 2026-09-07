import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
