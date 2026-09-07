import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { canonicalListOperationJson } from "../../src/sync/list-operation-queue.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

const origin = "https://experiment.vniipo-help.ru";
async function fixture(page, context) {
  const state = { posts: [], receipts: new Map(), lose: false, unknown: false, revision: 1, beforeAck: null };
  const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate",
    "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": "enabled" };
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname.startsWith("/src/")) return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    if (url.pathname === "/__list-queue-test") return route.fulfill({ contentType: "text/html", body: `<script type="module">
      import {createExperimentTransport} from '/src/sync/experiment-transport.js';
      import {createListOperationQueue} from '/src/sync/list-operation-queue.js';
      import {createCausalActionJournal} from '/src/sync/causal-action-journal.js';
      import {createPersonalSaveOutbox,recoverPersonalSaveListId} from '/src/sync/personal-save-outbox.js';
      import {ensureCausalPersonalListId} from '/src/sync/causal-personal-list-bootstrap.js';
      import {apiFetchRequest} from '/src/sync/api-client.js';
      window.generation='generation-1'; window.actorId='actor-a';
      const transport=createExperimentTransport({selection:sessionStorage.getItem('list-route')||'direct',euEnabled:true});
      const queue=createListOperationQueue({transport,enabled:true,photoEnabled:true,getContext:()=>({actorId:window.actorId,generation:window.generation,scope:'personal',
        environment:'bike-packing-experiment',listId:'list-a',scopeKey:'id:'+window.actorId})});
      window.runPhoto=async(input,inspect=false)=>{try{return {ok:true,result:await queue[inspect?'inspect':'run'](input)};}
        catch(error){return {ok:false,ambiguous:!!error.isAmbiguousMutation};}};
      window.run=async()=>{try {const result=await apiFetchRequest('/bike-packing/lists/list-a',{method:'PUT',body:JSON.stringify({payload:{items:{}}})},{transport,listQueue:queue});return {ok:true,id:result.list.id};}
        catch(error){return {ok:false,ambiguous:!!error.isAmbiguousMutation};}};
      window.entries=()=>transport.writes;
      const bootstrapBinding={environment:'bike-packing-experiment',actorId:'actor-a',scopeKey:'id:actor-a'};
      window.initialListId=localStorage.getItem('bootstrap-list')||recoverPersonalSaveListId({storage:localStorage,...bootstrapBinding});
      const initialContext=()=>({...bootstrapBinding,listId:window.initialListId,actorId:window.actorId,generation:window.generation,scope:'personal'});
      window.initialConfirmations=0;
      window.bootstrapSave=async()=>{try{
        const id=await ensureCausalPersonalListId({storage:localStorage,getContext:initialContext,getCurrentListId:()=>window.initialListId,
          snapshot:{items:{a:{weight:100}}},body:{payload:{items:{a:{weight:100}}}},fetchLists:async()=>[],
          chooseDefaultList:lists=>lists[0],recordId:record=>record.id,onExisting:()=>{},
          onRegistered:id=>{if(window.crashBeforePointer)throw Error('stopped before pointer');window.initialListId=id;localStorage.setItem('bootstrap-list',id);}});
        const initialOutbox=createPersonalSaveOutbox({storage:localStorage,...bootstrapBinding,listId:id});
        await initialOutbox.drain({queue,getContext:initialContext,onConfirmed:(result,record)=>{
          initialOutbox.markApplied({operationId:record.action.operationId,stateRevision:result.list.stateRevision});window.initialConfirmations++;
        }});return 'confirmed';
      }catch(error){return 'blocked';}};
      window.initialAction=()=>createPersonalSaveOutbox({storage:localStorage,...bootstrapBinding,
        listId:recoverPersonalSaveListId({storage:localStorage,...bootstrapBinding})}).recover();
      const journal=createCausalActionJournal({storage:localStorage,actorId:'actor-a'});
      window.enqueue=input=>journal.enqueue(input); window.actions=()=>journal.list();
      const outbox=createPersonalSaveOutbox({storage:localStorage,actorId:'actor-a',listId:'list-a',scopeKey:'id:actor-a'});
      window.captureSave=weight=>outbox.capture({snapshot:{items:{a:{weight}}},body:{baseStateRevision:1,payload:{items:{a:{weight}}}}});
      window.restoreSave=()=>outbox.recover(); window.saveConfirmations=0;
      window.inspectSaves=async()=>{try{return await outbox.inspect({queue,getContext:()=>({actorId:window.actorId,generation:window.generation,scope:'personal',scopeKey:'id:actor-a',listId:'list-a',environment:'bike-packing-experiment'})});}
        catch(error){return {blocked:true,waiting:!!error.isOperationWaiting};}};
      window.drainSaves=async()=>{try{await outbox.drain({queue,getContext:()=>({actorId:window.actorId,generation:window.generation,scope:'personal',scopeKey:'id:actor-a',listId:'list-a',environment:'bike-packing-experiment'}),onConfirmed:()=>window.saveConfirmations++});return 'confirmed';}
        catch(error){return 'blocked';}};
      window.runWaiting=async()=>{try {await queue.run({path:'/bike-packing/lists/list-a',method:'PUT',body:JSON.stringify({causal:{dependsOn:[{operationId:'11111111-1111-4111-8111-111111111111',listId:'list-a'}]}})}); return 'committed';}
        catch(error){return error.isOperationWaiting?'waiting':'blocked';}};
    </script>` });
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let data;
    if (url.pathname.endsWith("/capabilities")) data = { apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
      capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, "personalListCausalOperationsV1", "personalCausalPhotoPublicationV1"] };
    else if (url.pathname.endsWith("/auth/me")) data = { user: { id: "actor-a" } };
    else if (url.pathname.endsWith("/freshness")) data = { stateRevision: state.revision };
    else if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); state.posts.push({ url: url.toString(), body });
      const binding = { environment: "bike-packing-experiment", actorId: "actor-a", kind: body.kind, listId: body.listId, body: body.body };
      const payloadDigest = createHash("sha256").update(canonicalListOperationJson(binding)).digest("hex");
      data = { ok: true, operation: { id: body.operationId, ...binding, payloadDigest, state: "committed" },
        result: { status: 200, payload: { ok: true, list: { id: body.listId, stateRevision: 1 } } } };
      if (body.kind === "photos.mutate") data.result.payload = structuredClone(state.photoPayload);
      if (state.rejection) { data.operation.state = "rejected"; data.result = state.rejection; }
      if (state.waiting) {
        data.operation.state = "waiting"; data.result = null;
        data.waiting = { code: "dependency_not_committed", retrySameOperation: true, operationIds: body.body.causal.dependsOn.map(dep => dep.operationId) };
      }
      state.receipts.set(body.operationId, data);
      await state.beforeAck?.();
      if (state.lose) return route.abort("failed");
    } else if (url.pathname.includes("/list-operations/")) data = state.unknown
      ? { ok: true, operation: { state: "unknown" } } : state.receipts.get(url.pathname.split("/").at(-1));
    else return route.abort();
    return route.fulfill({ headers, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/__list-queue-test`);
  await page.waitForFunction(() => Boolean(window.run));
  return state;
}

test("cold queue preserves the ID across lost ACK, page reload and direct/EU route change", async ({ page, context }) => {
  const f = await fixture(page, context); f.lose = true; f.unknown = true;
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  const id = f.posts[0].body.operationId;
  await page.evaluate(() => sessionStorage.setItem("list-route", "eu"));
  f.unknown = false;
  await page.reload(); await page.waitForFunction(() => Boolean(window.run));
  expect(await page.evaluate(() => window.run())).toEqual({ ok: true, id: "list-a" });
  expect(f.posts).toHaveLength(1);
  expect(await page.evaluate(() => window.entries()[0].id)).toBe(id);
});

test("photo batch queue survives cold lost ACK and route change, and rejects a partial receipt until all exact outcomes return", async ({ page, context }) => {
  const f = await fixture(page, context), operationId = "12345678-1234-4123-8123-123456789abc";
  const assetId = "22345678-1234-4123-8123-123456789abc", photoId = "browser-photo";
  const photo = { id: photoId, photoId, assetId, listId: "list-a", status: "synced", url: "https://example.test/photo", thumbUrl: "https://example.test/thumb" };
  const body = { version: 1, action: "batch", baseStateRevision: 1, causal: { dependsOn: [], reads: [] }, changes: [{
    version: 1, action: "attach", entityType: "item", entityId: "a", baseEntityRevision: 1, photoId, assetId, expectedPhotoIds: [], index: 0 }] };
  const input = { path: "/bike-packing/lists/list-a/photos/mutate", method: "POST", operationId, body: JSON.stringify(body) };
  f.photoPayload = { ok: true, stateRevision: 1, photoChanges: [{ index: 0, action: "attach", entityType: "item", entityId: "a", photoId, assetId, photoIds: [photoId], photo }],
    list: { id: "list-a", stateRevision: 1, payload: { items: { a: { id: "a", photos: [photo] } } } } };
  f.lose = true; f.unknown = true;
  expect(await page.evaluate(input => window.runPhoto(input), input)).toEqual({ ok: false, ambiguous: true });
  expect(f.posts).toHaveLength(1);
  await page.evaluate(() => sessionStorage.setItem("list-route", "eu"));
  f.unknown = false; f.receipts.get(operationId).result.payload.photoChanges = [];
  await page.reload(); await page.waitForFunction(() => Boolean(window.runPhoto));
  expect(await page.evaluate(input => window.runPhoto(input), input)).toEqual({ ok: false, ambiguous: true });
  expect(await page.evaluate(() => window.entries()[0].confirmed ?? false)).toBe(false);
  f.receipts.get(operationId).result.payload = structuredClone(f.photoPayload);
  expect((await page.evaluate(input => window.runPhoto(input), input)).result).toEqual(f.photoPayload);
  await page.reload(); await page.waitForFunction(() => Boolean(window.runPhoto));
  expect((await page.evaluate(input => window.runPhoto(input), input)).result).toEqual(f.photoPayload);
  expect(f.posts).toHaveLength(1);
  f.revision = 2;
  expect(await page.evaluate(input => window.runPhoto(input), input)).toEqual({ ok: false, ambiguous: true });
  const proof = await page.evaluate(input => window.runPhoto(input, true), input);
  expect(proof.result.historicalOnly).toBe(true); expect(proof.result.operation.id).toBe(operationId);
  expect(proof.result.list).toBeUndefined(); expect(f.posts).toHaveLength(1);
});

test("initial create recovers after lost ACK and route change using one UUID and one POST", async ({ page, context }) => {
  const f = await fixture(page, context); f.lose = true; f.unknown = true;
  expect(await page.evaluate(() => window.bootstrapSave())).toBe("blocked");
  expect(f.posts).toHaveLength(1);
  const first = await page.evaluate(() => window.initialAction());
  expect(first.action.kind).toBe("list.create");
  await page.evaluate(() => { localStorage.removeItem('bootstrap-list'); sessionStorage.setItem('list-route', 'eu'); });
  f.lose = false; f.unknown = false;
  await page.reload(); await page.waitForFunction(() => Boolean(window.bootstrapSave));
  expect(await page.evaluate(() => window.bootstrapSave())).toBe("confirmed");
  expect(f.posts).toHaveLength(1);
  expect((await page.evaluate(() => window.initialAction())).action.operationId).toBe(first.action.operationId);
  expect(await page.evaluate(() => window.initialConfirmations)).toBe(1);
});

test("initial create snapshot survives a crash before the active-list mirror and before any network write", async ({ page, context }) => {
  const f = await fixture(page, context);
  await page.evaluate(() => { window.crashBeforePointer = true; });
  expect(await page.evaluate(() => window.bootstrapSave())).toBe("blocked");
  const first = await page.evaluate(() => window.initialAction());
  expect(f.posts).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem('bootstrap-list'))).toBeNull();
  await page.reload(); await page.waitForFunction(() => Boolean(window.bootstrapSave));
  expect(await page.evaluate(() => window.bootstrapSave())).toBe("confirmed");
  expect(f.posts).toHaveLength(1);
  expect(f.posts[0].body.operationId).toBe(first.action.operationId);
  expect(f.posts[0].body.listId).toBe(first.action.listId);
});

test("personal write-ahead snapshots survive reload and lost ACK without replacing action IDs", async ({ page, context }) => {
  const f = await fixture(page, context);
  const first = await page.evaluate(() => window.captureSave(100));
  const second = await page.evaluate(() => window.captureSave(200));
  expect(second.action.body.causal.baseOperationId).toBe(first.action.operationId);
  f.lose = true; f.unknown = true;
  expect(await page.evaluate(() => window.drainSaves())).toBe("blocked");
  expect(f.posts).toHaveLength(1);
  await page.reload(); await page.waitForFunction(() => Boolean(window.drainSaves));
  expect((await page.evaluate(() => window.restoreSave())).snapshot.items.a.weight).toBe(200);
  await page.evaluate(() => { window.generation = "new-editor-after-reload"; });
  f.lose = false; f.unknown = false;
  expect(await page.evaluate(() => window.drainSaves())).toBe("confirmed");
  expect(f.posts.map(post => post.body.operationId)).toEqual([first.action.operationId, second.action.operationId]);
  expect(await page.evaluate(() => window.saveConfirmations)).toBe(1);
  await page.reload(); await page.waitForFunction(() => Boolean(window.drainSaves));
  expect(await page.evaluate(() => window.drainSaves())).toBe("confirmed");
  expect(f.posts).toHaveLength(2);
});

test("another tab cannot silently attach its stale edit after an unseen save", async ({ page, context }) => {
  const f = await fixture(page, context);
  const other = await context.newPage();
  await other.goto(`${origin}/__list-queue-test`); await other.waitForFunction(() => Boolean(window.captureSave));
  await page.evaluate(() => window.captureSave(100));
  const error = await other.evaluate(() => { try { window.captureSave(200); return null; } catch (error) { return error.code; } });
  expect(error).toBe("stale-tab");
  expect(f.posts).toHaveLength(0);
  expect((await page.evaluate(() => window.restoreSave())).snapshot.items.a.weight).toBe(100);
});

test("historical rejection inspection survives reload without resending or installing its obsolete snapshot", async ({ page, context }) => {
  const f = await fixture(page, context);
  f.rejection = { status: 409, payload: { ok: false, code: 'stale_state_revision', stateRevision: 1, serverPayload: { items: { a: { weight: 999 } } } } };
  const action = await page.evaluate(() => window.captureSave(100));
  expect(await page.evaluate(() => window.drainSaves())).toBe('blocked');
  f.revision = 20;
  await page.reload(); await page.waitForFunction(() => Boolean(window.inspectSaves));
  const result = await page.evaluate(() => window.inspectSaves());
  expect(result.historicalOnly).toBe(true);
  expect(result.headOperationId).toBe(action.action.operationId);
  expect(result.outcomes[0].operation.state).toBe('rejected');
  expect(result.outcomes[0].rejectionCode).toBe('stale_state_revision');
  expect(result.outcomes[0].result).toBeUndefined();
  expect(f.posts).toHaveLength(1);
  expect((await page.evaluate(() => window.restoreSave())).snapshot.items.a.weight).toBe(100);
  expect(await page.evaluate(() => window.saveConfirmations)).toBe(0);
});

test("inspection of a waiting action does not resume its POST", async ({ page, context }) => {
  const f = await fixture(page, context);
  await page.evaluate(() => window.captureSave(100));
  expect(await page.evaluate(() => window.drainSaves())).toBe('confirmed');
  f.waiting = true;
  await page.evaluate(() => window.captureSave(200));
  expect(await page.evaluate(() => window.drainSaves())).toBe('blocked');
  const before = f.posts.length;
  expect(await page.evaluate(() => window.inspectSaves())).toEqual({ blocked: true, waiting: true });
  expect(f.posts).toHaveLength(before);
});

test("a delayed checkpoint from another browser tab cannot roll back a fresh baseline", async ({ page, context }) => {
  const f = await fixture(page, context);
  const install = async target => target.evaluate(async () => {
    const { createPersonalSaveOutbox } = await import('/src/sync/personal-save-outbox.js');
    const binding = { actorId: 'actor-a', listId: 'list-a', scopeKey: 'id:actor-a' };
    const storage = {
      get length() { return localStorage.length; }, key: index => localStorage.key(index),
      getItem: key => localStorage.getItem(key), removeItem: key => localStorage.removeItem(key),
      setItem: (key, value) => {
        if (window.holdCheckpoint && key.includes(':checkpoint:')) {
          window.heldCheckpoint = { key, value }; throw Error('suspended before publication');
        }
        localStorage.setItem(key, value);
      }
    };
    window.checkpointBox = createPersonalSaveOutbox({ storage, ...binding });
    window.checkpointInput = weight => ({ snapshot: { items: { a: { weight } } },
      body: { baseStateRevision: 5, payload: { items: { a: { weight } } } } });
    window.freshCheckpointBox = () => createPersonalSaveOutbox({ storage: localStorage, ...binding });
  });
  await install(page);
  await page.evaluate(() => {
    window.checkpointBox.capture(window.checkpointInput(1));
    const head = window.checkpointBox.capture(window.checkpointInput(2));
    window.checkpointBox.markApplied({ operationId: head.action.operationId, stateRevision: 7 });
    window.checkpointBox.compact();
    window.holdCheckpoint = true;
    window.checkpointBox.compact();
  });
  const other = await context.newPage(); await other.goto(`${origin}/__list-queue-test`);
  await other.waitForFunction(() => Boolean(window.run)); await install(other);
  await other.evaluate(() => {
    const remote = window.checkpointInput(200);
    window.checkpointBox.adoptRemoteBaseline({ snapshot: remote.snapshot, payload: remote.body.payload, stateRevision: 20 });
  });
  const oldEditor = await page.evaluate(() => {
    window.holdCheckpoint = false;
    const { key, value } = window.heldCheckpoint; localStorage.setItem(key, value);
    try { window.checkpointBox.capture(window.checkpointInput(300)); return 'unexpected save'; }
    catch (error) { return error.code; }
  });
  expect(oldEditor).toBe('stale-tab');
  expect(await other.evaluate(() => window.freshCheckpointBox().baseline().stateRevision)).toBe(20);
  // Same logical baseline: the other editor is not invalidated by a physical
  // checkpoint append/cleanup, and its next operation retains the exact base.
  expect(await other.evaluate(() => {
    window.checkpointBox.compact();
    const input = window.checkpointInput(300); input.body.baseStateRevision = 20;
    const next = window.checkpointBox.capture(input);
    window.checkpointBox.markApplied({ operationId: next.action.operationId, stateRevision: 21 });
    window.checkpointBox.compact(); return next.action.body.baseStateRevision;
  })).toBe(20);
  await page.reload(); await page.waitForFunction(() => Boolean(window.run)); await install(page);
  expect(await page.evaluate(() => window.checkpointBox.recoverSnapshot().items.a.weight)).toBe(300);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('bike-packing-personal-save-v1:')).length)).toBe(3);
  expect(f.posts).toHaveLength(0);
});

test("concurrent tabs submit one logical action once; its acknowledged replay stays GET-only", async ({ page, context }) => {
  const f = await fixture(page, context);
  const other = await context.newPage(); await other.goto(`${origin}/__list-queue-test`);
  await other.waitForFunction(() => Boolean(window.run));
  const results = await Promise.all([page.evaluate(() => window.run()), other.evaluate(() => window.run())]);
  expect(results.every(result => result.ok)).toBe(true); expect(f.posts).toHaveLength(1);
  await other.reload(); await other.waitForFunction(() => Boolean(window.run));
  expect((await other.evaluate(() => window.run())).ok).toBe(true); expect(f.posts).toHaveLength(1);
});

test("new local edits during a request and newer server revisions reject historical application", async ({ page, context }) => {
  const f = await fixture(page, context);
  f.beforeAck = () => page.evaluate(() => { window.generation = "new-edit"; });
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  expect(f.posts).toHaveLength(1);
  f.beforeAck = null; f.revision = 2;
  await page.reload(); await page.waitForFunction(() => Boolean(window.run));
  expect(await page.evaluate(() => window.run())).toEqual({ ok: false, ambiguous: true });
  expect(f.posts).toHaveLength(1);
});

test("action DAG survives browser reload between update, copy and delete", async ({ page, context }) => {
  await fixture(page, context);
  const update = await page.evaluate(() => window.enqueue({ kind: "list.update", listId: "a", body: { baseStateRevision: 16, payload: { parameter: "new" } } }));
  const copy = await page.evaluate(() => window.enqueue({ kind: "list.create", listId: "b", body: { payload: { parameter: "new" } }, sourceReads: [{ listId: "a", revision: 16 }] }));
  await page.reload(); await page.waitForFunction(() => Boolean(window.enqueue));
  const deletion = await page.evaluate(() => window.enqueue({ kind: "list.delete", listId: "a" }));
  expect(copy.body.causal.reads).toEqual([{ listId: "a", operationId: update.operationId }]);
  expect(deletion.body.causal.dependsOn.map(dep => dep.operationId)).toEqual([update.operationId, copy.operationId]);
  expect(await page.evaluate(() => window.actions())).toHaveLength(3);
});

test("verified waiting operation resumes with its original UUID and body after reload", async ({ page, context }) => {
  const f = await fixture(page, context); f.waiting = true;
  expect(await page.evaluate(() => window.runWaiting())).toBe("waiting");
  const original = f.posts[0].body;
  await page.reload(); await page.waitForFunction(() => Boolean(window.runWaiting));
  f.waiting = false;
  expect(await page.evaluate(() => window.runWaiting())).toBe("committed");
  expect(f.posts).toHaveLength(2); expect(f.posts[1].body).toEqual(original);
  expect(await page.evaluate(() => window.runWaiting())).toBe("committed"); expect(f.posts).toHaveLength(2);
});
