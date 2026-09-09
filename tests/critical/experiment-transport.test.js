import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AMBIGUOUS_WRITE_KEY, EU_EXPERIMENT_API_BASE, EXPERIMENT_FRONTEND_ORIGIN,
  EXPERIMENT_TRANSPORT_KEY, IP_DIAGNOSTIC_API_BASE, createExperimentTransport,
  isReadOnlyRequest, pendingExperimentWrites, probeExperimentProxy, saveTransportSelection, validateApiPath,
} from "../../src/sync/experiment-transport.js";
import { API_BASE, EXPERIMENT_API_BASE, resolveApiBase } from "../../src/config/constants.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { apiFetchRequest, apiUploadFormDataRequest } from "../../src/sync/api-client.js";
import { photoCacheSourceSignature } from "../../src/sync/photo-cache-quality.js";
import { shouldRetryLocalPhotoUploadAfterFailure } from "../../src/sync/photos.js";
import { renderExperimentTransportSettings } from "../../src/ui/experiment-transport-settings.js";
import { uploadPhotoToPath, copyRemotePhotoToList } from "../../src/sync/photo-upload-flow.js";
import { uploadPhotoBatchQueue } from "../../src/sync/photo-upload-queue.js";

const locationLike = { origin: EXPERIMENT_FRONTEND_ORIGIN, hostname: "experiment.vniipo-help.ru" };
function storageMock() {
  const values = new Map();
  return { values, get length() { return values.size; }, key: (index) => [...values.keys()][index], getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}
function descriptor(gate = "enabled", identity = "bike-packing-experiment") {
  return new Response(JSON.stringify({ ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION, capabilities: REQUIRED_ADMIN_API_CAPABILITIES }), {
    headers: { "Content-Type": "application/json", "X-Vniipo-Proxy-Target": identity, "X-Vniipo-Proxy-Write-Gate": gate },
  });
}
const locks = { request: async (name, callback) => callback() };
const eu = (options = {}) => createExperimentTransport({ locationLike, selection: "eu", euEnabled: true, locks, storage: storageMock(), fetchImpl: async () => descriptor(), ...options });
function photoBody(id = "photo-a", content = "photo") {
  const body = new FormData();
  body.set("photoId", id);
  body.set("entityId", "item-a");
  body.set("entityType", "item");
  body.set("file", new Blob([content]));
  return body;
}

test("transport: IP is anonymous diagnostic only, even with an enabled gate", async () => {
  const requests = [];
  const result = await probeExperimentProxy({ target: "ip", fetchImpl: async (...args) => { requests.push(args); return descriptor(); } });
  assert.equal(result.usable, false);
  assert.equal(result.authenticated, false);
  assert.equal(requests[0][0], `${IP_DIAGNOSTIC_API_BASE}/bike-packing/capabilities`);
  assert.equal(requests[0][1].credentials, "omit");
  assert.equal(requests[0][1].redirect, "error");
  assert.throws(() => resolveApiBase({ hostname: "201.51.16.219" }), /not a frontend/);
  assert.throws(() => resolveApiBase({ hostname: "api-eu.vniipo-help.ru" }), /not a frontend/);
});

test("a cancellation-only form journal may pass only its own exact uncertain stage; ordinary and foreign writes remain blocked", async () => {
  const storage = storageMock(), assetId = crypto.randomUUID(), ownerId = crypto.randomUUID();
  const stagePath = "/bike-packing/lists/list/photo-assets", formPath = "/bike-packing/lists/list/photos/mutate";
  const stage = { id: assetId, path: stagePath, method: "POST", mode: "direct", uncertain: true,
    recovery: { type: "photo-stage", protocol: "staging-v1", operationId: assetId, actorId: "actor", listId: "list",
      actionOperationId: ownerId, entityType: "item", entityId: "item", photoId: "photo" } };
  storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${assetId}`, JSON.stringify(stage));
  const transport = createExperimentTransport({ locationLike, selection: "direct", locks, storage });
  const recovery = { type: "list", protocol: "causal-v1", operationId: ownerId, kind: "photos.mutate", actorId: "actor", listId: "list",
    cancellationOnly: true, body: { action: "form", entityType: "item", entityId: "item", changes: [
      { action: "attach", entityType: "item", entityId: "item", photoId: "photo", assetId }] } };
  assert.doesNotThrow(() => transport.assertWritable(formPath, "POST", recovery));
  for (const mutate of [r => { delete r.cancellationOnly; }, r => { r.operationId = crypto.randomUUID(); },
    r => { r.actorId = "other"; }, r => { r.listId = "other"; }, r => { r.body.changes[0].photoId = "other"; },
    r => { r.body.changes[0].assetId = crypto.randomUUID(); }, r => { r.body.entityId = "other"; }, r => { r.body.action = "batch"; }]) {
    const invalid = structuredClone(recovery); mutate(invalid);
    assert.throws(() => transport.assertWritable(formPath, "POST", invalid), /unknown outcome/);
  }
  assert.throws(() => transport.assertWritable("/auth/logout", "POST", recovery), /unknown outcome/);
  assert.throws(() => transport.assertWritable(formPath, "PUT", recovery), /unknown outcome/);
  const id = await transport.beginWrite(formPath, "POST", JSON.stringify(recovery.body), recovery);
  assert.equal(id, ownerId); assert.equal(transport.writes.find(entry => entry.id === id).recovery.cancellationOnly, true);
  assert.equal(transport.writes.find(entry => entry.id === assetId).confirmed, undefined);
});

test("transport: gate and identity are fail-closed, preparation deduplicates and cannot reach Production", async () => {
  for (const [gate, identity] of [["read-only", "bike-packing-experiment"], ["enabled", "bike-packing"], ["", ""]]) {
    const requests = [];
    const transport = eu({ fetchImpl: async (url) => { requests.push(url); return descriptor(gate, identity); } });
    await assert.rejects(transport.prepare());
    assert.throws(() => transport.apiUrl("/auth/me"), /not verified/);
    assert.deepEqual(requests, [`${EU_EXPERIMENT_API_BASE}/bike-packing/capabilities`]);
  }
  let calls = 0;
  const transport = eu({ fetchImpl: async () => { calls++; return descriptor(); } });
  await Promise.all([transport.prepare(), transport.prepare()]);
  assert.equal(calls, 1);
  assert.equal(transport.apiUrl("/auth/me"), `${EU_EXPERIMENT_API_BASE}/auth/me`);
});

for (const [envelope, version] of [["archiveImport", 2], ["guestImport", 1], ["publicImport", 1], ["publicImport", 2]]) test(`${envelope} v${version} cancellation passes only its exact uncertain byte-bound stage while normal import and unrelated writes stay blocked`, async () => {
  const storage = storageMock(), assetId = crypto.randomUUID(), operationId = crypto.randomUUID();
  storage.setItem(`${AMBIGUOUS_WRITE_KEY}:${assetId}`, JSON.stringify({ id: assetId, path: "/bike-packing/lists/list/photo-assets", method: "POST", uncertain: true, mode: "direct",
    recovery: { type: "photo-stage", protocol: "staging-v1", actorId: "actor", listId: "list", operationId: assetId,
      actionOperationId: operationId, photoId: "photo", entityType: "item", entityId: "item", fileHash: "a".repeat(64), thumbHash: "b".repeat(64) } }));
  const transport = createExperimentTransport({ locationLike, selection: "direct", locks, storage }), path = "/bike-packing/lists/list/import";
  const recovery = { type: "list", protocol: "causal-v1", actorId: "actor", listId: "list", operationId, kind: "list.import", cancellationOnly: true,
    body: { [envelope]: { version, operationId, files: [{ entityType: "item", entityId: "item", photoId: "photo", assetId, file: { hash: "a".repeat(64) }, thumb: { hash: "b".repeat(64) } }] } } };
  assert.doesNotThrow(() => transport.assertWritable(path, "POST", recovery));
  for (const mutate of [r => delete r.cancellationOnly, r => { r.body[envelope === "publicImport" ? "guestImport" : "publicImport"] = structuredClone(r.body[envelope]); }, r => r.actorId = "other", r => r.operationId = crypto.randomUUID(),
    r => r.listId = "other", r => r.kind = "list.update", r => r.body[envelope].version = 0, r => r.body[envelope].files = [],
    r => r.body[envelope].files[0].assetId = crypto.randomUUID(), r => r.body[envelope].files[0].photoId = "other",
    r => r.body[envelope].files[0].entityId = "other", r => r.body[envelope].files[0].file.hash = "c".repeat(64),
    r => r.body[envelope].files[0].thumb.hash = "c".repeat(64)]) {
    const value = structuredClone(recovery); mutate(value); assert.throws(() => transport.assertWritable(path, "POST", value), /unknown outcome/);
  }
  assert.throws(() => transport.assertWritable("/auth/logout", "POST", recovery), /unknown outcome/);
  const id = await transport.beginWrite(path, "POST", JSON.stringify(recovery.body), recovery);
  assert.equal(id, operationId); assert.equal(transport.writes.find(entry => entry.id === id).recovery.cancellationOnly, true);
  assert.equal(transport.writes.find(entry => entry.id === assetId).confirmed, undefined);
});

test("transport: only the exact frontend origin can select EU; no arbitrary API URL or traversal", async () => {
  for (const origin of ["https://vniipo-help.ru", "https://evil.test", "https://experiment.vniipo-help.ru.evil.test", "http://experiment.vniipo-help.ru"]) {
    const transport = eu({ locationLike: { origin } });
    assert.equal(transport.mode, "direct");
    assert.throws(() => saveTransportSelection("eu", { locationLike: { origin }, storage: storageMock() }));
    assert.equal(renderExperimentTransportSettings({ locationLike: { origin } }), "");
  }
  for (const path of ["https://evil.test/", "//evil.test/", "/../auth/me", "/%2e%2e/auth/me", "/a%2fb", "/a%252fb", "/a\\b", "/a#x"]) {
    assert.throws(() => validateApiPath(path));
  }
  assert.equal(validateApiPath("/bike-packing/lists/list-1?x=2"), "/bike-packing/lists/list-1?x=2");
});

test("transport: selection is next-reload only and leaves saved state, queue and cache names intact", () => {
  const storage = storageMock();
  storage.setItem("bike-packing-prototype-state-v1", "local-state");
  storage.setItem("upload-queue", "pending-photo");
  const transport = createExperimentTransport({ locationLike, selection: "direct", storage });
  saveTransportSelection("eu", { locationLike, storage });
  assert.equal(transport.mode, "direct");
  assert.equal(transport.apiUrl("/auth/me"), `${EXPERIMENT_API_BASE}/auth/me`);
  assert.equal(storage.getItem("upload-queue"), "pending-photo");
  assert.equal(storage.getItem("bike-packing-prototype-state-v1"), "local-state");
  assert.equal(storage.getItem(EXPERIMENT_TRANSPORT_KEY), "eu");
});

test("transport: photo fetch rewrites only trusted private photo routes; cache signature and sources remain canonical", async () => {
  const requests = [];
  const transport = eu({ fetchImpl: async (url, options) => { requests.push({ url, options }); return url.endsWith("capabilities") ? descriptor() : new Response("image"); } });
  const source = `${EXPERIMENT_API_BASE}/bike-packing/lists/list-1/photos/photo-1/file?v=2`;
  const signature = photoCacheSourceSignature(source, source, "rev-1");
  await transport.fetchPhoto(source, { credentials: "include" });
  assert.equal(requests[1].url, `${EU_EXPERIMENT_API_BASE}/bike-packing/lists/list-1/photos/photo-1/file?v=2`);
  assert.equal(requests[1].options.credentials, "include");
  assert.equal(photoCacheSourceSignature(source, source, "rev-1"), signature);
  for (const external of ["blob:cached", "data:image/png,x", "https://ortlieb.com/a.jpg", "https://evil.test/letters-vniipo/api/bike-packing/lists/x/photos/y/file", `${EXPERIMENT_API_BASE}/auth/me`, "/assets/manufacturer-catalog/ortlieb.jpg"]) {
    assert.equal(await transport.photoUrl(external), external);
  }
});

test("transport: 401/403 and network errors never silently fail over or re-send a fetch mutation", async () => {
  const priorFetch = globalThis.fetch, priorWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  try {
    for (const status of [401, 403, 502, 503, 0]) {
      const storage = storageMock();
      const transport = eu({ storage });
      let calls = 0;
      globalThis.fetch = async (url) => {
        calls++;
        assert.equal(url, `${EU_EXPERIMENT_API_BASE}/bike-packing/lists`);
        if (!status) throw new TypeError("connection lost");
        return new Response(JSON.stringify({ ok: false }), { status });
      };
      await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST", body: "{}", silentErrors: true }, { transport }), (error) => {
        assert.equal(Boolean(error.isNetworkError), status === 0);
        assert.equal(Boolean(error.isAmbiguousMutation), status === 0 || status >= 500);
        return true;
      });
      assert.equal(calls, 1);
      if ([0, 502, 503].includes(status)) {
        assert.equal(pendingExperimentWrites(storage).length, 1);
        const restarted = eu({ storage });
        assert.throws(() => restarted.assertWritable("/bike-packing/lists", "POST"), /unknown outcome/);
        assert.doesNotThrow(() => restarted.assertWritable("/auth/me", "GET"));
        assert.equal(restarted.reconcile("/wrong-path"), false);
        assert.equal(restarted.reconcile(restarted.uncertainWrite.id), true);
      } else assert.deepEqual(pendingExperimentWrites(storage), []);
    }
  } finally { globalThis.fetch = priorFetch; globalThis.window = priorWindow; }
});

test("transport: forced offline does not probe EU or start XHR and keeps pending state", async () => {
  let probes = 0;
  const transport = eu({ fetchImpl: async () => { probes++; return descriptor(); } });
  await assert.rejects(apiFetchRequest("/auth/me", {}, { transport, isForcedOffline: () => true }), /офлайн/);
  await assert.rejects(apiUploadFormDataRequest("/bike-packing/lists/a/photos", {}, { transport, isForcedOffline: () => true }), /офлайн/);
  assert.equal(probes, 0);
});

test("transport: XHR upload uses the same isolated origin exactly once and timeout blocks automatic retry", async () => {
  const previous = globalThis.XMLHttpRequest;
  const sent = [];
  globalThis.XMLHttpRequest = class {
    upload = {};
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader() {}
    send(body) { sent.push({ url: this.url, credentials: this.withCredentials, body }); queueMicrotask(() => this.ontimeout()); }
  };
  try {
    const transport = eu();
    const body = photoBody();
    await assert.rejects(apiUploadFormDataRequest("/bike-packing/lists/a/photos", { body }, { transport }), (error) => {
      assert.equal(error.isTimeoutError, true);
      assert.equal(error.isAmbiguousMutation, true);
      assert.equal(shouldRetryLocalPhotoUploadAfterFailure({ blob: new Blob(["photo"]), error, isTimeoutErrorValue: true }), false);
      return true;
    });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, `${EU_EXPERIMENT_API_BASE}/bike-packing/lists/a/photos`);
    assert.equal(sent[0].credentials, true);
    assert.equal(sent[0].body, body);
    await assert.rejects(apiUploadFormDataRequest("/bike-packing/lists/a/photos", { body }, { transport }), /unknown outcome/);
    assert.equal(sent.length, 1);
  } finally { globalThis.XMLHttpRequest = previous; }
});

test("transport: auth bridge and cookie bootstrap remain distinct; token-consuming GET is unsafe", () => {
  assert.equal(isReadOnlyRequest("/auth/verify-magic-link?token=x"), false);
  assert.equal(isReadOnlyRequest("/auth/me"), true);
  assert.equal(isReadOnlyRequest("/auth/me", "PATCH"), false);
  const source = readFileSync(new URL("../../src/sync/experiment-shared-auth.js", import.meta.url), "utf8");
  assert.match(source, /EXPERIMENT_SHARED_AUTH_URL/);
  assert.match(source, /credentials: "include"/);
  assert.doesNotMatch(source, /201\.51\.16\.219|api-eu/);
  assert.equal(API_BASE.includes("api-eu"), false);
});

test("transport: pending intent survives reload; reconciling one concurrent upload cannot clear another", async () => {
  const storage = storageMock();
  const transport = eu({ storage });
  await transport.prepare();
  const path = "/bike-packing/lists/a/photos";
  const first = await transport.beginWrite(path, "POST", photoBody("first"));
  const second = await transport.beginWrite(path, "POST", photoBody("second"));
  assert.notEqual(first, second);
  const restartedWhilePending = eu({ storage });
  assert.throws(() => restartedWhilePending.assertWritable(path, "POST"), /unknown outcome/);
  for (const id of [first, second]) {
    transport.noteFailure(new Error("connection lost"), path, "POST", id);
  }
  assert.equal(transport.reconcile(first), true);
  assert.throws(() => transport.assertWritable(path, "POST"), /unknown outcome/);
  assert.equal(transport.reconcile(second), true);
  assert.doesNotThrow(() => transport.assertWritable(path, "POST"));
  assert.equal(pendingExperimentWrites(storage).filter((entry) => !entry.confirmed).length, 0);
});

test("transport: no write is dispatched if its durable intent cannot be saved", async () => {
  const transport = eu({ storage: { getItem: () => null, setItem() { throw Error("quota"); } } });
  await transport.prepare();
  await assert.rejects(transport.beginWrite("/bike-packing/lists", "POST"), /write was not sent/);
});

test("transport: changing selection or signing out does not clear an unresolved write or local queue", async () => {
  const storage = storageMock();
  storage.setItem("queue", "pending");
  const transport = eu({ storage });
  await transport.prepare();
  const id = await transport.beginWrite("/bike-packing/lists", "POST");
  transport.noteFailure(new Error("timeout"), "/bike-packing/lists", "POST", id);
  saveTransportSelection("direct", { storage, locationLike });
  const directAfterReload = createExperimentTransport({ locationLike, selection: "direct", storage });
  assert.throws(() => directAfterReload.assertWritable("/auth/logout", "POST"), /unknown outcome/);
  assert.equal(storage.getItem("queue"), "pending");
  assert.equal(pendingExperimentWrites(storage).length, 1);
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  assert.match(app, /remoteSignOutConfirmed = true/);
  assert.match(app, /Server session revocation is not confirmed/);
  assert.doesNotMatch(app, /removeItem\(AMBIGUOUS_WRITE_KEY\)/);
});

test("release gate: EU cannot be activated by saved preference or enabled proxy alone", async () => {
  let probes = 0;
  const transport = eu({ euEnabled: false, fetchImpl: async () => { probes++; return descriptor(); } });
  await assert.rejects(transport.prepare(), /not approved/);
  assert.equal(probes, 0);
});

test("release gate: atomic cross-tab registration covers direct and EU with independent operation IDs", async () => {
  const storage = storageMock();
  const direct = eu({ storage, selection: "direct" });
  const duplicateTab = eu({ storage });
  await duplicateTab.prepare();
  const attempts = await Promise.allSettled([
    direct.beginWrite("/bike-packing/lists", "POST"),
    duplicateTab.beginWrite("/bike-packing/lists", "POST"),
  ]);
  assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
  assert.equal(pendingExperimentWrites(storage).length, 1);
  const id = attempts[0].value;
  assert.equal(pendingExperimentWrites(storage)[0].mode, "direct");
  direct.confirmWrite(id);
  const next = await duplicateTab.beginWrite("/bike-packing/lists", "POST");
  assert.notEqual(next, id); // A subsequent lawful edit is not called a duplicate.
});

test("release gate: unsupported lock API or failed persistence prevents network dispatch", async () => {
  const previousFetch = globalThis.fetch;
  let sends = 0;
  globalThis.fetch = async () => { sends++; return new Response('{"ok":true}'); };
  try {
    for (const transport of [eu({ locks: null }), eu({ storage: { length: 0, setItem() { throw Error("quota"); } } })]) {
      await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST" }, { transport }), /write was not sent/);
    }
    assert.equal(sends, 0);
  } finally { globalThis.fetch = previousFetch; }
});

test("release blocker: disabling EU does not disable direct journaling; unsupported storage/locks blocks current saves", async () => {
  const storage = storageMock();
  const direct = eu({ selection: "direct", euEnabled: false, storage });
  await direct.prepare();
  const id = await direct.beginWrite("/bike-packing/lists", "POST");
  assert.equal(pendingExperimentWrites(storage)[0].mode, "direct");
  direct.noteFailure(new Error("response lost"), "/bike-packing/lists", "POST", id);
  assert.throws(() => direct.assertWritable("/auth/experiment-share-session", "POST"), { isAmbiguousMutation: true });
  assert.doesNotThrow(() => direct.assertWritable("/auth/me", "GET"));
  const restarted = eu({ selection: "direct", euEnabled: false, storage });
  await assert.rejects(restarted.beginWrite("/bike-packing/lists", "POST"), { isAmbiguousMutation: true });
  for (const options of [{ locks: null }, { storage: null }]) {
    const unsupported = eu({ selection: "direct", euEnabled: false, ...options });
    await assert.rejects(unsupported.beginWrite("/bike-packing/lists", "POST"), /write was not sent/);
  }
});

test("release gate: server commit then lost response blocks reload, duplicated tab, switch and offline reconnect", async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  try {
    for (const selection of ["direct", "eu"]) {
      const storage = storageMock();
      storage.setItem("offline-queue", "unchanged");
      const transport = eu({ storage, selection });
      const sent = [];
      let commits = 0;
      globalThis.fetch = async (url) => { sent.push(url); commits++; throw new TypeError("response lost after commit"); };
      await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST" }, { transport }), { isAmbiguousMutation: true });
      for (const next of [transport, eu({ storage, selection }), eu({ storage, selection: selection === "eu" ? "direct" : "eu" })]) {
        await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST" }, { transport: next, isForcedOffline: () => true }));
        await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST" }, { transport: next }), { isAmbiguousMutation: true });
      }
      assert.equal(commits, 1);
      assert.deepEqual(sent, [`${selection === "eu" ? EU_EXPERIMENT_API_BASE : EXPERIMENT_API_BASE}/bike-packing/lists`]);
      assert.equal(storage.getItem("offline-queue"), "unchanged");
    }
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test("release gate: timeout after server commit and late body success cannot clear intent or change endpoint", async () => {
  const previousFetch = globalThis.fetch, previousWindow = globalThis.window;
  globalThis.window = { setTimeout, clearTimeout };
  let lateBody;
  let commits = 0;
  try {
    const storage = storageMock();
    const transport = eu({ storage });
    globalThis.fetch = async (url) => {
      assert.equal(url, `${EU_EXPERIMENT_API_BASE}/bike-packing/lists`);
      commits++;
      saveTransportSelection("direct", { storage, locationLike });
      assert.throws(() => { transport.mode = "direct"; }, TypeError);
      return { ok: true, json: () => new Promise((resolve) => { lateBody = resolve; }) };
    };
    await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST", timeoutMs: 10 }, { transport }), { isTimeoutError: true, isAmbiguousMutation: true });
    const id = transport.uncertainWrite.id;
    lateBody({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(transport.uncertainWrite.id, id);
    const direct = eu({ storage, selection: "direct" });
    await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST" }, { transport: direct }), { isAmbiguousMutation: true });
    assert.equal(commits, 1);
  } finally { globalThis.fetch = previousFetch; globalThis.window = previousWindow; }
});

test("release gate: same photo replay is blocked in flight and after ACK; other photos remain independent", async () => {
  const storage = storageMock();
  const transport = eu({ storage });
  const path = "/bike-packing/lists/a/photos";
  const first = await transport.beginWrite(path, "POST", photoBody());
  await assert.rejects(transport.beginWrite(path, "POST", photoBody()), { isDuplicateOperation: true });
  const second = await transport.beginWrite(path, "POST", photoBody("photo-b"));
  assert.notEqual(second, first);
  transport.confirmWrite(first);
  transport.confirmWrite(second);
  const clonedQueueTab = eu({ storage, selection: "direct" });
  await assert.rejects(clonedQueueTab.beginWrite(path, "POST", photoBody()), { isDuplicateOperation: true });
  assert.equal(clonedQueueTab.uncertainWrite, null);
  assert.ok(await clonedQueueTab.beginWrite(path, "POST", photoBody("photo-a", "legitimately edited bytes")));
});

test("release gate: late XHR success after timeout never clears photo barrier", async () => {
  const previous = globalThis.XMLHttpRequest;
  let xhr;
  globalThis.XMLHttpRequest = class {
    upload = {};
    open() { xhr = this; }
    send() { queueMicrotask(() => this.ontimeout()); }
  };
  try {
    const transport = eu();
    await assert.rejects(apiUploadFormDataRequest("/bike-packing/lists/a/photos", { body: photoBody() }, { transport }), { isAmbiguousMutation: true });
    const id = transport.uncertainWrite.id;
    xhr.status = 200;
    xhr.responseText = '{"ok":true}';
    xhr.onload();
    assert.equal(transport.uncertainWrite.id, id);
  } finally { globalThis.XMLHttpRequest = previous; }
});

test("release gate: old matching photo cannot reconcile a lost new operation; local blob and queue are retained", async () => {
  const storage = storageMock();
  const transport = eu({ storage });
  const path = "/bike-packing/lists/a/photos";
  const id = await transport.beginWrite(path, "POST", photoBody());
  const error = transport.noteFailure(new Error("response lost"), path, "POST", id);
  const photo = { id: "photo-a", localId: "local-a", status: "pending" };
  const entity = { id: "item-a", photos: [photo] };
  const cached = { blob: new Blob(["old matching photo"]), fileName: "a.jpg" };
  let resolves = 0;
  await assert.rejects(uploadPhotoToPath({
    path, listId: "a", entity, photo,
    getCachedPhoto: async () => cached,
    apiUploadFormData: async () => { throw error; },
    apiFetch: async () => { resolves++; return { photosByHash: { old: { id: "old-photo" } } }; },
  }), { isAmbiguousMutation: true });
  assert.equal(resolves, 0);
  assert.equal(transport.uncertainWrite.id, id);
  assert.equal(photo.localId, "local-a");
  assert.equal(await cached.blob.text(), "old matching photo");
  assert.match(photo.error, /повтор приостановлен/);
  let calls = 0;
  await assert.rejects(uploadPhotoBatchQueue([photo, { id: "next" }], {
    concurrency: 1, uploadPhoto: async () => { calls++; throw error; },
  }), { isAmbiguousMutation: true });
  assert.equal(calls, 1);
});

test("release gate: failed durable acknowledgement cannot falsely report reconciliation", async () => {
  const storage = storageMock();
  const transport = eu({ storage });
  const id = await transport.beginWrite("/bike-packing/lists", "POST");
  transport.noteFailure(new Error("response lost"), "/bike-packing/lists", "POST", id);
  storage.removeItem = () => { throw Error("storage unavailable"); };
  assert.equal(transport.reconcile(id), false);
  assert.equal(transport.uncertainWrite.id, id);
});

test("release gate: ambiguous server photo copy cannot fall back to download/upload", async () => {
  const error = Object.assign(new Error("copy response lost"), { isAmbiguousMutation: true });
  let downloads = 0;
  await assert.rejects(copyRemotePhotoToList({
    apiFetch: async () => { throw error; },
    entity: { id: "item-a" }, listId: "target",
    photo: { id: "photo-a", url: `${EXPERIMENT_API_BASE}/bike-packing/lists/source/photos/photo-a/file` },
    uploadPath: "/bike-packing/lists/target/photos",
    fetchImpl: async () => { downloads++; return new Response("old photo"); },
  }), { isAmbiguousMutation: true });
  assert.equal(downloads, 0);
});
