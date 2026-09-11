import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";
import { EXPERIMENT_API_BASE, EXPERIMENT_SESSION_MIGRATION_URL, PRODUCTION_API_BASE, resolveApiBase } from "../../src/config/constants.js";
import { migrateExperimentSession, clearLegacyExperimentCookie } from "../../src/sync/experiment-shared-auth.js";
import { bikePackingPhotoAssetUrl, normalizeRemotePhotoUrl } from "../../src/sync/photos.js";
import { createExperimentTransport, pendingExperimentWrites } from "../../src/sync/experiment-transport.js";
import { MemoryStorage } from "./helpers.js";

const experiment = { hostname: "experiment.vniipo-help.ru" };
test("Experiment uses canonical host with an isolated full API prefix; Production is unchanged", () => {
  assert.equal(resolveApiBase(experiment), "https://api.vniipo-help.ru/experiment/letters-vniipo/api");
  assert.equal(resolveApiBase({ hostname: "vniipo-help.ru" }), PRODUCTION_API_BASE);
  const url = bikePackingPhotoAssetUrl("list-one", "photo-one", "thumb", EXPERIMENT_API_BASE);
  assert.ok(url.startsWith(`${EXPERIMENT_API_BASE}/bike-packing/lists/`));
  for (const origin of ["https://experiment.vniipo-help.ru", "https://api.vniipo-help.ru"]) {
    assert.equal(normalizeRemotePhotoUrl(`${origin}/letters-vniipo/api/bike-packing/lists/a/photos/b/thumb?v=2`, EXPERIMENT_API_BASE),
      `${EXPERIMENT_API_BASE}/bike-packing/lists/a/photos/b/thumb?v=2`);
  }
});
test("migration requires explicit intent and never runs on another host", async () => {
  const fetchImpl = () => { throw new Error("Unexpected request"); };
  assert.equal((await migrateExperimentSession({ fetchImpl, locationLike: experiment })).reason, "explicit-intent-required");
  assert.equal((await migrateExperimentSession({ fetchImpl, explicitIntent: true, locationLike: { hostname: "vniipo-help.ru" } })).reason, "not-experiment");
  await clearLegacyExperimentCookie({ fetchImpl, locationLike: { hostname: "vniipo-help.ru" } });
  const flow = readFileSync(new URL("../../src/sync/auth-load-flow.js", import.meta.url), "utf8");
  assert.doesNotMatch(flow, /migrateExperimentSession|ensureExperimentSharedAuthSession|experiment-share-session/);
});
test("explicit migration uses the canonical endpoint and then clears only the old host cookie", async () => {
  const requests = [];
  const result = await migrateExperimentSession({ explicitIntent: true, locationLike: experiment,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify({ user: { id: "isolated-user" } }));
    },
  });
  assert.equal(result.handled, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, EXPERIMENT_SESSION_MIGRATION_URL);
  assert.deepEqual(JSON.parse(requests[0].options.body), { useExperimentSession: true });
  assert.equal(requests[1].url, "https://experiment.vniipo-help.ru/session/clear-legacy");
  assert.ok(requests.every(({ options }) => options.method === "POST" && options.credentials === "include"
    && options.redirect === "error" && options.cache === "no-store"));
});
test("failed migration preserves the old cookie and can be explicitly retried", async () => {
  let calls = 0;
  const options = { explicitIntent: true, locationLike: experiment,
    fetchImpl: async () => { calls++; return new Response("{}", { status: 401 }); },
  };
  assert.equal((await migrateExperimentSession(options)).handled, false);
  assert.equal((await migrateExperimentSession(options)).handled, false);
  assert.equal(calls, 2);
});

function guardedTransport(storage = new MemoryStorage()) {
  return { storage, transport: createExperimentTransport({
    locationLike: { ...experiment, origin: "https://experiment.vniipo-help.ru" },
    selection: "direct", storage, locks: { request: async (name, callback) => callback() },
  }) };
}

test("migration and legacy cleanup cannot bypass an unresolved business write", async () => {
  const { transport, storage } = guardedTransport();
  const path = "/bike-packing/lists";
  const id = await transport.beginWrite(path, "POST");
  transport.noteFailure(new Error("Lost ACK"), path, "POST", id);
  const before = [...storage.map];
  let requests = 0;
  const options = { transport, locationLike: experiment, explicitIntent: true,
    fetchImpl: async () => { requests++; return new Response("{}"); } };
  await assert.rejects(migrateExperimentSession(options), /unknown outcome/);
  await assert.rejects(clearLegacyExperimentCookie(options), /unknown outcome/);
  assert.equal(requests, 0);
  assert.deepEqual([...storage.map], before);
});

test("terminal unauthenticated migration releases its journal for an explicit retry and never cleans the legacy cookie", async () => {
  const { transport, storage } = guardedTransport();
  let calls = 0;
  const options = { transport, locationLike: experiment, explicitIntent: true,
    fetchImpl: async () => { calls++; return new Response("{}", { status: 401 }); } };
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await migrateExperimentSession(options)).reason, "sign-in-required");
    assert.deepEqual(pendingExperimentWrites(storage), []);
  }
  assert.equal(calls, 2);
});

test("a concurrent lost ACK during auth preparation blocks dispatch and releases only the unsent auth intent", async () => {
  for (const action of [migrateExperimentSession, clearLegacyExperimentCookie]) {
    const { transport, storage } = guardedTransport();
    const path = "/bike-packing/lists";
    const other = await transport.beginWrite(path, "POST");
    const racingTransport = { ...transport, beginWrite: async (...args) => {
      const id = await transport.beginWrite(...args);
      transport.noteFailure(new Error("Concurrent ACK lost"), path, "POST", other);
      return id;
    } };
    let calls = 0;
    await assert.rejects(action({ transport: racingTransport, locationLike: experiment, explicitIntent: true,
      fetchImpl: async () => { calls++; return new Response("{}"); },
    }), /unknown outcome/);
    assert.equal(calls, 0);
    assert.equal(pendingExperimentWrites(storage).length, 1);
    assert.equal(pendingExperimentWrites(storage)[0].id, other);
    assert.equal(pendingExperimentWrites(storage)[0].uncertain, true);
  }
});

test("unconfirmed migration keeps its barrier across reload and blocks replay or cleanup", async () => {
  for (const response of [() => new Response("{}", { status: 503 }),
    () => new Response("{}"), () => new Response('{"ok":false,"user":{"id":"x"}}')]) {
    const { transport, storage } = guardedTransport();
    let calls = 0;
    const options = { transport, locationLike: experiment, explicitIntent: true,
      fetchImpl: async () => { calls++; return response(); } };
    await assert.rejects(migrateExperimentSession(options), /unconfirmed/);
    assert.equal(pendingExperimentWrites(storage).length, 1);
    assert.equal(pendingExperimentWrites(storage)[0].path, "/auth/migrate-session");
    const reloaded = { ...options, transport: guardedTransport(storage).transport };
    await assert.rejects(migrateExperimentSession(reloaded), /unknown outcome/);
    await assert.rejects(clearLegacyExperimentCookie(reloaded), /unknown outcome/);
    assert.equal(calls, 1);
  }
});

test("a late migration body after timeout cannot acknowledge the request or clear the old cookie", async () => {
  const { transport, storage } = guardedTransport();
  let finishBody, signal, calls = 0;
  const body = new Promise(resolve => { finishBody = resolve; });
  await assert.rejects(migrateExperimentSession({ transport, locationLike: experiment, explicitIntent: true, timeoutMs: 5,
    fetchImpl: async (url, options) => {
      calls++; signal = options.signal;
      return { ok: true, status: 200, json: () => body };
    },
  }), /timed out/);
  assert.equal(signal.aborted, true);
  finishBody({ user: { id: "signed-in-user" } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(pendingExperimentWrites(storage).length, 1);
  assert.equal(pendingExperimentWrites(storage)[0].uncertain, true);
  assert.equal(calls, 1);
});

test("successful migration and 204 cleanup acknowledge their own journal entries", async () => {
  const { transport, storage } = guardedTransport();
  let calls = 0;
  assert.equal((await migrateExperimentSession({ transport, locationLike: experiment, explicitIntent: true,
    fetchImpl: async () => ++calls === 1 ? new Response('{"user":{"id":"signed-in-user"}}') : new Response(null, { status: 204 }),
  })).handled, true);
  assert.equal(calls, 2);
  assert.deepEqual(pendingExperimentWrites(storage), []);
});

test("actual app logout cleans the legacy cookie only after confirmed remote logout and preserves the local-only warning", async () => {
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const source = app.match(/async function handleSignOutButton\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source);
  for (const failure of [false, true]) {
    const calls = [], toasts = [], privateData = '{"layouts":["retained"]}';
    const localStorage = new MemoryStorage([["private-scope", privateData]]);
    const context = createContext({ currentUser: { id: "signed-in-user" }, appUnlocked: false, localStorage,
      isForcedOffline: () => false, isOfflineRememberedSession: () => false,
      openAuthDialog: () => assert.fail("unexpected sign-in dialog"), localText: value => value,
      askConfirmDialog: async () => true, updateSyncUi: () => {},
      apiFetch: async (path, options) => {
        calls.push(path); assert.equal(options.method, "POST");
        if (failure) throw new Error("Server unavailable");
      },
      clearLegacyExperimentCookie: async () => { calls.push("legacy-cleanup"); },
      clearOfflineRememberedSession: () => { calls.push("clear-remembered-session"); },
      setExplicitlySignedOut: value => localStorage.setItem("signed-out", value),
      activateLocalStorageScope: value => { calls.push(value); }, GUEST_STORAGE_SCOPE: "guest",
      resetGuestDemoScopeToCanonical: () => {}, enterSignedOutPublicMode: async () => {},
      experimentTransport: { experiment: true }, showToast: (message, kind) => toasts.push({ message, kind }),
    });
    await runInContext(`${source}\nhandleSignOutButton()`, context);
    assert.equal(context.currentUser, null);
    assert.equal(localStorage.getItem("signed-out"), "true");
    assert.equal(localStorage.getItem("private-scope"), privateData);
    assert.equal(calls[0], "/auth/logout");
    assert.equal(calls.includes("legacy-cleanup"), !failure);
    assert.equal(toasts.at(-1).kind, failure ? "warning" : "success");
    if (failure) assert.match(toasts.at(-1).message, /Server session revocation is not confirmed; local data was retained/);
  }
});
