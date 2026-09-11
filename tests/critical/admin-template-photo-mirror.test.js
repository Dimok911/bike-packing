import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalTemplateJson } from "../../src/sync/admin-template-protocol.js";
import { adminTemplatePhotoNamespace } from "../../src/public/admin-template-photo-state.js";
import { adminPhotoRecordFixture } from "../fixtures/admin-template-photo-record-fixture.js";

const app = readFileSync(new URL("../../app.js", import.meta.url), "utf8");
const actualSource = app.match(/function persistAdminTemplatePhotoMirror\([^]*?\n\}/)?.[0];
assert.ok(actualSource, "Actual application photo mirror writer is available");
const clone = value => JSON.parse(canonicalTemplateJson(value));

async function fixture({ active = "private", scopeKey = "id:admin-a" } = {}) {
  const record = await adminPhotoRecordFixture({ count: 0 }), { layoutId } = record.snapshot;
  const previous = clone(record.snapshot.state), selected = previous.layouts[layoutId];
  selected.categories = ["Administrative category"]; selected.locations = ["Administrative location"];
  selected.adminCausalSource = { ...selected.adminCausalSource, base: { operationId: record.action.operationId },
    planId: record.action.operationId, photoEditPending: record.action.operationId };
  selected.templateDraftSyncPending = true;
  previous.activeLayoutId = active === "admin" ? layoutId : "private";
  previous.layouts.private = { id: "private", name: "Private layout", arrangement: { packedItems: { personal: true } } };
  previous.items.personal = { id: "personal", name: "Earlier private value", unknown: [3, 2, 1] };
  previous.containers.personalBag = { id: "personalBag", name: "Private bag" };
  previous.layouts.otherAdmin = { id: "otherAdmin", name: "Other administrative draft", categories: ["Other category"],
    locations: [], arrangement: { packedItems: {} }, adminCausalSource: { version: 1,
      binding: { ...record.binding, listId: "public-shared-layout-other", itemKey: "shared-layout:other" },
      base: { stateRevision: 11 }, planId: null } };
  previous.items.otherItem = { id: "otherItem", publicCatalogLayoutId: "otherAdmin", name: "Earlier other draft" };
  previous.containers.otherBag = { id: "otherBag", publicCatalogLayoutId: "otherAdmin", unknown: { untouched: true } };
  previous.packedItems = active === "admin" ? {} : { personal: true };
  previous.categories = ["Original private category"]; previous.locations = ["Original private location"];
  previous.unknownGlobal = { exact: [false, 0, null, ""] };
  const expected = adminTemplatePhotoNamespace(previous, layoutId), state = clone(previous);
  // The live tab is applying its selected confirmed result. The current shared
  // mirror may already contain newer unrelated values from another tab.
  state.items["local-item"].name = "Selected confirmed field"; state.items["local-item"].photos = [];
  state.layouts[layoutId].adminCausalSource.base = { stateRevision: 8 };
  state.layouts[layoutId].adminCausalSource.planId = null;
  delete state.layouts[layoutId].adminCausalSource.photoEditPending;
  delete state.layouts[layoutId].templateDraftSyncPending;
  state.layouts[layoutId].arrangement.packedItems = { "local-item": true };
  previous.items.personal.name = "Newest private value";
  previous.items.otherItem.name = "Newest other administrative edit";
  previous.layouts.otherAdmin.adminCausalSource.planId = "84b9e567-521f-4845-bd2d-e960234a7125";
  previous.layouts.otherAdmin.adminCausalSource.photoEditPending = previous.layouts.otherAdmin.adminCausalSource.planId;
  previous.categories.push("New private category"); previous.locations.push("New private location");
  previous.unknownGlobal.exact.push("newest");
  const key = `${scopeKey}:mirror`, baselineKey = `${scopeKey}:baseline`, recoveryKey = `${scopeKey}:recovery`;
  const values = new Map([[key, JSON.stringify(previous)], [baselineKey, "Exact private baseline"], [recoveryKey, "Exact private recovery"],
    ["retained-photo-plan", "Immutable selected plan"], ["other-admin-plan", "Immutable other plan"]]);
  const controls = { quota: false, dropWrite: false, afterSet: null, writes: [], removed: [] };
  const localStorage = { getItem: name => values.get(name) ?? null,
    setItem(name, value) {
      controls.writes.push({ key: name, value });
      if (controls.quota) throw Error("Mirror quota");
      if (!controls.dropWrite) values.set(name, value);
      controls.afterSet?.(name, value);
    }, removeItem(name) { controls.removed.push(name); values.delete(name); } };
  const deps = { state, localStorage, localStorageScopeKey: scopeKey, STORAGE_KEY: "mirror",
    scopedLocalStorageKey: name => `${scopeKey}:${name}`, canonicalTemplateJson, clone, adminTemplatePhotoNamespace };
  const persist = new Function(...Object.keys(deps), `${actualSource}\nreturn persistAdminTemplatePhotoMirror;`)(...Object.values(deps));
  return { state, previous, layoutId, expected, persist, controls, values, key, baselineKey, recoveryKey,
    read: () => JSON.parse(values.get(key)), namespace: () => adminTemplatePhotoNamespace(state, layoutId) };
}

function journals(f) { return [...f.values].filter(([key]) => key !== f.key); }

test("actual selected mirror update preserves newer private and other administrative values from shared storage", async () => {
  const f = await fixture(), stateBefore = clone(f.state), expectedBefore = clone(f.expected), journalBefore = journals(f);
  assert.equal(f.persist(f.layoutId, [f.expected, f.namespace()]), true);
  const saved = f.read();
  assert.deepEqual(adminTemplatePhotoNamespace(saved, f.layoutId), f.namespace());
  for (const key of ["activeLayoutId", "packedItems", "locations", "categories", "unknownGlobal"]) {
    assert.deepEqual(saved[key], f.previous[key], key);
  }
  for (const [type, ids] of [["items", ["personal", "otherItem"]], ["containers", ["personalBag", "otherBag"]], ["layouts", ["private", "otherAdmin"]]]) {
    for (const id of ids) assert.deepEqual(saved[type][id], f.previous[type][id], `${type}/${id}`);
  }
  assert.equal(saved.items.personal.name, "Newest private value");
  assert.ok(saved.layouts.otherAdmin.adminCausalSource.photoEditPending);
  assert.deepEqual(f.state, stateBefore); assert.deepEqual(f.expected, expectedBefore);
  assert.deepEqual(journals(f), journalBefore); assert.deepEqual(f.controls.removed, []);
});

test("a late ACK cannot overwrite a newer same-template field, photo selection, pending pointer or arrangement", async () => {
  for (const change of ["field", "photos", "pending", "arrangement"]) {
    const f = await fixture(), newer = f.read();
    if (change === "field") newer.items["local-item"].name = "Tab B later form";
    if (change === "photos") newer.items["local-item"].photos = [];
    if (change === "pending") newer.layouts[f.layoutId].adminCausalSource.photoEditPending = "84b9e567-521f-4845-bd2d-e960234a7125";
    if (change === "arrangement") newer.layouts[f.layoutId].arrangement.packedItems["local-item"] = true;
    f.values.set(f.key, JSON.stringify(newer)); const before = new Map(f.values);
    assert.throws(() => f.persist(f.layoutId, [f.expected, f.namespace()]), /В другой вкладке изменён этот шаблон/);
    assert.deepEqual(f.values, before); assert.deepEqual(f.controls.writes, []); assert.deepEqual(f.controls.removed, []);
  }
});

test("the same persisted candidate is an idempotent allowed mirror state, including after a lost write acknowledgement", async () => {
  const f = await fixture(), expected = [f.expected, f.namespace()];
  assert.equal(f.persist(f.layoutId, expected), true); const after = new Map(f.values);
  assert.equal(f.persist(f.layoutId, expected), true);
  assert.deepEqual(f.values, after); assert.equal(f.controls.writes.length, 2);
  assert.equal(f.controls.writes[1].value, f.controls.writes[0].value); assert.deepEqual(f.controls.removed, []);
});

test("root packed values update only when the current shared mirror still displays the selected administrative layout", async () => {
  for (const active of ["private", "admin"]) {
    const f = await fixture({ active }); f.persist(f.layoutId, [f.expected]); const saved = f.read();
    assert.equal(saved.activeLayoutId, f.previous.activeLayoutId);
    assert.deepEqual(saved.packedItems, active === "admin" ? f.namespace().packedItems : f.previous.packedItems);
  }
});

test("mirror quota preserves every existing snapshot and journal without any eviction fallback", async () => {
  const f = await fixture(), before = new Map(f.values); f.controls.quota = true;
  assert.throws(() => f.persist(f.layoutId, [f.expected]), /Mirror quota/);
  assert.deepEqual(f.values, before); assert.deepEqual(f.controls.removed, []); assert.equal(f.controls.writes.length, 1);
  assert.equal(f.controls.writes[0].key, f.key);
});

test("failed readback cannot report success, erase recovery or overwrite a writer observed after setItem", async () => {
  for (const mode of ["lost-write", "newer-writer"]) {
    const f = await fixture(), before = new Map(f.values), journalBefore = journals(f); let newer;
    if (mode === "lost-write") f.controls.dropWrite = true;
    else f.controls.afterSet = (name, encoded) => {
      newer = JSON.parse(encoded); newer.items.personal.name = "Private edit after this write";
      newer.items["local-item"].name = "Another tab after this write";
      f.values.set(name, JSON.stringify(newer));
    };
    assert.throws(() => f.persist(f.layoutId, [f.expected]), /Не удалось подтвердить запись шаблона/);
    assert.deepEqual(f.controls.removed, []); assert.equal(f.controls.writes.length, 1); assert.deepEqual(journals(f), journalBefore);
    if (mode === "lost-write") assert.deepEqual(f.values, before); else assert.deepEqual(f.read(), newer);
  }
});

test("another actor or storage account cannot adopt the selected template mirror", async () => {
  for (const change of ["scope", "live-actor", "stored-actor"]) {
    const f = await fixture({ scopeKey: change === "scope" ? "id:other-admin" : "id:admin-a" });
    if (change === "live-actor") f.state.layouts[f.layoutId].adminCausalSource.binding.actorId = "other-admin";
    if (change === "stored-actor") {
      const stored = f.read(); stored.layouts[f.layoutId].adminCausalSource.binding.actorId = "other-admin";
      f.values.set(f.key, JSON.stringify(stored));
    }
    const before = new Map(f.values);
    assert.throws(() => f.persist(f.layoutId, [f.expected, f.namespace()]));
    assert.deepEqual(f.values, before); assert.deepEqual(f.controls.writes, []); assert.deepEqual(f.controls.removed, []);
  }
});

test("missing, corrupt or unapproved current mirror refuses writing instead of rebuilding from a stale live tab", async () => {
  for (const change of ["missing", "corrupt", "missing-namespace", "no-expectation"]) {
    const f = await fixture();
    if (change === "missing") f.values.delete(f.key);
    if (change === "corrupt") f.values.set(f.key, "{invalid");
    if (change === "missing-namespace") { const stored = f.read(); delete stored.layouts[f.layoutId]; f.values.set(f.key, JSON.stringify(stored)); }
    const before = new Map(f.values);
    assert.throws(() => f.persist(f.layoutId, change === "no-expectation" ? [] : [f.expected]));
    assert.deepEqual(f.values, before); assert.deepEqual(f.controls.writes, []); assert.deepEqual(f.controls.removed, []);
  }
});

test("a selected owner ID collision never replaces a newer private or unrelated administrative record", async () => {
  for (const target of ["personal", "otherItem"]) {
    const f = await fixture(), row = clone(f.state.items["local-item"]);
    delete f.state.items["local-item"]; row.id = target; f.state.items[target] = row;
    const before = new Map(f.values);
    assert.throws(() => f.persist(f.layoutId, [f.expected]), /Идентификатор записи уже принадлежит другой раскладке/);
    assert.deepEqual(f.values, before); assert.deepEqual(f.controls.writes, []); assert.deepEqual(f.controls.removed, []);
  }
});
