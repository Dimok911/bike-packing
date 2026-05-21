import test from "node:test";
import assert from "node:assert/strict";
import { photoRemoteSrc } from "../../src/sync/photos.js";
import { MemoryStorage } from "./helpers.js";

function setNavigatorOnline(value) {
  Object.defineProperty(globalThis, "navigator", {
    value: { onLine: value },
    configurable: true
  });
}

test("CRITICAL offline-photos: offline photos keep remote URLs as a fallback", () => {
  setNavigatorOnline(false);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    localId: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    url: "https://api.example.test/file.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});

test("CRITICAL offline-photos: local-capable photos still expose remote fallback online", () => {
  setNavigatorOnline(true);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});

test("CRITICAL offline-photos: online photos may use versioned remote URLs", () => {
  setNavigatorOnline(true);
  globalThis.localStorage = new MemoryStorage();

  const src = photoRemoteSrc({
    id: "photo-1",
    thumbUrl: "https://api.example.test/thumb.jpg",
    updatedAt: "2026-05-21T00:00:00.000Z"
  });

  assert.equal(src, "https://api.example.test/thumb.jpg?v=2026-05-21T00%3A00%3A00.000Z");
});
