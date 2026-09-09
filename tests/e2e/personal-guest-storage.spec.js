import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { guestSelectionFixture } from "../critical/personal-guest-import-fixture.js";

const origin = "https://experiment.vniipo-help.ru";
async function fixture(page, context) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && /^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    if (url.origin === origin && url.pathname === "/__guest-storage") return route.fulfill({ contentType: "text/html", body: `<script type="module">
      import {createPersonalGuestImportSelectionStore} from '/src/sync/personal-guest-import-selection-store.js';
      import {preparePersonalGuestImportSelection} from '/src/sync/personal-guest-import-selection.js';
      import {preparePersonalGuestImport} from '/src/sync/personal-guest-import.js';
      import {createPersonalSaveOutbox} from '/src/sync/personal-save-outbox.js';
      import {createPersonalPhotoActionStore} from '/src/sync/personal-photo-action-store.js';
      import {personalArchiveHash} from '/src/sync/personal-archive-import-protocol.js';
      import {personalGuestSelectionBody} from '/src/sync/personal-guest-import-completion.js';
      import {inspectPersonalPhotoRecovery} from '/src/sync/personal-photo-recovery-inventory.js';
      window.guestInput=()=>(${JSON.stringify(guestSelectionFixture())});
      window.guestContext={...guestInput().binding,scope:'personal',generation:'guest-test'};
      window.guestSelection=()=>preparePersonalGuestImportSelection(guestInput(),{enabled:true});
      window.guestStore=(options={})=>createPersonalGuestImportSelectionStore({binding:guestInput().binding,getContext:()=>guestContext,enabled:true,...options});
      window.guestOutbox=(enabled=true)=>createPersonalSaveOutbox({...guestInput().binding,storage:localStorage,photoEnabled:enabled,photoBatchEnabled:enabled,guestImportEnabled:enabled});
      window.guestFiles=(enabled=true)=>createPersonalPhotoActionStore({...guestInput().binding,getContext:()=>guestContext,enabled,batchEnabled:enabled,guestEnabled:enabled});
      window.guestCommit=async()=>{
        const selection=guestSelection(), outbox=guestOutbox(), source=guestInput().basePayload;
        outbox.adoptRemoteBaseline({snapshot:source,payload:source,stateRevision:7});
        return (await preparePersonalGuestImport({enabled:true,selection,selectionStore:guestStore(),outbox,store:guestFiles(),getContext:()=>guestContext,
          getHandoff:()=>guestInput().handoff,getState:()=>source,getRevision:()=>7,makeSnapshot:value=>value,onCaptured:()=>{},
          loadFile:async()=>({file:new Blob(['guest original'],{type:'image/png'}),thumb:null,fileName:'guest.png'})}))();
      };
      window.guestProof=async(action)=>({historicalOnly:true,operation:{id:action.operationId,environment:guestContext.environment,actorId:guestContext.actorId,
        listId:guestContext.listId,kind:'list.import',state:'committed',payloadDigest:await personalArchiveHash({environment:guestContext.environment,
          actorId:guestContext.actorId,kind:'list.import',listId:guestContext.listId,body:action.body})},resultStatus:200,stateRevision:8});
      window.guestBody=personalGuestSelectionBody;
      window.guestInspect=()=>inspectPersonalPhotoRecovery({outbox:guestOutbox(false),store:guestFiles(false),getContext:()=>guestContext});
      window.guestReady=true;
    </script>` });
    return route.abort();
  });
  await page.goto(`${origin}/__guest-storage`); await page.waitForFunction(() => window.guestReady);
}

test("guest selection commits with strict durability and reload recovers the original operation while writers are disabled", async ({ page, context }) => {
  await fixture(page, context);
  const captured = await page.evaluate(async () => {
    const native = IDBDatabase.prototype.transaction; let strict = false, completed = false;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = native.apply(this, args);
      if (args[1] === "readwrite") { strict ||= args[2]?.durability === "strict"; tx.addEventListener("complete", () => { completed = true; }); }
      return tx;
    };
    try {
      const selected = guestSelection(), expected = structuredClone(selected), pending = guestStore().capture(selected);
      selected.candidate.sourceState.items.item.name = "After capture"; selected.layoutTargets.reverse();
      const result = await pending;
      return { result, expected, strict, completed };
    } finally { IDBDatabase.prototype.transaction = native; }
  });
  expect(captured.strict).toBe(true); expect(captured.completed).toBe(true);
  expect(captured.result).toEqual({ selection: captured.expected, reused: false });
  await page.reload(); await page.waitForFunction(() => window.guestReady);
  const recovered = await page.evaluate(async () => {
    const store = guestStore({ enabled: false });
    let blocked = false; try { await store.capture(guestSelection()); } catch { blocked = true; }
    return { selected: await store.read(guestInput().handoff), all: await store.list(), blocked };
  });
  expect(recovered.selected).toEqual(captured.expected); expect(recovered.all).toEqual([captured.expected]); expect(recovered.blocked).toBe(true);
});

test("two guest tabs choose one immutable operation and changed local bases cannot replace the winner", async ({ page, context }) => {
  await fixture(page, context); const second = await context.newPage();
  await second.goto(`${origin}/__guest-storage`); await second.waitForFunction(() => window.guestReady);
  const results = await Promise.all([page, second].map(tab => tab.evaluate(async () => {
    const selected = guestSelection(); const proposed = selected.operationId;
    const result = await guestStore().capture(selected); return { proposed, ...result };
  })));
  expect(results[0].selection).toEqual(results[1].selection); expect(results[0].proposed).not.toBe(results[1].proposed);
  expect(results.filter(result => result.reused)).toHaveLength(1);
  const preserved = await second.evaluate(async () => {
    const selected = guestSelection(); selected.basePayload.items.late = { id: "late", name: "New server state" }; selected.baseStateRevision++;
    return guestStore().capture(selected);
  });
  expect(preserved.selection).toEqual(results[0].selection); expect(preserved.reused).toBe(true);
  await second.close();
});

test("guest selection rejects a different choice and account change without replacing the saved source", async ({ page, context }) => {
  await fixture(page, context);
  const result = await page.evaluate(async () => {
    const original = await guestStore().capture(guestSelection()), changed = guestSelection(); changed.layoutTargets[0].name = "Different choice";
    let different = "", account = "";
    try { await guestStore().capture(changed); } catch (error) { different = error.code; }
    const native = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (...args) => { const value = await native(...args); guestContext.actorId = "other"; return value; };
    try { await guestStore().read(guestInput().handoff); } catch (error) { account = error.code; }
    finally { crypto.subtle.digest = native; guestContext.actorId = "actor"; }
    return { original, different, account, saved: await guestStore().read(guestInput().handoff) };
  });
  expect(result.different).toBe("guest-selection-different-choice"); expect(result.account).toBe("guest-selection-context");
  expect(result.saved).toEqual(result.original.selection);
});

test("guest selection transaction failure leaves no half-record and a corrupt winner is retained without replacement", async ({ page, context }) => {
  await fixture(page, context);
  const result = await page.evaluate(async () => {
    const native = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function () { throw new DOMException("Simulated quota", "QuotaExceededError"); };
    let quota = false;
    try { await guestStore().capture(guestSelection()); } catch { quota = true; }
    finally { IDBObjectStore.prototype.add = native; }
    const afterQuota = await guestStore().list(), original = await guestStore().capture(guestSelection());
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("bike-packing-personal-guest-selections-v1", 1);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction("selections", "readwrite"), store = tx.objectStore("selections"), rows = store.getAll();
        rows.onsuccess = () => { const row = rows.result[0]; row.selectionJson = "{damaged original"; store.put(row); };
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
      };
      request.onerror = () => reject(request.error);
    });
    let read = "", capture = "";
    try { await guestStore().read(guestInput().handoff); } catch (error) { read = error.code; }
    try { await guestStore().capture(guestSelection()); } catch (error) { capture = error.code; }
    return { quota, afterQuota, read, capture, operationId: original.selection.operationId };
  });
  expect(result).toMatchObject({ quota: true, afterQuota: [], read: "guest-selection-corrupt", capture: "guest-selection-corrupt" });
});

test("native guest action survives reload and durable completion can be reconstructed with all writers disabled", async ({ page, context }) => {
  await fixture(page, context);
  const captured = await page.evaluate(async () => {
    const saved = await guestCommit(), entries = await guestStore().entries();
    return { saved, entries, inventory: await guestInspect() };
  });
  expect(captured.inventory.entries[0].state).toBe("linked"); expect(captured.entries[0].intent.files).toHaveLength(1);
  await page.reload(); await page.waitForFunction(() => window.guestReady);
  const confirmed = await page.evaluate(async () => {
    const action = guestOutbox(false).recover().action, store = guestStore({ enabled: false }), entry = (await store.entries())[0];
    const completion = await store.confirm({ selection: entry.selection, action, proof: await guestProof(action) });
    return { completion, action, body: await guestBody(entry.selection, completion), original: await (await guestFiles(false).read(action.operationId)).files[0].file.text() };
  });
  expect(confirmed.action).toEqual(captured.saved.action); expect(confirmed.body).toEqual(captured.saved.action.body); expect(confirmed.original).toBe("guest original");
  await page.reload(); await page.waitForFunction(() => window.guestReady);
  const retained = await page.evaluate(async () => (await guestStore({ enabled: false }).entries())[0]);
  expect(retained.completion).toEqual(confirmed.completion); expect(retained.selection).toEqual(captured.entries[0].selection);
});

test("guest completion quota and corrupted intent retain native source without a false completed marker", async ({ page, context }) => {
  await fixture(page, context);
  const result = await page.evaluate(async () => {
    const saved = await guestCommit(), store = guestStore(), entry = (await store.entries())[0], proof = await guestProof(saved.action);
    const native = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (row) { if (row.completion) throw new DOMException('completion quota','QuotaExceededError'); return native.call(this,row); };
    let quota = false;
    try { await store.confirm({ selection: entry.selection, action: saved.action, proof }); } catch { quota = true; }
    finally { IDBObjectStore.prototype.put = native; }
    const pending = (await store.entries())[0];
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('bike-packing-personal-guest-selections-v1',1);
      request.onsuccess = () => {
        const db=request.result,tx=db.transaction('selections','readwrite'), rows=tx.objectStore('selections').getAll();
        rows.onsuccess = () => { const row=rows.result[0];row.intent.files[0].file.hash='b'.repeat(64);tx.objectStore('selections').put(row); };
        tx.oncomplete = () => { db.close();resolve(); }; tx.onabort = () => {db.close();reject(tx.error);};
      }; request.onerror = () => reject(request.error);
    });
    let corrupt = false; try { await store.entries(); } catch { corrupt = true; }
    return { quota, completion: pending.completion, corrupt, original: await (await guestFiles(false).read(saved.action.operationId)).files[0].file.text() };
  });
  expect(result).toEqual({ quota: true, completion: null, corrupt: true, original: "guest original" });
});
