import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_EMAIL_KEY,
  AUTH_STORAGE_SCOPE_KEY,
  STORAGE_KEY,
  SYNC_META_KEY
} from "../../src/config/constants.js";
import {
  buildRememberedOfflineUser,
  rememberAuthenticatedUserInStorage
} from "../../src/storage/auth-scope.js";
import { scopedLocalStorageKey } from "../../src/storage/scope.js";
import { MemoryStorage } from "./helpers.js";

test("CRITICAL offline-auth-scope: exact remembered storage scope wins", () => {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_SCOPE_KEY, "id:user-1");
  storage.setItem(scopedLocalStorageKey(STORAGE_KEY, "id:user-1"), "{}");

  const remembered = buildRememberedOfflineUser({ storage });

  assert.equal(remembered.scopeKey, "id:user-1");
  assert.equal(remembered.offlineRemembered, true);
});

test("CRITICAL offline-auth-scope: explicit sign-out disables private offline access", () => {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_STORAGE_SCOPE_KEY, "id:user-1");
  storage.setItem(scopedLocalStorageKey(STORAGE_KEY, "id:user-1"), "{}");

  assert.equal(buildRememberedOfflineUser({ storage, signedOut: true }), null);
});

test("CRITICAL offline-auth-scope: legacy email metadata can recover an id scope", () => {
  const storage = new MemoryStorage();
  storage.setItem(AUTH_EMAIL_KEY, "person@example.com");
  storage.setItem(scopedLocalStorageKey(STORAGE_KEY, "id:server-user"), "{}");
  storage.setItem(
    scopedLocalStorageKey(SYNC_META_KEY, "id:server-user"),
    JSON.stringify({ accountEmail: "person@example.com" })
  );

  const remembered = buildRememberedOfflineUser({ storage });

  assert.equal(remembered.email, "person@example.com");
  assert.equal(remembered.scopeKey, "id:server-user");
});

test("CRITICAL offline-auth-scope: ambiguous private scopes do not guess without identity", () => {
  const storage = new MemoryStorage();
  storage.setItem(scopedLocalStorageKey(STORAGE_KEY, "id:user-1"), "{}");
  storage.setItem(scopedLocalStorageKey(STORAGE_KEY, "id:user-2"), "{}");

  assert.equal(buildRememberedOfflineUser({ storage }), null);
});

test("CRITICAL offline-auth-scope: successful auth persists exact scope", () => {
  const storage = new MemoryStorage();

  rememberAuthenticatedUserInStorage({ id: "USER 1", email: "Person@Example.com" }, storage);

  assert.equal(storage.getItem(AUTH_STORAGE_SCOPE_KEY), "id:user_1");
  assert.equal(storage.getItem(AUTH_EMAIL_KEY), "person@example.com");
});
