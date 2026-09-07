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
        window.photoContext={environment:'bike-packing-experiment',actorId:'actor-a',listId:'list-a',scopeKey:'id:actor-a',scope:'personal',generation:'edit-1'};
        window.photoActions=(extra={})=>createPersonalPhotoActionStore({...window.photoContext,environmentId:window.photoContext.environment,
          enabled:true,getContext:()=>({...window.photoContext}),...extra});
        window.photoInput=()=>{const stage={operationId:crypto.randomUUID(),photoId:'new-photo',entityId:'item-a',entityType:'item',fileName:'selected.png'};
          return {stage,action:{operationId:crypto.randomUUID(),kind:'photos.mutate',listId:'list-a',body:{version:1,action:'attach',entityType:'item',entityId:'item-a',
            assetId:stage.operationId,photoId:stage.photoId,baseStateRevision:1,baseEntityRevision:1,expectedPhotoIds:[],index:0}},
            snapshot:{items:{'item-a':{id:'item-a',name:'Frozen owner',photos:[{id:'new-photo',status:'pending'}]}},containers:{},layouts:{}},
            file:new Blob(['full photo bytes'],{type:'image/png'}),thumb:new Blob(['thumbnail bytes'],{type:'image/png'})};};
        window.photos=photos;
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
    const open = indexedDB.open("bike-packing-personal-photo-actions-v1", 1);
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
