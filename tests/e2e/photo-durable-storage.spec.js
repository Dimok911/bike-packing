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
    if (url.origin === origin && url.pathname === "/__photo-storage-test") return route.fulfill({ contentType: "text/html", body:
      `<script type="module">
        import * as photos from '/src/sync/photos.js';
        import {createPersonalPhotoActionStore} from '/src/sync/personal-photo-action-store.js';
        import {createPersonalSaveOutbox} from '/src/sync/personal-save-outbox.js';
        import {inspectPersonalPhotoRecovery} from '/src/sync/personal-photo-recovery-inventory.js';
        import {createPersonalPhotoRecoveryArchive} from '/src/sync/personal-photo-recovery-archive.js';
        import {readZipEntries,zipText} from '/src/utils/simple-zip.js';
        import {createPersonalPhotoStaging} from '/src/sync/personal-photo-staging.js';
        import {createExperimentTransport} from '/src/sync/experiment-transport.js';
        window.photoContext={environment:'bike-packing-experiment',actorId:'actor-a',listId:'list-a',scopeKey:'id:actor-a',scope:'personal',generation:'edit-1'};
        window.photoActions=(extra={})=>createPersonalPhotoActionStore({...window.photoContext,environmentId:window.photoContext.environment,
          enabled:true,getContext:()=>({...window.photoContext}),...extra});
        window.photoInput=()=>{const stage={operationId:crypto.randomUUID(),photoId:'new-photo',entityId:'item-a',entityType:'item',fileName:'selected.png'};
          return {stage,action:{operationId:crypto.randomUUID(),kind:'photos.mutate',listId:'list-a',body:{version:1,action:'attach',entityType:'item',entityId:'item-a',
            assetId:stage.operationId,photoId:stage.photoId,baseStateRevision:1,baseEntityRevision:1,expectedPhotoIds:[],index:0}},
            snapshot:{items:{'item-a':{id:'item-a',name:'Frozen owner',photos:[{id:'new-photo',status:'pending'}]}},containers:{},layouts:{}},
            file:new Blob(['full photo bytes'],{type:'image/png'}),thumb:new Blob(['thumbnail bytes'],{type:'image/png'})};};
        window.photos=photos;
        window.photoRecoveryArchive=createPersonalPhotoRecoveryArchive;window.readPhotoZip=readZipEntries;window.photoZipText=zipText;
        window.photoOutbox=(extra={})=>createPersonalSaveOutbox({...window.photoContext,storage:localStorage,photoEnabled:true,...extra});
        window.inspectPhotoRecovery=()=>inspectPersonalPhotoRecovery({outbox:window.photoOutbox(),store:window.photoActions(),getContext:()=>window.photoContext});
        window.photoStaging=(extra={})=>createPersonalPhotoStaging({store:window.photoActions(),transport:createExperimentTransport({selection:'direct'}),
          enabled:true,cancellationEnabled:true,getContext:()=>window.photoContext,...extra});
        window.preparePhotoBridge=()=>{
          const input=window.photoInput(),outbox=window.photoOutbox(),base=structuredClone(input.snapshot);
          base.items['item-a'].photos=[];outbox.adoptRemoteBaseline({snapshot:base,payload:base,stateRevision:1});
          Object.assign(input.snapshot.items['item-a'].photos[0],{photoId:input.stage.photoId,assetId:input.stage.operationId});
          const plan=outbox.preparePhoto({body:input.action.body,payload:input.snapshot,snapshot:input.snapshot,operationId:input.action.operationId});
          input.action=plan.action;input.snapshot=plan.snapshot;return {outbox,input,plan,base};
        };
      </script>` });
    return route.abort();
  });
  await page.goto(`${origin}/__photo-storage-test`); await page.waitForFunction(() => window.photos);
}

test("local cache success means IndexedDB transaction complete and survives reload with exact binary data", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    let complete = false;
    const native = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = native.apply(this, args); tx.addEventListener("complete", () => { complete = true; }); return tx;
    };
    try {
      await window.photos.putCachedPhoto({ id: "durable", bytes: new TextEncoder().encode("exact photo bytes").buffer }, "id:actor-a");
      return complete;
    } finally { IDBDatabase.prototype.transaction = native; }
  });
  expect(outcome).toBe(true);
  await page.reload(); await page.waitForFunction(() => window.photos);
  expect(await page.evaluate(async () => new TextDecoder().decode((await window.photos.getCachedPhoto("durable", "id:actor-a")).bytes))).toBe("exact photo bytes");
  expect(await page.evaluate(() => window.photos.getCachedPhoto("durable", "id:actor-b"))).toBeNull();
});

test("abort after the photo put request succeeds must reject without reporting durable storage", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    const native = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = native.apply(this, args), tx = this.transaction;
      request.addEventListener("success", () => tx.abort()); return request;
    };
    try {
      await window.photos.putCachedPhoto({ id: "aborted", bytes: new TextEncoder().encode("not committed").buffer }, "id:actor-a"); return "reported-success";
    } catch { return "rejected"; } finally { IDBObjectStore.prototype.put = native; }
  });
  expect(outcome).toBe("rejected");
  expect(await page.evaluate(() => window.photos.getCachedPhoto("aborted", "id:actor-a"))).toBeNull();
});

test("a local photo callback failure aborts its queued writes and the next transaction still works", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    let rejected = false;
    try { await window.photos.photoDbStore("readwrite", store => {
      store.put({ id: "callback-failure", bytes: new TextEncoder().encode("must not commit").buffer }); throw Error("fixture callback failure");
    }); } catch { rejected = true; }
    const persisted = await window.photos.photoDbStore("readonly", store => store.get("callback-failure"));
    await window.photos.putCachedPhoto({ id: "next", bytes: new TextEncoder().encode("next").buffer }, "id:actor-a");
    return { rejected, persisted: Boolean(persisted), next: (await window.photos.getCachedPhoto("next", "id:actor-a")).id };
  });
  expect(outcome).toEqual({ rejected: true, persisted: false, next: "next" });
});

test("explicit rejected-photo decision reloads as a new CAS action while its original native file and photo action remain retained", async ({ page, context }) => {
  await fixture(page, context);
  const ids = await page.evaluate(async () => {
    const { outbox, input, plan, base } = window.preparePhotoBridge(), store = window.photoActions();
    await store.capture(input); await outbox.capturePhoto({ plan, store, getContext: () => window.photoContext });
    const queue = { inspect: async request => ({ historicalOnly: true, operation: { id: request.operationId,
      environment: window.photoContext.environment, actorId: window.photoContext.actorId, listId: window.photoContext.listId,
      kind: "photos.mutate", state: "rejected", payloadDigest: "a".repeat(64) }, resultStatus: 409, rejectionCode: "photo_asset_not_ready", stateRevision: 1 }) };
    const result = await outbox.reconcile({ queue, getContext: () => window.photoContext,
      readRemote: async () => ({ id: window.photoContext.listId, ownerId: window.photoContext.actorId, stateRevision: 1, payload: base }),
      resolveRejectedPhoto: async () => "keep-server" });
    return { oldId: plan.action.operationId, newId: result.action.operationId };
  });
  await page.reload(); await page.waitForFunction(() => window.photos);
  const recovered = await page.evaluate(async ({ oldId }) => {
    const outbox = window.photoOutbox({ photoEnabled: false }), record = outbox.recover(), file = await window.photoActions({ enabled: false }).read(oldId);
    return { id: record.action.operationId, kind: record.action.kind, predecessor: record.action.previousLocalOperationId,
      chosen: record.reconciliation.decision.photoOperationId, photos: record.snapshot.items["item-a"].photos,
      full: await file.file.text(), thumb: await file.thumb.text(), sourceRetained: outbox.list().some(value => value.action.operationId === oldId), pending: outbox.hasPending() };
  }, ids);
  expect(recovered).toEqual({ id: ids.newId, kind: "list.update", predecessor: ids.oldId, chosen: ids.oldId,
    photos: [], full: "full photo bytes", thumb: "thumbnail bytes", sourceRetained: true, pending: true });
});

test("native photo bytes keep their exact terminal owner receipt through atomic adoption compaction and browser reload", async ({ page, context }) => {
  await fixture(page, context);
  const initial = await page.evaluate(async () => {
    const { outbox, input, plan, base } = window.preparePhotoBridge(), store = window.photoActions();
    await store.capture(input); await outbox.capturePhoto({ plan, store, getContext: () => window.photoContext });
    const proof = { historicalOnly: true, operation: { id: plan.action.operationId, environment: window.photoContext.environment,
      actorId: window.photoContext.actorId, listId: window.photoContext.listId, kind: "photos.mutate", state: "committed", payloadDigest: "a".repeat(64) },
      resultStatus: 200, stateRevision: 2, rejectionCode: null };
    const adopted = await outbox.reconcile({ queue: { inspect: async () => proof }, getContext: () => window.photoContext,
      readRemote: async () => ({ id: window.photoContext.listId, ownerId: window.photoContext.actorId, stateRevision: 2, payload: base }) });
    outbox.compact();
    const next = structuredClone(adopted.snapshot); next.items["item-a"].name = "Later DB edit";
    const record = outbox.capture({ snapshot: next, body: { baseStateRevision: 2, payload: next } });
    outbox.markApplied({ operationId: record.action.operationId, stateRevision: 3 }); outbox.compact();
    return { id: plan.action.operationId, proof };
  });
  await page.reload(); await page.waitForFunction(() => window.photos);
  const result = await page.evaluate(async id => {
    const outbox = window.photoOutbox({ photoEnabled: false }), file = await window.photoActions({ enabled: false }).read(id);
    return { proofs: outbox.photoRecoveryReferences().photoReceipts, oldSnapshotRetained: outbox.list().some(record => record.action.operationId === id),
      full: await file.file.text(), thumb: await file.thumb.text(), currentName: outbox.recoverSnapshot().items["item-a"].name };
  }, initial.id);
  expect(result).toEqual({ proofs: [initial.proof], oldSnapshotRetained: false, full: "full photo bytes", thumb: "thumbnail bytes", currentName: "Later DB edit" });
});

test("raw photo recovery export retains corrupted intent, original bytes and the exact dispatch claim after reload", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => {
    const input = window.photoInput(), store = window.photoActions(); await store.capture(input); await store.claimStage(input.action.operationId);
    return input.action.operationId;
  });
  await page.reload(); await page.waitForFunction(() => window.photos);
  const result = await page.evaluate(async operationId => {
    const open = indexedDB.open("bike-packing-personal-photo-actions-v1", 2);
    const db = await new Promise((resolve, reject) => { open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error); });
    const store = window.photoActions({ enabled: false }), original = (await store.recoveryRecords())[0];
    await new Promise((resolve, reject) => {
      const tx = db.transaction("actions", "readwrite"); tx.objectStore("actions").put({ ...original.record, intentJson: "{corrupt preserved" });
      tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
    }); db.close();
    let decodingBlocked = false; try { await store.read(operationId); } catch { decodingBlocked = true; }
    const copy = { environment: store.binding.environment, scopeKey: store.binding.scopeKey, automaticImportAllowed: false };
    const archive = await window.photoRecoveryArchive({ store, getContext: () => window.photoContext, getRecoveryCopy: () => copy });
    const entries = await window.readPhotoZip(archive.blob), prefix = `photos/${operationId}`;
    const raw = JSON.parse(window.photoZipText(entries.get(`${prefix}/record.json`)));
    return { decodingBlocked, full: window.photoZipText(entries.get(`${prefix}/original.bin`)), thumb: window.photoZipText(entries.get(`${prefix}/thumbnail.bin`)),
      rawIntent: raw.intentJson, claimId: raw.dispatchClaim.actionOperationId, stageId: raw.dispatchClaim.stageOperationId,
      originalStageId: original.claim.stageOperationId, ids: await store.ids(), confirmed: archive.manifest.serverConfirmationIncluded };
  }, id);
  expect(result).toEqual({ decodingBlocked: true, full: "full photo bytes", thumb: "thumbnail bytes", rawIntent: "{corrupt preserved", claimId: id,
    stageId: result.originalStageId, originalStageId: result.originalStageId, ids: [id], confirmed: false });
});

test("photo recovery raw reader rejects changed context during its transaction and never returns another actor's files", async ({ page, context }) => {
  await fixture(page, context);
  const result = await page.evaluate(async () => {
    const store = window.photoActions(); await store.capture(window.photoInput());
    const foreign = window.photoActions({ actorId: "actor-b", scopeKey: "id:actor-b", getContext: () => ({ ...window.photoContext, actorId: "actor-b", scopeKey: "id:actor-b" }) });
    const foreignRows = await foreign.recoveryRecords();
    const original = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) { const request = original.apply(this, args); request.addEventListener("success", () => window.photoContext.generation = "changed"); return request; };
    let code; try { await store.recoveryRecords(); } catch (error) { code = error.code; } finally { IDBIndex.prototype.getAll = original; }
    return { foreignCount: foreignRows.length, code, retained: (await store.ids()).length };
  });
  expect(result).toEqual({ foreignCount: 0, code: "context-changed", retained: 1 });
});

test("opt-in prepared form cache preserves native binary full/thumb bytes through reload on both browsers", async ({ page, context }) => {
  await fixture(page, context);
  await page.evaluate(() => window.photos.putCachedPhoto({ id: "prepared-binary", fileName: "Фото.png", fullBlobVerified: true,
    blob: new Blob([new Uint8Array([0, 255, 128, 1])], { type: "image/png" }),
    thumbBlob: new Blob(["prepared thumbnail"], { type: "image/webp" }) }, "id:actor-a", { binary: true }));
  await page.reload(); await page.waitForFunction(() => window.photos);
  expect(await page.evaluate(async () => {
    const value = await window.photos.getCachedPhoto("prepared-binary", "id:actor-a");
    return { id: value.id, name: value.fileName, full: [...new Uint8Array(await value.blob.arrayBuffer())],
      type: value.blob.type, thumb: await value.thumbBlob.text(), thumbType: value.thumbBlob.type, verified: value.fullBlobVerified,
      foreign: await window.photos.getCachedPhoto("prepared-binary", "id:other") };
  })).toEqual({ id: "prepared-binary", name: "Фото.png", full: [0, 255, 128, 1], type: "image/png",
    thumb: "prepared thumbnail", thumbType: "image/webp", verified: true, foreign: null });
});

test("photo cache preserves actual Blob bytes and MIME through browser reload", async ({ page, context, browserName }) => {
  // Playwright's Windows WebKit fails native IndexedDB Blob preparation before
  // commit. This is NOT evidence about real iOS Safari; do not claim that test.
  test.skip(browserName === "webkit", "Windows WebKit native Blob persistence is unavailable; real Safari coverage remains open");
  await fixture(page, context);
  await page.evaluate(() => window.photos.putCachedPhoto({ id: "actual-blob", blob: new Blob(["image bytes"], { type: "image/png" }) }, "id:actor-a"));
  await page.reload(); await page.waitForFunction(() => window.photos);
  expect(await page.evaluate(async () => {
    const { blob } = await window.photos.getCachedPhoto("actual-blob", "id:actor-a"); return { text: await blob.text(), type: blob.type };
  })).toEqual({ text: "image bytes", type: "image/png" });
});

test("photo action owns frozen full and thumbnail bytes with its intent and snapshot in one durable record", async ({ page, context }) => {
  await fixture(page, context);
  const captured = await page.evaluate(async () => {
    const input = window.photoInput(), originalId = input.action.operationId, originalStage = input.stage.operationId;
    const pending = window.photoActions().capture(input);
    input.action.operationId = crypto.randomUUID(); input.action.body.photoId = "later-photo";
    input.stage.operationId = crypto.randomUUID(); input.snapshot.items["item-a"].name = "Later edit";
    const record = await pending;
    return { originalId, originalStage, id: record.action.operationId, stage: record.stage.operationId,
      name: record.snapshot.items["item-a"].name, full: await record.file.text(), thumb: await record.thumb.text(), ids: await window.photoActions().ids() };
  });
  expect(captured.id).toBe(captured.originalId); expect(captured.stage).toBe(captured.originalStage);
  expect(captured).toMatchObject({ name: "Frozen owner", full: "full photo bytes", thumb: "thumbnail bytes", ids: [captured.id] });
  await page.reload(); await page.waitForFunction(() => window.photoActions);
  expect(await page.evaluate(async operationId => {
    const record = await window.photoActions().read(operationId);
    return { id: record.action.operationId, photo: record.action.body.photoId, type: record.file.type, full: await record.file.text(), thumb: await record.thumb.text() };
  }, captured.id)).toEqual({ id: captured.id, photo: "new-photo", type: "image/png", full: "full photo bytes", thumb: "thumbnail bytes" });
  expect(await page.evaluate(id => window.photoActions({ actorId: "actor-b", scopeKey: "id:actor-b" }).read(id), captured.id)).toBeNull();
});

test("two tabs capture the same photo action once and cannot reuse its number for different bytes", async ({ page, context }) => {
  await fixture(page, context); const second = await context.newPage(); await fixture(second, context);
  const json = await page.evaluate(() => { const input = window.photoInput(); delete input.file; delete input.thumb; return JSON.stringify(input); });
  const capture = target => target.evaluate(async value => {
    const input = JSON.parse(value); input.file = new Blob(["full photo bytes"], { type: "image/png" }); input.thumb = new Blob(["thumbnail bytes"], { type: "image/png" });
    const saved = await window.photoActions().capture(input); return saved.action.operationId;
  }, json);
  const results = await Promise.all([capture(page), capture(second)]); expect(results[0]).toBe(results[1]);
  expect(await page.evaluate(() => window.photoActions().ids())).toEqual([results[0]]);
  expect(await second.evaluate(async value => {
    const input = JSON.parse(value); input.file = new Blob(["DIFFERENT bytes"], { type: "image/png" }); input.thumb = new Blob(["thumbnail bytes"], { type: "image/png" });
    try { await window.photoActions().capture(input); return "unexpected-success"; } catch (error) { return error.code; }
  }, json)).toBe("operation-id-reused");
  expect(await page.evaluate(async id => (await window.photoActions().read(id)).file.text(), results[0])).toBe("full photo bytes");
});

test("aborted photo action and changed context retain a complete recovery draft but no partial durable record", async ({ page, context }) => {
  await fixture(page, context);
  expect(await page.evaluate(async () => {
    const native = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      const request = native.apply(this, args), tx = this.transaction; request.addEventListener("success", () => tx.abort()); return request;
    };
    let recovery;
    try { await window.photoActions().capture(window.photoInput()); }
    catch (error) { recovery = { blocked: error.isPersonalPhotoStorageBlocked, name: error.unconfirmedPhotoDraft.snapshot.items["item-a"].name,
      file: await error.unconfirmedPhotoDraft.file.text(), thumb: await error.unconfirmedPhotoDraft.thumb.text() }; }
    finally { IDBObjectStore.prototype.add = native; }
    return { ...recovery, ids: await window.photoActions().ids() };
  })).toEqual({ blocked: true, name: "Frozen owner", file: "full photo bytes", thumb: "thumbnail bytes", ids: [] });
  expect(await page.evaluate(async () => {
    const pending = window.photoActions().capture(window.photoInput()); window.photoContext.generation = "edit-2";
    try { await pending; return "unexpected-success"; } catch (error) { return error.code; }
  })).toBe("context-changed");
  expect(await page.evaluate(() => window.photoActions().ids())).toEqual([]);
});

test("photo journal verifies stored bytes and intent without erasing damaged or release-gated records", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => (await window.photoActions().capture(window.photoInput())).action.operationId);
  expect(await page.evaluate(async id => {
    const recovered = await window.photoActions({ enabled: false }).read(id);
    try { await window.photoActions({ enabled: false }).capture(window.photoInput()); }
    catch (error) { return { code: error.code, recovered: recovered.action.operationId }; }
  }, id)).toEqual({ code: "disabled", recovered: id });
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("bike-packing-personal-photo-actions-v1", 2);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("actions", "readwrite"), store = tx.objectStore("actions"), request = store.openCursor();
      request.onsuccess = () => { const cursor = request.result; if (cursor) { const record = cursor.value;
        if (!(record.file instanceof ArrayBuffer) || !(record.thumb instanceof ArrayBuffer)) throw Error("not portable binary storage");
        record.file = new TextEncoder().encode("corrupted bytes").buffer; cursor.update(record); } };
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
    }; open.onerror = () => reject(open.error);
  }));
  expect(await page.evaluate(async id => {
    try { await window.photoActions().read(id); return "unexpected-success"; } catch (error) { return error.code; }
  }, id)).toBe("missing-or-corrupt-bytes");
  expect(await page.evaluate(() => window.photoActions().ids())).toEqual([id]);
});

test("durable stage claim survives reload and only one of two tabs receives first-dispatch authority", async ({ page, context }) => {
  await fixture(page, context); const id = await page.evaluate(async () => (await window.photoActions().capture(window.photoInput())).action.operationId);
  const second = await context.newPage(); await fixture(second, context);
  const claims = await Promise.all([page.evaluate(id => window.photoActions().claimStage(id), id), second.evaluate(id => window.photoActions().claimStage(id), id)]);
  expect(claims.filter(claim => claim.fresh)).toHaveLength(1);
  expect(claims[0].stageOperationId).toBe(claims[1].stageOperationId); expect(claims[0].intentHash).toBe(claims[1].intentHash);
  await page.evaluate(() => localStorage.clear());
  await page.reload(); await page.waitForFunction(() => window.photoActions);
  expect((await page.evaluate(id => window.photoActions().claimStage(id), id)).fresh).toBe(false);
  expect(await page.evaluate(async id => (await window.photoActions().read(id)).file.text(), id)).toBe("full photo bytes");
});

test("additive photo journal upgrade preserves version-one action and exact bytes before adding its dispatch claim", async ({ page, context }) => {
  await fixture(page, context);
  const original = await page.evaluate(async () => {
    const input = window.photoInput(), binding = window.photoActions().binding, bindingKey = JSON.stringify(binding);
    const full = await input.file.arrayBuffer(), thumb = await input.thumb.arrayBuffer();
    const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(value => value.toString(16).padStart(2, "0")).join("");
    const intentJson = JSON.stringify({ binding, action: input.action, stage: input.stage, snapshot: input.snapshot,
      file: { size: full.byteLength, type: input.file.type, hash: await hash(full) }, thumb: { size: thumb.byteLength, type: input.thumb.type, hash: await hash(thumb) } });
    const record = { version: 1, key: JSON.stringify([bindingKey, input.action.operationId]), bindingKey, intentJson,
      intentHash: await hash(new TextEncoder().encode(intentJson)), file: full, thumb };
    await new Promise((resolve, reject) => {
      const open = indexedDB.open("bike-packing-personal-photo-actions-v1", 1);
      open.onupgradeneeded = () => { const store = open.result.createObjectStore("actions", { keyPath: "key" }); store.createIndex("binding", "bindingKey"); };
      open.onsuccess = () => { const db = open.result, tx = db.transaction("actions", "readwrite"); tx.objectStore("actions").add(record);
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); }; };
      open.onerror = () => reject(open.error);
    });
    return { id: input.action.operationId, intentHash: record.intentHash };
  });
  expect(await page.evaluate(async id => {
    const record = await window.photoActions().read(id), claim = await window.photoActions().claimStage(id);
    return { hash: record.intentHash, full: await record.file.text(), thumb: await record.thumb.text(), fresh: claim.fresh };
  }, original.id)).toEqual({ hash: original.intentHash, full: "full photo bytes", thumb: "thumbnail bytes", fresh: true });
});

test("native file transaction and personal outbox share one exact photo action after reload and block an overtaking DB save", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => {
    const { outbox, input, plan } = window.preparePhotoBridge(), store = window.photoActions();
    await store.capture(input);
    const record = await outbox.capturePhoto({ plan, store, getContext: () => window.photoContext });
    return record.action.operationId;
  });
  await page.reload(); await page.waitForFunction(() => window.photoOutbox);
  expect(await page.evaluate(async id => {
    const outbox = window.photoOutbox({ photoEnabled: false }), record = outbox.recover(), file = await window.photoActions().read(id);
    let blocked;
    try { outbox.capture({ snapshot: record.snapshot, body: { baseStateRevision: 1, payload: record.photoState.payload } }); }
    catch (error) { blocked = error.code; }
    return { id: record.action.operationId, hash: record.photoState.fileIntentHash === file.intentHash,
      action: JSON.stringify(record.action) === JSON.stringify(file.action), bytes: await file.file.text(), blocked };
  }, id)).toEqual({ id, hash: true, action: true, bytes: "full photo bytes", blocked: "photo-pending" });
});

test("crash or quota after native file capture retains an unlinked original action and never invents a published queue entry", async ({ page, context }) => {
  await fixture(page, context);
  const retained = await page.evaluate(async () => {
    const { outbox, input, plan } = window.preparePhotoBridge(), store = window.photoActions();
    await store.capture(input);
    const native = Storage.prototype.setItem; let draft;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('bike-packing-personal-save-v1:')) throw new DOMException('quota', 'QuotaExceededError');
      return native.call(this, key, value);
    };
    try { await outbox.capturePhoto({ plan, store, getContext: () => window.photoContext }); }
    catch (error) { draft = error.unconfirmedMemoryDraft; }
    finally { Storage.prototype.setItem = native; }
    return { id: input.action.operationId, draft: draft.items['item-a'].photos[0].id, queued: outbox.recover() };
  });
  expect(retained.queued).toBeNull(); expect(retained.draft).toBe("new-photo");
  await page.reload(); await page.waitForFunction(() => window.photoOutbox);
  expect(await page.evaluate(async id => ({ queued: window.photoOutbox().recover(), ids: await window.photoActions().ids(),
    bytes: await (await window.photoActions().read(id)).file.text() }), retained.id)).toEqual({ queued: null, ids: [retained.id], bytes: "full photo bytes" });
});

test("another real tab between file commit and personal queue registration keeps both the new DB action and old photo draft", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => {
    window.bridge = window.preparePhotoBridge(); await window.photoActions().capture(window.bridge.input); return window.bridge.plan.action.operationId;
  });
  const second = await context.newPage(); await fixture(second, context);
  await second.evaluate(() => window.photoOutbox().capture({ snapshot: { items: {} }, body: { baseStateRevision: 1, payload: { items: {} } } }));
  expect(await page.evaluate(async () => {
    try { await window.bridge.outbox.capturePhoto({ plan: window.bridge.plan, store: window.photoActions(), getContext: () => window.photoContext }); }
    catch (error) { return { code: error.code, photo: error.unconfirmedMemoryDraft.items['item-a'].photos[0].id }; }
  })).toEqual({ code: "stale-tab", photo: "new-photo" });
  expect(await page.evaluate(async id => ({ head: window.photoOutbox().recover().action.kind, bytes: await (await window.photoActions().read(id)).file.text() }), id))
    .toEqual({ head: "list.update", bytes: "full photo bytes" });
});

test("native startup inventory identifies an unlinked file and its later exact outbox binding without posting or deleting anything", async ({ page, context }) => {
  await fixture(page, context);
  const id = await page.evaluate(async () => {
    window.bridge = window.preparePhotoBridge(); await window.photoActions().capture(window.bridge.input); return window.bridge.plan.action.operationId;
  });
  const unlinked = await page.evaluate(() => window.inspectPhotoRecovery());
  expect(unlinked.entries).toMatchObject([{ operationId: id, state: "unlinked", dispatchAllowed: false }]);
  expect(unlinked.automaticDispatchAllowed).toBe(false); expect(unlinked.needsRecovery).toBe(true);
  await page.evaluate(() => window.bridge.outbox.capturePhoto({ plan: window.bridge.plan, store: window.photoActions(), getContext: () => window.photoContext }));
  await page.reload(); await page.waitForFunction(() => window.inspectPhotoRecovery);
  const linked = await page.evaluate(() => window.inspectPhotoRecovery());
  expect(linked.entries).toMatchObject([{ operationId: id, state: "linked", dispatchAllowed: false }]);
  expect(linked.needsRecovery).toBe(false); expect(linked.readOnly).toBe(true);
  expect(await page.evaluate(async id => (await window.photoActions().read(id)).file.text(), id)).toBe("full photo bytes");
});

test("native pre-dispatch claim cancellation survives a lost response and reload without uploading or losing the file", async ({ page, context }) => {
  await fixture(page, context);
  let receipt = null, hidden = true; const posts = [];
  await context.route("**/letters-vniipo/api/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith("/auth/me")) return route.fulfill({ json: { user: { id: "actor-a" } } });
    if (url.pathname.endsWith("/capabilities")) return route.fulfill({ json: { capabilities: ["personalStagedPhotoAssetsV1", "personalStagedPhotoCancellationV1"] } });
    if (request.method() === "POST") {
      posts.push(url.pathname); expect(url.pathname.endsWith("/cancel")).toBe(true);
      const body = request.postDataJSON(), operationId = url.pathname.split("/").at(-2);
      receipt = { ok: true, operation: { id: operationId, state: "cancelled", environment: body.environment, actorId: body.expectedActorId,
        listId: "list-a", entityType: body.entityType, entityId: body.entityId, photoId: body.photoId, payloadDigest: "a".repeat(64) },
        cancellation: { version: 1, stageOperationId: operationId, fileHash: body.fileHash, thumbHash: body.thumbHash, noAssetPublished: true, stageCannotPublish: true } };
      return route.abort("failed");
    }
    const operationId = url.pathname.split("/").at(-1);
    return route.fulfill({ json: !hidden && receipt || { ok: true, operation: { id: operationId, state: "unknown",
      environment: "bike-packing-experiment", actorId: "actor-a", listId: "list-a" } } });
  });
  const id = await page.evaluate(async () => {
    const record = await window.photoActions().capture(window.photoInput()); await window.photoActions().claimStage(record.action.operationId);
    return record.action.operationId;
  });
  await page.reload(); await page.waitForFunction(() => window.photoStaging);
  expect(await page.evaluate(async id => { try { await window.photoStaging().cancel(id); return false; } catch (error) { return error.isAmbiguousMutation; } }, id)).toBe(true);
  expect(posts).toHaveLength(1); hidden = false;
  await page.reload(); await page.waitForFunction(() => window.photoStaging);
  const proof = await page.evaluate(id => window.photoStaging({ enabled: false }).cancel(id), id);
  expect(proof.operation.state).toBe("cancelled"); expect(proof.asset).toBeUndefined(); expect(proof.actionOperationId).toBe(id);
  expect(await page.evaluate(async id => { try { await window.photoStaging().stage(id); return false; } catch (error) { return error.isConfirmedStageCancellation; } }, id)).toBe(true);
  expect((await page.evaluate(id => window.photoStaging({ enabled: false, cancellationEnabled: false }).inspect(id), id)).operation.state).toBe("cancelled");
  expect(await page.evaluate(async id => (await window.photoActions().read(id)).file.text(), id)).toBe("full photo bytes");
  expect(posts).toHaveLength(1);
});
