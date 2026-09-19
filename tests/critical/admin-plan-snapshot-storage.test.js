import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { canonicalTemplateJson as canonical } from "../../src/sync/admin-template-protocol.js";
import { adminTemplateCommandPlan, verifyAdminCommandStorageRow as validate, createAdminTemplateSavePlans } from "../../src/sync/admin-template-save-plan.js";
import { adminPlanKey, resolveAdminPlanStorageRow as resolve, prepareAdminPlanStorageRow as prepare,
  migrateAdminPlanSnapshots as migrate, isCompactAdminPlanRow } from "../../src/storage/admin-plan-snapshot-storage.js";
const binding = { actorId: "admin-a", environment: "bike-packing-experiment", listId: "public-demo-state-a", itemKey: "demo-state:a" };
const row = (title, revision = 1) => {
  const editorSnapshot = { payload: { items: { a: { id: "a", name: "Common item", note: "large identical data ".repeat(4000), photos: [{ id: "p", url: "/p" }] } },
    containers: {}, layouts: { a: { id: "a", name: title, updatedAt: title } } }, metadata: { title, language: "ru", description: "" } };
  const plan = adminTemplateCommandPlan({ binding, operationId: randomUUID(), kind: "template.metadata", body: { version: 1, base: { stateRevision: revision }, metadata: { title, language: "ru" } }, editorSnapshot });
  return { version: 1, plan, digest: createHash("sha256").update(canonical(plan)).digest("hex"), cancelRequested: false };
};
function fixture() {
  const values = new Map(), archives = new Map(); let revision = 0;
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i], getItem: k => values.get(k) ?? null,
    setItem(k, raw) { values.set(k, raw); } };
  const locks = { request: async (_key, callback) => callback() };
  const repository = { async read() { return { revision, entries: [...archives].map(([key, raw]) => ({ namespace: "journal", key, raw })) }; },
    async commit(_owner, changes) { assert.equal(changes.expectedRevision, revision); for (const v of changes.puts) archives.set(v.key, v.raw); revision++; } };
  const seed = value => { const key = adminPlanKey(value.plan), raw = canonical(value); values.set(key, raw); return { key, raw, value }; };
  return { values, archives, storage, locks, repository, seed };
}

test("52 renames retain exact reconstructable history while storing one full base", async () => {
  const f = fixture(), originals = Array.from({ length: 52 }, (_, i) => f.seed(row("Name " + i, i + 1)));
  const before = [...f.values.values()].reduce((n, r) => n + r.length, 0);
  const result = await migrate({ ...f, validate });
  assert.equal(result.migrated, 51); assert.equal(f.archives.size, 51);
  assert.ok([...f.values.values()].reduce((n, r) => n + r.length, 0) < before / 10);
  for (const original of originals) { assert.equal(resolve(f.storage, original.key).raw, original.raw); await validate(original.key, resolve(f.storage, original.key).raw); }
  assert.deepEqual(await migrate({ ...f, validate }), { migrated: 0, freedChars: 0 });
});

test("migration works at full quota and does not remove source before verified archive", async () => {
  const f = fixture(), a = f.seed(row("A")), b = f.seed(row("B"));
  const limit = [...f.values.values()].reduce((n, r) => n + r.length, 0);
  f.storage.setItem = (key, raw) => { assert.ok([...f.values].reduce((n, [k, v]) => n + (k === key ? 0 : v.length), 0) + raw.length <= limit); assert.equal(f.archives.get(key), [a,b].find(r => r.key === key).raw); f.values.set(key, raw); };
  await migrate({ ...f, validate }); assert.equal(resolve(f.storage, a.key).raw, a.raw); assert.equal(resolve(f.storage, b.key).raw, b.raw);
});

test("archive failure or source change before replacement preserves current inline data", async () => {
  for (const mode of ["commit", "readback", "concurrent"]) {
    const f = fixture(), originals = [f.seed(row("A")), f.seed(row("B"))].sort((a,b)=>a.key.localeCompare(b.key));
    const target = originals[1]; let reads = 0;
    const read = f.repository.read;
    f.repository.read = async () => { const value = await read(); if (++reads === 2) { if (mode === "readback") value.entries = []; if (mode === "concurrent") f.values.set(target.key, "concurrent bytes"); } return value; };
    if (mode === "commit") f.repository.commit = async () => { throw Error("IDB quota"); };
    await assert.rejects(migrate({ ...f, validate }));
    assert.equal(f.values.get(originals[0].key), originals[0].raw);
    assert.equal(f.values.get(target.key), mode === "concurrent" ? "concurrent bytes" : target.raw);
  }
});

test("restart after one atomic replacement resumes and preserves every original", async () => {
  const f = fixture(), originals = Array.from({ length: 4 }, (_, i) => f.seed(row("Name " + i)));
  const write = f.storage.setItem; let writes = 0;
  f.storage.setItem = (key, raw) => { if (++writes === 2) throw Error("Crash"); write(key, raw); };
  await assert.rejects(migrate({ ...f, validate })); f.storage.setItem = write;
  await migrate({ ...f, validate });
  for (const item of originals) assert.equal(resolve(f.storage, item.key).raw, item.raw);
});

test("fresh reads and guards detect base edits, removal and reference changes without a cache", async () => {
  const f = fixture(), a = f.seed(row("A")), b = f.seed(row("B"));
  const packed = await prepare({ storage: f.storage, key: b.key, raw: b.raw, validate }); f.values.set(b.key, packed.raw);
  for (const mutate of [() => f.values.delete(a.key), () => f.values.set(a.key, a.raw.replace("Common item", "Changed one")), () => f.values.set(b.key, packed.raw + " ")]) {
    const proof = resolve(f.storage, b.key); mutate(); assert.throws(proof.assertCurrent);
    f.values.set(a.key, a.raw); f.values.set(b.key, packed.raw);
  }
  const changed = JSON.parse(a.raw); changed.plan.editorSnapshot.payload.items.a.name = "Tampered";
  f.values.set(a.key, canonical(changed));
  const resolved = resolve(f.storage,b.key);
  await assert.rejects(validate(a.key, resolved.dependencies[0].raw));
});

test("references cannot cross bindings, recurse, or silently accept corrupt patches", async () => {
  const f = fixture(), a = f.seed(row("A")), b = f.seed(row("B"));
  const packed = await prepare({ storage:f.storage,key:b.key,raw:b.raw,validate });
  for (const mutate of [r=>r.editorSnapshotReference.key=b.key, r=>r.editorSnapshotReference.planDigest="0".repeat(64), r=>r.editorSnapshotReference.changes=[{path:["missing","x"],value:1}]]) {
    const candidate=JSON.parse(packed.raw);mutate(candidate);f.values.set(b.key,canonical(candidate));assert.throws(()=>resolve(f.storage,b.key));
  }
  f.values.set(b.key,packed.raw);
  const base=JSON.parse(a.raw);base.plan.binding.actorId="foreign";f.values.set(a.key,canonical(base));assert.throws(()=>resolve(f.storage,b.key));
});

test("referenced base is never compacted even when another full snapshot exists", async () => {
  const f=fixture(), a=f.seed(row("A")), b=f.seed(row("B"));
  const packed=await prepare({storage:f.storage,key:b.key,raw:b.raw,validate});f.values.set(b.key,packed.raw);f.seed(row("C"));
  assert.equal((await prepare({storage:f.storage,key:a.key,raw:a.raw,validate})).raw,a.raw);
});

test("real registry captures compact rows, cold reads full snapshots and dispatches original UUID", async () => {
  const f=fixture(), a=f.seed(row("A")), b=row("B",2), effects=[];
  const client={capture:async intent=>effects.push(intent),run:async id=>({operation:{id,state:"committed"}})};
  const make=()=>createAdminTemplateSavePlans({binding,storage:f.storage,locks:f.locks,compactStorage:true,enabled:true,
    getContext:()=>({...binding,admin:true,scope:"admin-template",generation:"one"}),client});
  await make().captureCommand({operationId:b.plan.id,kind:b.plan.operations[0].kind,body:b.plan.operations[0].body,editorSnapshot:b.plan.editorSnapshot});
  const key=adminPlanKey(b.plan);assert.ok(isCompactAdminPlanRow(JSON.parse(f.values.get(key))));
  assert.deepEqual(await make().read(b.plan.id),b); assert.equal((await make().run(b.plan.id)).state,"committed");
  assert.equal(effects.length,1);assert.equal(effects[0].operationId,b.plan.id);assert.equal(f.values.get(a.key),a.raw);
  f.values.delete(a.key);await assert.rejects(make().read(b.plan.id));await assert.rejects(make().run(b.plan.id));assert.equal(effects.length,1);
});
