import test from "node:test";
import assert from "node:assert/strict";
import {
  createExperimentTransport, readTransportSelection, saveTransportSelection, probeExperimentProxy,
  AUTO_TRANSPORT_RELEASE_ENABLED, EU_TRANSPORT_RELEASE_ENABLED, EXPERIMENT_FRONTEND_ORIGIN,
  EU_EXPERIMENT_API_BASE, EXPERIMENT_TRANSPORT_KEY, AMBIGUOUS_WRITE_KEY
} from "../../src/sync/experiment-transport.js";
import { EXPERIMENT_API_BASE } from "../../src/config/constants.js";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";
import { apiFetchRequest } from "../../src/sync/api-client.js";
import { bindExperimentTransportMenu } from "../../src/ui/experiment-transport-settings.js";
import { readFileSync } from "node:fs";

const locationLike = { origin: EXPERIMENT_FRONTEND_ORIGIN };
const descriptor = (gate = "enabled", identity = "bike-packing-experiment") => new Response(JSON.stringify({
  ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION, capabilities: REQUIRED_ADMIN_API_CAPABILITIES
}), { headers: { "X-Vniipo-Proxy-Target": identity, "X-Vniipo-Proxy-Write-Gate": gate } });
function fixture() {
  const values = new Map(), calls = [], state = { ru: "ok", eu: "ok" };
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i],
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.credentials, "omit"); assert.equal(options.method, "GET"); assert.equal(options.redirect, "error");
    assert.ok(url === `${EXPERIMENT_API_BASE}/bike-packing/capabilities` || url === `${EU_EXPERIMENT_API_BASE}/bike-packing/capabilities`);
    const behavior = url.startsWith(EU_EXPERIMENT_API_BASE) ? state.eu : state.ru;
    if (behavior === "network") throw TypeError("offline");
    if (behavior === "hang") return new Promise(() => {});
    if (behavior === "body-hang") return { ok: true, headers: new Headers(), json: () => new Promise(() => {}) };
    if (typeof behavior === "number") return new Response("unavailable", { status: behavior });
    if (behavior === "json") return new Response("not JSON");
    if (behavior === "contract") return Response.json({ ok: true, apiCompatibilityVersion: "wrong", capabilities: [] });
    if (behavior === "redirect") return { ok: true, redirected: true };
    return descriptor(behavior === "read-only" ? "read-only" : "enabled", behavior === "identity" ? "production" : "bike-packing-experiment");
  };
  const make = (options = {}) => createExperimentTransport({ locationLike, selection: "auto", euEnabled: true,
    autoEnabled: true, probeTimeoutMs: 15, storage, locks: { request: async (key, fn) => fn() }, fetchImpl, ...options });
  return { make, calls, state, values, storage, fetchImpl };
}

test("auto is the default preference; manual modes override it and apply only to a new transport", async () => {
  const f = fixture();
  assert.equal(readTransportSelection(f.storage), "auto");
  const auto = f.make(); await auto.prepare();
  saveTransportSelection("eu", { storage: f.storage, locationLike });
  assert.equal(auto.mode, "direct"); assert.equal(auto.selection, "auto");
  const manual = f.make({ selection: readTransportSelection(f.storage) }); await manual.prepare();
  assert.equal(manual.mode, "eu"); assert.equal(manual.automatic, false);
  const direct = f.make({ selection: "direct" }); f.state.ru = "network";
  const before = f.calls.length; await direct.prepare();
  assert.equal(f.calls.length, before, "manual Russian does not invoke the automatic chooser");
  assert.equal(direct.apiUrl("/auth/me"), `${EXPERIMENT_API_BASE}/auth/me`);
  for (const bad of ["ip", "https://evil.test", "__proto__"]) assert.throws(() => saveTransportSelection(bad, { storage: f.storage, locationLike }));
  f.storage.setItem(EXPERIMENT_TRANSPORT_KEY, "invalid"); assert.equal(readTransportSelection(f.storage), "auto");
});

test("parallel preparation checks RU once and pins the selected route for the tab", async () => {
  const f = fixture(), transport = f.make();
  assert.throws(() => transport.apiUrl("/auth/me"), /not verified/);
  await assert.rejects(transport.beginWrite("/bike-packing/lists", "POST"), /not verified/);
  await Promise.all([transport.prepare(), transport.prepare(), transport.prepare()]);
  assert.equal(f.calls.length, 1); assert.equal(transport.mode, "direct");
  f.state.ru = "network"; await transport.prepare();
  assert.equal(f.calls.length, 1, "no per-photo probes or mid-flight failover");
});

test("only RU reachability failures permit an anonymous EU probe; timeouts include response body", async () => {
  for (const failure of ["network", "hang", "body-hang", 408, 500, 502, 503, 504]) {
    const f = fixture(); f.state.ru = failure;
    const transport = f.make(); await transport.prepare();
    assert.equal(transport.mode, "eu");
    assert.deepEqual(f.calls.map(call => call.url), [
      `${EXPERIMENT_API_BASE}/bike-packing/capabilities`, `${EU_EXPERIMENT_API_BASE}/bike-packing/capabilities`
    ]);
  }
});

test("auth, permission, conflict, rate limits, redirects and bad contracts never trigger alternate routing", async () => {
  for (const failure of [401, 403, 404, 409, 429, "json", "contract", "redirect"]) {
    const f = fixture(); f.state.ru = failure;
    const transport = f.make(); await assert.rejects(transport.prepare());
    assert.equal(f.calls.length, 1); assert.equal(transport.ready, false);
  }
});

test("EU still requires its release gate, exact identity, compatible API and open write gate", async () => {
  for (const failure of ["read-only", "identity", "contract", "network"]) {
    const f = fixture(); f.state.ru = "network"; f.state.eu = failure;
    const transport = f.make(); await assert.rejects(transport.prepare());
    assert.equal(transport.ready, false);
  }
  const f = fixture(); f.state.ru = "network";
  await assert.rejects(f.make({ euEnabled: false }).prepare(), /not approved/);
  assert.equal(f.calls.length, 1);
  assert.equal(AUTO_TRANSPORT_RELEASE_ENABLED, false); assert.equal(EU_TRANSPORT_RELEASE_ENABLED, false);
  const gated = f.make({ autoEnabled: false, euEnabled: false }); await gated.prepare();
  assert.equal(gated.mode, "direct"); assert.equal(f.calls.length, 1);
});

test("both unavailable leaves the queue untouched and permits a later fresh preflight, not a request replay", async () => {
  const f = fixture(); f.state.ru = "network"; f.state.eu = "network";
  f.storage.setItem("local-state", "unsent edits");
  const transport = f.make(); await assert.rejects(transport.prepare());
  assert.equal(f.values.size, 1); assert.equal(f.storage.getItem("local-state"), "unsent edits");
  f.state.ru = "ok"; await transport.prepare();
  assert.equal(transport.mode, "direct"); assert.equal(f.calls.length, 3);
});

test("pending writes pin their previous route; mixed or corrupt journals stop automatic selection", async () => {
  for (const prior of ["direct", "eu"]) {
    const f = fixture(), original = f.make({ selection: prior }); await original.prepare();
    const id = await original.beginWrite("/bike-packing/lists", "POST", "{}");
    original.noteFailure(Error("lost ACK"), "/bike-packing/lists", "POST", id);
    f.calls.length = 0;
    const restored = f.make(); await restored.prepare();
    assert.equal(restored.mode, prior); assert.equal(restored.uncertainWrite.id, id);
    assert.equal(f.calls.length, 1);
    assert.throws(() => restored.assertWritable("/bike-packing/lists", "POST"), /unknown outcome/);
    if (prior === "direct") {
      f.state.ru = "network"; f.calls.length = 0;
      await assert.rejects(f.make().prepare());
      assert.equal(f.calls.length, 1, "lost ACK never authorizes EU failover");
    }
    f.storage.setItem(`${AMBIGUOUS_WRITE_KEY}:broken`, "broken JSON");
    f.calls.length = 0; await assert.rejects(f.make().prepare(), { isAmbiguousMutation: true });
    assert.equal(f.calls.length, 0);
  }
});

test("another tab's pending RU write during the EU probe cancels automatic switching", async () => {
  const f = fixture(); f.state.ru = "network";
  const original = f.make({ selection: "direct" });
  const transport = f.make({ fetchImpl: async (url, options) => {
    if (url.startsWith(EU_EXPERIMENT_API_BASE)) await original.beginWrite("/bike-packing/lists", "POST", "{}");
    return f.fetchImpl(url, options);
  } });
  await assert.rejects(transport.prepare(), { isAmbiguousMutation: true });
  assert.equal(transport.ready, false); assert.equal(transport.writes.length, 1);
});

test("a mutation response loss does not change the chosen address or send another mutation", async () => {
  const f = fixture(), transport = f.make(), originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  const writes = [];
  globalThis.fetch = async (url, options) => { writes.push({ url, options }); throw Error("lost ACK"); };
  try {
    await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST", body: "{}" }, { transport }), { isAmbiguousMutation: true });
    await assert.rejects(apiFetchRequest("/bike-packing/lists", { method: "POST", body: "{}" }, { transport }), { isAmbiguousMutation: true });
    assert.equal(writes.length, 1); assert.equal(f.calls.length, 1); assert.equal(transport.mode, "direct");
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});

test("forced offline never starts route probes and IP remains an anonymous diagnostic only", async () => {
  const f = fixture();
  await assert.rejects(apiFetchRequest("/auth/me", {}, { transport: f.make(), isForcedOffline: () => true }));
  assert.equal(f.calls.length, 0);
  const result = await probeExperimentProxy({ target: "ip", fetchImpl: async (url, options) => {
    assert.equal(options.credentials, "omit"); return descriptor();
  } });
  assert.equal(result.usable, false);
});

test("top-menu entry is guest-accessible in Experiment only and uses the shared modal controller", () => {
  const index = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
  const button = index.match(/<button id="apiRouteMenuBtn"[^>]+>/)[0];
  assert.doesNotMatch(button, /auth-required/); assert.match(button, /hidden/);
  assert.match(app, /bindExperimentTransportMenu\(\{ button: refs\.apiRouteMenuBtn, dialog: refs\.apiRouteDialog,[^]*?openModalDialog \}\)/);
  for (const origin of ["https://vniipo-help.ru", "https://evil.test", "http://experiment.vniipo-help.ru"]) {
    const node = { hidden: false, addEventListener: () => { throw Error("must not bind outside Experiment"); } };
    bindExperimentTransportMenu({ button: node, dialog: {}, locationLike: { origin } });
    assert.equal(node.hidden, true);
  }
});
