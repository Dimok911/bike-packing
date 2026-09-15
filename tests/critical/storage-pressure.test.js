import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./helpers.js";
import { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY as cacheKey } from "../../src/config/constants.js";
import { canPersistOptionalStorage, setRequiredStorageItem } from "../../src/utils/storage-pressure.js";
import { createPublicTemplateOfflineCache, normalizePublicTemplateOfflineCache, savePublicTemplateOfflineCache,
  PUBLIC_TEMPLATE_OFFLINE_CACHE_MAX_BYTES as maxBytes } from "../../src/public/public-template-offline-cache.js";

const quota = name => new DOMException("Synthetic full storage", name || "QuotaExceededError");
const cache = () => createPublicTemplateOfflineCache({ savedAt: "2026-01-01", demoTemplates: [
  { id: "public-demo", language: "ru", name: "Демо" }], demoPayloadsByTemplateId: {
  "public-demo": { items: {}, containers: {}, layouts: {}, note: "" }
} });

test("ordinary required writes do not read or evict anything", () => {
  const calls = [], storage = { setItem: (...args) => calls.push(args),
    getItem: () => assert.fail("unexpected read"), removeItem: () => assert.fail("unexpected eviction") };
  setRequiredStorageItem(storage, "action:original-id", "original bytes");
  assert.deepEqual(calls, [["action:original-id", "original bytes"]]);
  assert.equal(canPersistOptionalStorage(storage), true);
});

for (const name of ["QuotaExceededError", "NS_ERROR_DOM_QUOTA_REACHED"]) test(`${name} evicts only the public cache and retries exact bytes`, () => {
  const storage = new MemoryStorage([[cacheKey, "renewable"], ["private", "local"], ["archive", "original"], ["admin-draft", "draft"]]);
  const set = storage.setItem.bind(storage), calls = [], removals = [];
  storage.setItem = (key, raw) => { calls.push([key, raw]); if (storage.getItem(cacheKey) !== null) throw quota(name); set(key, raw); };
  storage.removeItem = key => { removals.push(key); storage.map.delete(key); };
  setRequiredStorageItem(storage, "action:original-id", '{"id":"original-id","payload":"unchanged"}');
  assert.equal(calls.length, 2); assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(removals, [cacheKey]);
  for (const [key, value] of [["private", "local"], ["archive", "original"], ["admin-draft", "draft"]]) assert.equal(storage.getItem(key), value);
  assert.equal(canPersistOptionalStorage(storage), false);
  assert.equal(canPersistOptionalStorage(new MemoryStorage()), true);
  assert.equal(savePublicTemplateOfflineCache(cacheKey, cache(), { storage }), false);
  assert.equal(calls.length, 2, "background public cache cannot immediately refill the released space");
});

for (const failure of ["absent", "read-throws", "remove-throws", "remove-noop", "verification-throws"]) test(`${failure} preserves original quota without a required retry`, () => {
  const original = quota(), storage = new MemoryStorage(failure === "absent" ? [] : [[cacheKey, "renewable"]]);
  let calls = 0, reads = 0;
  const get = storage.getItem.bind(storage), remove = storage.removeItem.bind(storage);
  storage.setItem = () => { calls++; throw original; };
  storage.getItem = key => { reads++; if (failure === "read-throws" || failure === "verification-throws" && reads === 2) throw Error("read failed"); return get(key); };
  storage.removeItem = key => { if (failure === "remove-throws") throw Error("remove failed"); if (failure !== "remove-noop") remove(key); };
  assert.throws(() => setRequiredStorageItem(storage, "action", "same"), error => error === original);
  assert.equal(calls, 1); assert.equal(canPersistOptionalStorage(storage), false);
});

test("non-quota exceptions and writes targeting the cache never trigger eviction", () => {
  for (const [target, error] of [["action", Error("quota")], ["action", new DOMException("Blocked", "SecurityError")], [cacheKey, quota()]]) {
    const storage = { setItem: () => { throw error; }, getItem: () => assert.fail("unexpected read"), removeItem: () => assert.fail("unexpected removal") };
    assert.throws(() => setRequiredStorageItem(storage, target, "bytes"), value => value === error);
    assert.equal(canPersistOptionalStorage(storage), target !== cacheKey);
  }
});

test("persistent quota retries once; a later independently restored cache may be reclaimed for the next write", () => {
  const storage = new MemoryStorage([[cacheKey, "renewable"]]), errors = [quota(), quota()];
  let calls = 0;
  storage.setItem = () => { throw errors[Math.min(calls++, 1)]; };
  assert.throws(() => setRequiredStorageItem(storage, "archive", "exact"), error => error === errors[1]);
  assert.equal(calls, 2); assert.equal(storage.getItem(cacheKey), null);
  storage.map.set(cacheKey, "restored by another tab");
  const pairs = [];
  storage.setItem = (key, value) => { pairs.push([key, value]); if (storage.getItem(cacheKey) !== null) throw quota(); storage.map.set(key, value); };
  setRequiredStorageItem(storage, "completion", "same-completion");
  assert.deepEqual(pairs, [["completion", "same-completion"], ["completion", "same-completion"]]);
});

test("optional cache cap counts UTF-16 bytes and never overwrites a retained small cache with a large copy", () => {
  const storage = new MemoryStorage(), source = cache();
  const baseLength = JSON.stringify(normalizePublicTemplateOfflineCache(source)).length;
  source.demoPayloadsByTemplateId["public-demo"].note = "я".repeat(maxBytes / 2 - baseLength);
  const before = structuredClone(source);
  assert.equal(JSON.stringify(normalizePublicTemplateOfflineCache(source)).length * 2, maxBytes);
  assert.equal(savePublicTemplateOfflineCache(cacheKey, source, { storage }), true);
  const accepted = storage.getItem(cacheKey);
  source.demoPayloadsByTemplateId["public-demo"].note += "я";
  assert.equal(savePublicTemplateOfflineCache(cacheKey, source, { storage }), false);
  assert.equal(storage.getItem(cacheKey), accepted);
  assert.equal(canPersistOptionalStorage(storage), true);
  source.demoPayloadsByTemplateId["public-demo"].note = before.demoPayloadsByTemplateId["public-demo"].note;
  assert.deepEqual(source, before);
});

test("optional quota suppresses future optional writes only for that storage instance", () => {
  const storage = new MemoryStorage(), other = new MemoryStorage(); let calls = 0;
  storage.setItem = () => { calls++; throw quota(); };
  assert.equal(savePublicTemplateOfflineCache(cacheKey, cache(), { storage }), false);
  assert.equal(savePublicTemplateOfflineCache(cacheKey, cache(), { storage }), false);
  assert.equal(calls, 1); assert.equal(canPersistOptionalStorage(storage), false);
  assert.equal(savePublicTemplateOfflineCache(cacheKey, cache(), { storage: other }), true);
});
