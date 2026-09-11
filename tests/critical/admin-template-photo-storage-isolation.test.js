import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const names = ["removeScopedLocalValue", "writeLargeScopedLocalValue", "adminTemplatePhotoMechanismEnabled", "hasOwnedAdminTemplatePhotoEditor",
  "persistStateSnapshot", "saveBaseState", "loadRecoverySnapshots", "saveRecoverySnapshot"];
const source = names.map(name => {
  const match = app.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `Actual application function ${name} is available`);
  return match[0];
}).join("\n");

function fixture({ enabled = true, editEnabled = false, actor = "admin-a", personal = false, pending = null } = {}) {
  const state = { items: { personal: { id: "personal", name: "Current personal value" } }, containers: {},
    layouts: { private: { id: "private" }, admin: { id: "admin", adminDemo: true, adminDemoListId: "public-demo-state-ui",
      adminCausalSource: { version: 1, binding: { environment: "bike-packing-experiment", actorId: actor,
        listId: "public-demo-state-ui", itemKey: "demo-state:ui" }, base: { stateRevision: 7 } } } } };
  if (pending) {
    const id = "c89b223d-02c8-4f86-86bd-c2387db7ec51";
    Object.assign(state.layouts.admin.adminCausalSource, { base: { operationId: id }, planId: id,
      [pending === "edit" ? "photoEditPending" : "photoAppendPending"]: id });
  }
  const originalRecovery = JSON.stringify([{ reason: "Original recovery", payload: { exact: [3, 1, 2] } }]);
  const values = new Map([["base", "Original private baseline"], ["recovery", originalRecovery], ["mirror", "Previous editor"]]);
  const controls = { failedKeys: new Set(), writes: [], removed: [], captured: [] };
  const deps = { state, ADMIN_TEMPLATE_PHOTO_APPEND_ENABLED: enabled, ADMIN_TEMPLATE_PHOTO_EDIT_ENABLED: editEnabled, localStorageScopeKey: "id:admin-a",
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

test("edit-only protection retains private recovery and baseline when any editor write exceeds quota", () => {
  for (const key of ["mirror", "base", "recovery"]) {
    const f = fixture({ enabled: false, editEnabled: true }), original = new Map(f.values);
    assert.equal(f.actual.adminTemplatePhotoMechanismEnabled(), true);
    assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(f.state), true);
    f.controls.failedKeys.add(key);
    if (key === "mirror") assert.equal(f.actual.persistStateSnapshot(), false);
    if (key === "base") assert.equal(f.actual.saveBaseState({ revision: 8 }), false);
    if (key === "recovery") f.actual.saveRecoverySnapshot("before-edit-application");
    assert.deepEqual(f.controls.removed, []); assert.deepEqual(f.values, original);
  }
});

test("cold pending append/edit namespaces keep quota protection while both new-action gates are OFF", () => {
  for (const pending of ["append", "edit"]) for (const key of ["mirror", "base", "recovery"]) {
    const f = fixture({ enabled: false, editEnabled: false, pending });
    const coldState = JSON.parse(JSON.stringify(f.state)), original = new Map(f.values);
    assert.equal(f.actual.adminTemplatePhotoMechanismEnabled(), false);
    assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(coldState), true, `${pending}: persisted action still owns recovery`);
    f.controls.failedKeys.add(key);
    if (key === "mirror") assert.equal(f.actual.persistStateSnapshot(coldState), false);
    if (key === "base") assert.equal(f.actual.saveBaseState({ revision: 8 }), false);
    if (key === "recovery") f.actual.saveRecoverySnapshot("before-recovery");
    assert.deepEqual(f.controls.removed, [], `${pending}/${key}: quota must not erase another journal`);
    assert.deepEqual(f.values, original);
  }
});

test("edit-only and OFF-pending protection retain account isolation", () => {
  for (const options of [{ enabled: false, editEnabled: true }, { enabled: false, pending: "edit" }, { enabled: false, pending: "append" }]) {
    const f = fixture({ ...options, actor: "other-admin" });
    assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(f.state), false);
  }
});

test("a confirmed photo owner map still protects its recovery after both gates are disabled", () => {
  const f = fixture({ enabled: false }), original = new Map(f.values);
  f.state.layouts.admin.adminCausalSource.photoOwnerMap = { version: 1, layoutId: "admin", stateRevision: 7,
    owners: [{ type: "items", localId: "local-photo-owner", serverId: "server-photo-owner" }] };
  f.controls.failedKeys.add("mirror");
  assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(JSON.parse(JSON.stringify(f.state))), true);
  assert.equal(f.actual.persistStateSnapshot(), false); assert.deepEqual(f.controls.removed, []); assert.deepEqual(f.values, original);
  f.state.layouts.admin.adminCausalSource.binding.actorId = "other-admin";
  assert.equal(f.actual.hasOwnedAdminTemplatePhotoEditor(f.state), false);
});
