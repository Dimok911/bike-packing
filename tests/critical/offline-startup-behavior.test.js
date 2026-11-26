import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { createConnectivityState } from "../../src/sync/connectivity-state.js";
import { resolveSyncVisualState } from "../../src/ui/sync-visual-state.js";

const source = readFileSync(new URL("../../sw.js", import.meta.url), "utf8");
const name = source.match(/const CACHE_NAME = "([^"]+)"/)[1];
const version = name.match(/v(\d+)$/)[1];
const scope = "https://example.test/bike-packing/";
const html = `<script src="./app.js?v=${version}"></script><link href="./styles.css?v=${version}">`;

function worker({ fetchImpl = () => Promise.reject(new TypeError("offline")), cached = html } = {}) {
  const stores = new Map();
  const listeners = {};
  const timers = new Map();
  const url = (key) => new URL(key?.url || key, scope).href;
  function store(key) {
    if (!stores.has(key)) stores.set(key, new Map());
    const entries = stores.get(key);
    return {
      match: async (key) => entries.get(url(key))?.clone(),
      put: async (key, response) => entries.set(url(key), response.clone()),
      keys: async () => [...entries.keys()].map((url) => ({ url }))
    };
  }
  if (cached !== null) stores.set(name, new Map([[url("./index.html"), new Response(cached)]]));
  const context = vm.createContext({
    self: { registration: { scope }, location: new URL(scope), clients: { claim: async () => {} }, addEventListener: (event, fn) => { listeners[event] = fn; } },
    caches: { open: async (key) => store(key), keys: async () => [...stores.keys()], delete: async (key) => stores.delete(key) },
    fetch: fetchImpl, Response, URL, AbortController,
    setTimeout: (fn, ms) => { const token = {}; timers.set(token, { fn, ms }); return token; },
    clearTimeout: (token) => timers.delete(token)
  });
  vm.runInContext(source, context);
  return { stores, timers, store,
    navigate: () => context.serveAppShell({ url: `${scope}?layout=private` }),
    activate: () => new Promise((resolve, reject) => listeners.activate({ waitUntil: (promise) => promise.then(resolve, reject) }))
  };
}

test("saved shell opens within deadline even when fetch ignores abort", async () => {
  const w = worker({ fetchImpl: () => new Promise(() => {}) });
  const pending = w.navigate();
  await new Promise(setImmediate);
  const timer = [...w.timers.values()][0];
  assert.equal(timer.ms, 1500);
  timer.fn();
  assert.equal(await (await pending).text(), html);
  assert.equal(w.timers.size, 0);
});

test("offline and server errors both fall back to saved shell", async () => {
  for (const fetchImpl of [() => Promise.reject(new TypeError("offline")), async () => new Response("unavailable", { status: 503 })]) {
    assert.equal(await (await worker({ fetchImpl }).navigate()).text(), html);
  }
});

test("new release HTML cannot replace a worker's matching saved shell", async () => {
  const w = worker({ fetchImpl: async () => new Response(html.replaceAll(version, "999999")) });
  assert.equal(await (await w.navigate()).text(), html);
  assert.equal(await (await w.store(name).match("./index.html")).text(), html);
});

test("matching online shell refreshes canonical entries without private query URLs", async () => {
  const updated = `${html}<p>updated</p>`;
  const w = worker({ fetchImpl: async () => new Response(updated) });
  assert.equal(await (await w.navigate()).text(), updated);
  assert.deepEqual([...w.stores.get(name).keys()].sort(), [scope, `${scope}index.html`]);
  assert.equal(await (await w.store(name).match("./index.html")).text(), updated);
});

test("uncached offline visit explains the need for a first online visit", async () => {
  const response = await worker({ cached: null }).navigate();
  assert.equal(response.status, 503);
  assert.match(await response.text(), /Open it once with internet/);
});

test("activation only retires caches belonging entirely to this app scope", async () => {
  const w = worker();
  await w.store("bike-packing-prototype-v1").put("./index.html", new Response("old"));
  await w.store("other-app").put("./index.html", new Response("other"));
  await w.store("bike-packing-prototype-v2").put("https://example.test/experiment/index.html", new Response("experiment"));
  await w.store("bike-packing-prototype-v3").put("./index.html", new Response("mixed"));
  await w.store("bike-packing-prototype-v3").put("https://example.test/shared-ui/runtime.js", new Response("shared"));
  await w.activate();
  assert.equal(w.stores.has("bike-packing-prototype-v1"), false);
  for (const key of [name, "other-app", "bike-packing-prototype-v2", "bike-packing-prototype-v3"]) assert.equal(w.stores.has(key), true);
});

test("successful API overrides a false browser offline hint", () => {
  const state = createConnectivityState({ online: false });
  assert.equal(state.current(), "offline");
  state.observe(state.begin(), true);
  assert.equal(state.current(), "connected");
});

test("background failure shows offline; online event waits for an actual response", () => {
  const state = createConnectivityState();
  state.observe(state.begin(), false);
  assert.equal(state.current(), "offline");
  assert.equal(resolveSyncVisualState({ loggedIn: true, networkOffline: true }), "offline");
  state.browserChanged(true);
  assert.equal(state.current(), "checking");
  state.observe(state.begin(), true);
  assert.equal(state.current(), "connected");
});

test("stale responses cannot overwrite later network transitions or observations", () => {
  const state = createConnectivityState();
  const stale = state.begin();
  state.browserChanged(false);
  state.observe(stale, true);
  assert.equal(state.current(), "offline");
  const failure = state.begin();
  state.observe(state.begin(), true);
  state.observe(failure, false);
  assert.equal(state.current(), "connected");
});
