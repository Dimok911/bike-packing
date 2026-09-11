import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const names = ["removeScopedLocalValue", "writeLargeScopedLocalValue", "hasOwnedAdminTemplatePhotoEditor",
  "persistStateSnapshot", "saveBaseState", "loadRecoverySnapshots", "saveRecoverySnapshot"];
const source = names.map(name => {
  const match = app.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual application function ${name} is available`);
  return match[0];
}).join("\n");

function fixture({ enabled = true, actor = "admin-a", personal = false } = {}) {
  const state = { items: { personal: { id: "personal", name: "Current personal value" } }, containers: {},
    layouts: { private: { id: "private" }, admin: { id: "admin", adminDemo: true, adminDemoListId: "public-demo-state-ui",
      adminCausalSource: { version: 1, binding: { environment: "bike-packing-experiment", actorId: actor,
        listId: "public-demo-state-ui", itemKey: "demo-state:ui" }, base: { stateRevision: 7 } } } } };
  const originalRecovery = JSON.stringify([{ reason: "Original recovery", payload: { exact: [3, 1, 2] } }]);
  const values = new Map([["base", "Original private baseline"], ["recovery", originalRecovery], ["mirror", "Previous editor"]]);
  const controls = { failedKeys: new Set(), writes: [], removed: [], captured: [] };
  const deps = { state, ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: enabled, localStorageScopeKey: "id:admin-a",
    STORAGE_KEY: "mirror", BASE_STATE_KEY: "base", RECOVERY_STATE_KEY: "recovery", RECOVERY_STATE_MAX: 10,
    scopedLocalStorageKey: key => key, localStorage: { getItem: key => values.get(key) ?? null,
      removeItem: key => { controls.removed.push(key); values.delete(key); } },
    safeSetLocalStorage: (key, value) => {
      controls.writes.push({ key, value }); if (controls.failedKeys.has(key)) return false;
      values.set(key, value); return true;
    }, personalSavePilotEnabled: () => personal, personalSaveRecovery: { assertRunning() {} }, applyingRemoteState: false,
    capturePersonalSaveIntent: snapshot => { controls.captured.push(structuredClone(snapshot)); return { durable: true }; },
    hasPendingPersonalSave: () => false, isMeaningfulPackingState: () => true, nowIso: () => "2026-09-11T00:00:00Z",
    stateStats: () => ({ items: 1 }) };
  const actual = new Function(...Object.keys(deps), `${source}\nreturn { ${names.join(", ")} };`)(...Object.values(deps));
  return { state, values, controls, actual, originalRecovery };
}

test("actual mixed editor mirror quota retains private baseline and recovery and reports failure", () => {
  const f = fixture(); f.controls.failedKeys.add("mirror");
  assert.equal(f.actual.persistStateSnapshot(), false);
  assert.deepEqual(f.controls.removed, []);
  assert.equal(f.values.get("base"), "Original private baseline");
  assert.equal(f.values.get("recovery"), f.originalRecovery);
  assert.equal(f.values.get("mirror"), "Previous editor");
  assert.equal(f.controls.writes[0].value, JSON.stringify(f.state));
});

test("actual remote baseline quota cannot evict the private recovery alongside an admin photo editor", () => {
  const f = fixture(); f.controls.failedKeys.add("base");
  assert.equal(f.actual.saveBaseState({ items: { current: { id: "current" } } }), false);
  assert.deepEqual(f.controls.removed, []);
  assert.equal(f.values.get("base"), "Original private baseline");
  assert.equal(f.values.get("recovery"), f.originalRecovery);
});

test("actual pre-replacement recovery quota keeps its earlier snapshots instead of deleting them", () => {
  const f = fixture(); f.controls.failedKeys.add("recovery");
  f.actual.saveRecoverySnapshot("before-replace");
  assert.deepEqual(f.controls.removed, []);
  assert.equal(f.values.get("recovery"), f.originalRecovery);
  assert.equal(f.values.get("base"), "Original private baseline");
});

test("admin photo protection still saves current personal data and legitimate new baseline and recovery", () => {
  const f = fixture(), baseline = { currentPersonalRevision: 12 };
  assert.equal(f.actual.persistStateSnapshot(), true);
  assert.deepEqual(JSON.parse(f.values.get("mirror")), f.state);
  assert.equal(f.actual.saveBaseState(baseline), true);
  assert.deepEqual(JSON.parse(f.values.get("base")), baseline);
  f.actual.saveRecoverySnapshot("before-replace");
  const saved = JSON.parse(f.values.get("recovery"));
  assert.deepEqual(saved[0].payload, f.state);
  assert.equal(saved[1].reason, "Original recovery");
  assert.deepEqual(f.controls.removed, []);
});

test("an already durable personal action remains authoritative when its optional mirror is full", () => {
  const f = fixture({ personal: true }); f.controls.failedKeys.add("mirror");
  assert.equal(f.actual.persistStateSnapshot(), true);
  assert.deepEqual(f.controls.captured, [f.state]);
  assert.deepEqual(f.controls.removed, []);
  assert.equal(f.values.get("recovery"), f.originalRecovery);
});

test("photo storage protection stays gated and recognizes only the current account", () => {
  for (const options of [{ enabled: false }, { actor: "other-admin" }]) {
    const f = fixture(options);
    assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(f.state), false);
  }
  const f = fixture({ enabled: false }); f.controls.failedKeys.add("mirror");
  assert.equal(f.actual.persistStateSnapshot(), false);
  assert.deepEqual(f.controls.removed, ["recovery", "base"]);
});
