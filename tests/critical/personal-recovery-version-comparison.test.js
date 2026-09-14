import test from "node:test";
import assert from "node:assert/strict";
import { describePersonalRecoveryVersionComparison as describe } from "../../src/ui/personal-recovery-version-comparison.js";

const payload = () => ({ items: { mug: { id: "mug", name: "Кружка", weight: 100 } },
  containers: { frame: { id: "frame", name: "Рамная", photos: [] }, top: { id: "top", name: "Верхняя", photos: [] },
    rear: { id: "rear", name: "Задняя", photos: [] }, bike: { id: "bike", name: "Велосипед", photos: [] } },
  layouts: { trip: { id: "trip", name: "Тестовый поход", arrangement: { rootContainerIds: ["frame"],
    containers: { frame: { parentId: "", childIds: [], itemIds: ["mug"] } }, items: { mug: { containerId: "frame" } }, packedItems: {} } } },
  activeLayoutId: "trip", settings: { unit: "g" } });
const compare = (local, remote, options) => describe({ local, remote, serverRevision: 42 }, options);

test("three server-only columns describe saved/current state without inventing actions", () => {
  const local = payload(), remote = structuredClone(local);
  remote.layouts.trip.arrangement.rootContainerIds.push("top", "rear", "bike");
  const before = structuredClone({ local, remote }), result = compare(local, remote);
  assert.equal(result.available, true); assert.equal(result.omittedCount, 0); assert.equal(result.lines.length, 3);
  for (const name of ["Верхняя", "Задняя", "Велосипед"]) assert.ok(result.lines.some(line => line.includes(name) && line.includes("только в серверной версии")));
  assert.doesNotMatch(result.lines.join(" "), /добавил|удалил|ребейс|безопасно|принят|подтвержд/);
  assert.deepEqual({ local, remote }, before);
});

test("three additional empty roots and metadata show precise columns without spurious content differences", () => {
  const local = payload(), remote = structuredClone(local);
  local.layouts.trip.rootContainerIds = ["frame"];
  local.layouts.trip.updatedAt = "2026-01-01T10:00:00Z";
  for (const id of ["top", "rear", "bike"]) {
    remote.layouts.trip.arrangement.rootContainerIds.push(id);
    remote.layouts.trip.arrangement.containers[id] = { parentId: "", itemIds: [], childIds: [], order: [] };
  }
  remote.layouts.trip.rootContainerIds = [...remote.layouts.trip.arrangement.rootContainerIds];
  remote.layouts.trip.updatedAt = "2026-01-02T10:00:00Z";
  remote.layouts.trip.updatedByDeviceId = "computer";
  remote.layouts.trip.updatedByDeviceName = "Desktop";
  const before = structuredClone({ local, remote });
  for (const result of [compare(local, remote), compare(remote, local)]) {
    assert.equal(result.lines.length, 4); assert.equal(result.omittedCount, 0);
    assert.match(result.lines[3], /время или устройство последнего изменения/);
    assert.doesNotMatch(result.lines.join(" "), /также различаются размещения|другие данные укладки/);
  }
  assert.deepEqual({ local, remote }, before);
});

test("new root content, unknown fields and inconsistent mirrors remain visible", () => {
  for (const change of [
    node => { node.itemIds.push("mug"); },
    node => { node.childIds.push("rear"); },
    node => { node.parentId = "frame"; },
    node => { node.futureField = true; },
    node => { delete node.order; }
  ]) {
    const local = payload(), remote = structuredClone(local);
    remote.layouts.trip.arrangement.rootContainerIds.push("top");
    const node = { parentId: "", itemIds: [], childIds: [], order: [] }; change(node);
    remote.layouts.trip.arrangement.containers.top = node;
    assert.match(compare(local, remote).lines.join(" "), /также различаются размещения/);
  }
  for (const change of [
    layout => { layout.rootContainerIds = ["top"]; },
    layout => { layout.unknownMetadata = "value"; }
  ]) {
    const local = payload(), remote = structuredClone(local); change(remote.layouts.trip);
    assert.match(compare(local, remote).lines.join(" "), /другие данные укладки/);
  }
});

test("local-only columns and catalog identities have the correct direction", () => {
  const local = payload(), remote = structuredClone(local);
  local.layouts.trip.arrangement.rootContainerIds.push("top");
  local.items.tent = { id: "tent", name: "Палатка" };
  remote.containers.newBag = { id: "newBag", name: "Новая" };
  const lines = compare(local, remote).lines.join(" ");
  assert.match(lines, /Верхняя/); assert.match(lines, /Палатка»: запись только в сохранённой копии/);
  assert.match(lines, /Новая»: запись только в серверной версии/);
  assert.equal(compare(local, remote).lines.filter(line => /только в сохранённой копии/.test(line)).length, 2);
});

test("nested movement, root order and packing marks cannot masquerade as equality", () => {
  const local = payload(); local.layouts.trip.arrangement.rootContainerIds.push("top");
  for (const change of [
    remote => { remote.layouts.trip.arrangement.items.mug.containerId = "top"; },
    remote => { remote.layouts.trip.arrangement.containers.frame.parentId = "top"; },
    remote => { remote.layouts.trip.arrangement.packedItems.mug = true; },
    remote => { remote.layouts.trip.arrangement.rootContainerIds.reverse(); }
  ]) {
    const remote = structuredClone(local); change(remote);
    const result = compare(local, remote); assert.equal(result.available, true);
    assert.match(result.lines.join(" "), /различаются размещения|различается порядок/);
    assert.doesNotMatch(result.lines.join(" "), /Отличий.*не найдено/);
  }
});

test("same-name different IDs remain distinct and are identified", () => {
  const local = payload(), remote = structuredClone(local);
  local.containers.top.name = "Одинаковая"; remote.containers.top.name = "Одинаковая";
  remote.containers.duplicate = { id: "duplicate", name: "Одинаковая", photos: [] };
  local.layouts.trip.arrangement.rootContainerIds.push("top");
  remote.layouts.trip.arrangement.rootContainerIds.push("duplicate");
  const lines = compare(local, remote).lines;
  assert.ok(lines.some(line => /серверной версии.*Одинаковая \[duplicate\]/.test(line)));
  assert.ok(lines.some(line => /сохранённой копии.*Одинаковая \[top\]/.test(line)));
});

test("photos, other record fields, layout fields and unknown settings are not silently dropped", () => {
  for (const [change, pattern] of [
    [remote => { remote.containers.frame.photos = [{ url: "https://private.invalid/image.jpg", id: "opaque" }]; }, /ссылки на фотографии/],
    [remote => { remote.items.mug.weight = 101; }, /Кружка.*другие данные записи/],
    [remote => { remote.containers.frame.newBusinessField = { foo: 1 }; }, /Рамная.*другие данные записи/],
    [remote => { remote.layouts.trip.name = "Другая укладка"; }, /Другая укладка.*другие данные укладки/],
    [remote => { remote.settings.unit = "kg"; }, /другие данные или настройки/],
    [remote => { remote.unknownBusinessField = "https://private.invalid/secret"; }, /другие данные или настройки/]
  ]) {
    const local = payload(), remote = structuredClone(local); change(remote);
    const result = compare(local, remote); assert.match(result.lines.join(" "), pattern);
    assert.doesNotMatch(JSON.stringify(result), /private.invalid|opaque|secret/);
  }
});

test("layout identities are compared even when every layout field matches", () => {
  const local = payload(), remote = structuredClone(local);
  remote.layouts.other = { ...remote.layouts.trip, id: "other" }; delete remote.layouts.trip;
  const result = compare(local, remote);
  assert.equal(result.lines.length, 2);
  assert.match(result.lines[0], /\[trip\].*сохранённой копии/);
  assert.match(result.lines[1], /\[other\].*серверной версии/);
});

test("canonical equality ignores ordering and only business projection's display mirrors", () => {
  const local = payload(), remote = structuredClone(local);
  remote.items.mug = { weight: 100, name: "Кружка", id: "mug", parentContainerId: "mirror" };
  remote.activeLayoutId = "other"; remote.packedItems = { mug: true };
  remote.containers.frame.itemIds = ["mirror"];
  const result = compare(local, remote);
  assert.equal(result.available, true); assert.equal(result.lines.length, 1);
  assert.match(result.lines[0], /Отличий.*не найдено/); assert.match(result.lines[0], /не подтверждает сохранение/);
  assert.match(compare(local, remote, { language: "en" }).lines[0], /does not confirm the save/);
});

test("output is bounded with exact omitted count; user names remain inert text", () => {
  const local = payload(), remote = structuredClone(local);
  for (let index = 0; index < 20; index++) remote.items[`item${index}`] = { id: `item${index}`, name: index === 0 ? '<img src=x onerror="boom">' : "x".repeat(1000) };
  const result = compare(local, remote);
  assert.equal(result.lines.length, 8); assert.equal(result.omittedCount, 12);
  assert.ok(result.lines[0].includes('<img src=x onerror="boom">'));
  assert.ok(result.lines.every(line => line.length < 550));
});

test("invalid, missing, malformed or unversioned snapshots do not report equality", () => {
  for (const local of [null, {}, { ...payload(), items: { wrong: { id: "different" } } }, { ...payload(), settings: undefined }]) {
    assert.deepEqual(compare(local, payload()), { available: false, lines: [], omittedCount: 0 });
  }
  for (const serverRevision of [undefined, 0, -1, "42", NaN]) assert.equal(describe({ local: payload(), remote: payload(), serverRevision }).available, false);
  for (const roots of [["missing"], ["frame", "frame"], [null]]) {
    const remote = payload(); remote.layouts.trip.arrangement.rootContainerIds = roots;
    assert.equal(compare(payload(), remote).available, false);
  }
  const cyclic = payload(); cyclic.extra = cyclic;
  assert.equal(compare(cyclic, payload()).available, false);
});

test("malformed JSON names use stable IDs without object coercion or blocking the dialog", () => {
  for (const name of [{ toString: null }, { nested: "not a name" }, ["not a name"], 123, true, null]) {
    const local = payload(), remote = structuredClone(local);
    for (const snapshot of [local, remote]) {
      snapshot.layouts.trip.name = structuredClone(name);
      snapshot.containers.top.name = structuredClone(name);
      snapshot.items.mug.name = structuredClone(name);
    }
    remote.layouts.trip.arrangement.rootContainerIds.push("top");
    remote.items.mug.weight = 200;
    const result = compare(local, remote);
    assert.equal(result.available, true);
    assert.ok(result.lines.some(line => /Укладка «trip».*— top\./.test(line)));
    assert.ok(result.lines.some(line => /Вещь «mug».*данные записи/.test(line)));
    assert.doesNotMatch(result.lines.join(" "), /object Object|not a name|123|true/);
  }
});

test("unexpected formatting input failures degrade to unavailable without leaking an exception", () => {
  const unavailable = { available: false, lines: [], omittedCount: 0 };
  assert.deepEqual(describe(null), unavailable);
  assert.deepEqual(describe({ local: payload(), remote: payload(), serverRevision: 42 }, null), unavailable);
  const input = { local: payload(), remote: payload(), serverRevision: 42 };
  const options = Object.defineProperty({}, "language", { get() { throw new Error("invalid formatter options"); } });
  assert.deepEqual(describe(input, options), unavailable);
});
