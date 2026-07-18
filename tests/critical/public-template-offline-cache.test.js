import test from "node:test";
import assert from "node:assert/strict";
import { MemoryStorage } from "./helpers.js";
import {
  createPublicTemplateOfflineCache,
  hydratePublicTemplateOfflineCache,
  loadPublicTemplateOfflineCache,
  savePublicTemplateOfflineCache
} from "../../src/public/public-template-offline-cache.js";

const STORAGE_KEY = "public-template-cache";

function payload(layoutId, name) {
  return {
    activeLayoutId: layoutId,
    layouts: { [layoutId]: { id: layoutId, name } },
    items: {},
    containers: {}
  };
}

test("public template cache is global across guest and user storage scopes", () => {
  const storage = new MemoryStorage();
  const demoPayload = payload("demo-layout", "Demo");
  const sharedPayload = payload("shared-layout", "Shared");
  const cache = createPublicTemplateOfflineCache({
    demoTemplates: [{ id: "public-demo-state-ru", name: "Демо", language: "ru" }],
    demoPayloadsByLanguage: { ru: demoPayload },
    demoPayloadsByTemplateId: { "public-demo-state-ru": demoPayload },
    sharedLayoutsByLanguage: {
      ru: [{ id: "shared-one", name: "Общий", language: "ru", statePayload: sharedPayload }]
    },
    demoTemplateIds: ["public-demo-state-ru"],
    sharedLayoutIds: ["shared-one"]
  });

  assert.equal(savePublicTemplateOfflineCache(STORAGE_KEY, cache, { storage }), true);
  storage.setItem("guest:private-state", "guest data");
  storage.setItem("user-42:private-state", "user data");

  const guestCache = loadPublicTemplateOfflineCache(STORAGE_KEY, { storage });
  const userCache = loadPublicTemplateOfflineCache(STORAGE_KEY, { storage });
  assert.deepEqual(userCache, guestCache);
  assert.equal(guestCache.demoPayloadsByTemplateId["public-demo-state-ru"].layouts["demo-layout"].name, "Demo");
  assert.equal(guestCache.sharedTemplates[0].statePayload.layouts["shared-layout"].name, "Shared");
});

test("cached demo and shared templates hydrate as confirmed read-only runtime data", () => {
  const demoPayload = payload("demo-layout", "Demo");
  const sharedPayload = payload("shared-layout", "Shared");
  const cached = createPublicTemplateOfflineCache({
    demoTemplates: [{ id: "public-demo-state-en", name: "Demo", language: "en" }],
    demoPayloadsByTemplateId: { "public-demo-state-en": demoPayload },
    sharedLayoutsByLanguage: {
      en: [{ id: "shared-one", name: "Shared", language: "en", statePayload: sharedPayload }]
    }
  });
  const demoPayloads = new Map();
  const sharedRuntime = [];
  const hydrated = hydratePublicTemplateOfflineCache(cached, {
    demoTemplates: [],
    sharedTemplates: [],
    mergeDemoTemplates: (_current, incoming) => incoming,
    mergeSharedTemplates: (_current, incoming) => incoming,
    setDemoPayload: (_language, sourcePayload, { listId = "" } = {}) => demoPayloads.set(listId, sourcePayload),
    upsertSharedTemplate: (entry) => sharedRuntime.push(entry)
  });

  assert.equal(hydrated.hydrated, true);
  assert.equal(hydrated.demoTemplates[0].serverConfirmed, true);
  assert.equal(hydrated.sharedTemplates[0].serverConfirmed, true);
  assert.equal(demoPayloads.get("public-demo-state-en"), demoPayload);
  assert.equal(sharedRuntime[0].statePayload, sharedPayload);
});

test("public cache excludes private fields, malformed payloads, and stale catalog ids", () => {
  const validPayload = payload("layout", "Valid");
  const cache = createPublicTemplateOfflineCache({
    demoTemplates: [
      { id: "keep-demo", name: "Keep", language: "en", ownerId: "private-owner" },
      { id: "stale-demo", name: "Stale", language: "en" }
    ],
    demoPayloadsByTemplateId: { "keep-demo": validPayload, "stale-demo": validPayload },
    sharedLayoutsByLanguage: {
      en: [
        { id: "keep-shared", name: "Keep", language: "en", statePayload: validPayload, privateToken: "secret" },
        { id: "broken", name: "Broken", language: "en", statePayload: { layouts: {} } },
        { id: "stale-shared", name: "Stale", language: "en", statePayload: validPayload }
      ]
    },
    demoTemplateIds: ["keep-demo"],
    sharedLayoutIds: ["keep-shared"]
  });

  assert.deepEqual(cache.demoTemplates.map((entry) => entry.id), ["keep-demo"]);
  assert.deepEqual(Object.keys(cache.demoPayloadsByTemplateId), ["keep-demo"]);
  assert.deepEqual(cache.sharedTemplates.map((entry) => entry.id), ["keep-shared"]);
  assert.equal("ownerId" in cache.demoTemplates[0], false);
  assert.equal("privateToken" in cache.sharedTemplates[0], false);
});

test("an authoritative empty public catalog clears cached template rows", () => {
  const validPayload = payload("layout", "Stale");
  const cache = createPublicTemplateOfflineCache({
    demoTemplates: [{ id: "stale-demo", name: "Stale", language: "en" }],
    demoPayloadsByTemplateId: { "stale-demo": validPayload },
    sharedLayoutsByLanguage: {
      en: [{ id: "stale-shared", name: "Stale", language: "en", statePayload: validPayload }]
    },
    demoTemplateIds: [],
    sharedLayoutIds: []
  });

  assert.deepEqual(cache.demoTemplates, []);
  assert.deepEqual(cache.demoPayloadsByTemplateId, {});
  assert.deepEqual(cache.sharedTemplates, []);
});
