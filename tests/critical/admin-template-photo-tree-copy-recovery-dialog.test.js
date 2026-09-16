import test from "node:test";
import assert from "node:assert/strict";
import { createAdminTemplateRecoveryDialog } from "../../src/ui/admin-template-recovery-dialog.js";

class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.events = new Map(); this.disabled = false; this.hidden = false; }
  setAttribute(name, value) { this.attributes[name] = value; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(name, callback) { this.events.set(name, callback); }
  dispatch(name, event = {}) { return this.events.get(name)?.(event); }
  click() { if (!this.disabled) return this.dispatch("click"); }
  close() { this.open = false; }
}
const copy = value => structuredClone(value);
const treeInfo = overrides => ({ recoveryKind: "photo-tree-copy", operations: [{ id: "same-operation", kind: "template.save", state: "unknown", cancelled: false }],
  stopRequested: false, stopCoversHead: false, stopped: false, committedCount: 0, applied: false, canResume: false, canStop: false, canCompare: false, ...overrides });
const committedInfo = applied => treeInfo({ operations: [{ id: "same-operation", kind: "template.save", state: "committed", cancelled: false }],
  committedCount: 1, applied, canResume: !applied, canStop: false });
async function fixture(initial, { language = "ru", compare = true } = {}) {
  const documentRef = { body: new Element("body"), createElement: tag => new Element(tag) };
  const controls = { info: copy(initial), resume: null, stop: null, confirm: true }, calls = { prepare: [], inspect: [], resume: 0, stop: 0, compare: 0, confirm: 0 };
  const work = { async inspect(refresh) { calls.inspect.push(refresh); return copy(controls.info); },
    async resume() { calls.resume++; return controls.resume ? controls.resume() : copy(controls.info); },
    async stop() { calls.stop++; return controls.stop ? controls.stop() : copy(controls.info); } };
  if (compare) work.compare = async () => { calls.compare++; return copy(controls.info); };
  const api = createAdminTemplateRecoveryDialog({ documentRef, getLanguage: () => language,
    prepare: async id => { calls.prepare.push(id); return work; }, openModalDialog: dialog => { dialog.open = true; },
    confirmStop: async () => { calls.confirm++; return controls.confirm; } });
  await api.show("selected-layout");
  const dialog = documentRef.body.children[0], button = name => dialog.children.find(node => Object.hasOwn(node.dataset, name));
  const status = dialog.children.find(node => node.attributes.role === "status");
  return { api, controls, calls, work, dialog, status, check: button("adminCheckResult"), resume: button("adminResume"),
    stop: button("adminStop"), compare: button("adminCompare"), close: button("adminRecoveryClose") };
}
const noTreeComparison = async f => {
  assert.equal(f.compare.hidden, true); assert.equal(f.compare.disabled, true);
  await f.compare.dispatch("click"); assert.equal(f.calls.compare, 0, "even a dispatched hidden event cannot invoke generic comparison");
};

test("whole-copy recovery follows explicit resume/stop permissions and never offers generic comparison", async () => {
  const f = await fixture(treeInfo({ recoveryKind: "photo-whole-copy", canResume: false, canStop: false }));
  assert.equal(f.resume.disabled, true); assert.equal(f.stop.disabled, true); await noTreeComparison(f);
  f.controls.info = { ...committedInfo(false), recoveryKind: "photo-whole-copy" };
  await f.check.click(); assert.equal(f.resume.disabled, false); assert.equal(f.stop.disabled, true);
  f.controls.info = { ...committedInfo(true), recoveryKind: "photo-whole-copy" };
  await f.resume.click(); assert.equal(f.resume.disabled, true); await noTreeComparison(f);
});

test("cancelled tree retains source/records with no automatic new save and never offers V8 comparison", async () => {
  const f = await fixture(treeInfo({ stopped: true, stopRequested: true, stopCoversHead: true,
    operations: [{ id: "same-operation", kind: "template.save", state: "rejected", cancelled: true }] }));
  assert.match(f.status.textContent, /Исходные данные и записи сохранены/);
  assert.match(f.status.textContent, /Автоматического нового сохранения нет/);
  assert.doesNotMatch(f.status.textContent, /сверк.*сервером|новую копию/i);
  assert.equal(f.resume.disabled, true); assert.equal(f.stop.disabled, true); assert.equal(f.check.disabled, false);
  await noTreeComparison(f); assert.deepEqual(f.calls.inspect, [false]);
});

test("server commit wins a late stop request and offers applying its existing result", async () => {
  const f = await fixture({ ...committedInfo(false), stopRequested: true });
  assert.match(f.status.textContent, /Сервер уже создал копию/); assert.equal(f.resume.textContent, "Применить результат");
  assert.equal(f.resume.disabled, false); assert.equal(f.stop.disabled, true); await noTreeComparison(f);
  let finish;
  f.controls.resume = () => new Promise(resolve => { finish = resolve; });
  const applying = f.resume.click();
  assert.equal(f.status.textContent, "Применяю подтверждённую копию…"); assert.equal(f.resume.disabled, true); assert.equal(f.close.disabled, true);
  let prevented = false; f.dialog.dispatch("cancel", { preventDefault() { prevented = true; } }); assert.equal(prevented, true);
  finish(committedInfo(true)); await applying;
  assert.match(f.status.textContent, /подтверждена сервером и применена/); assert.equal(f.calls.resume, 1); assert.equal(f.calls.stop, 0);
  assert.equal(f.resume.disabled, true); assert.equal(f.stop.disabled, true); assert.equal(f.close.disabled, false);
});

test("already applied tree has no resume/stop even if stale availability booleans say true", async () => {
  const f = await fixture({ ...committedInfo(true), canResume: true, canStop: true, canCompare: true }, { language: "en" });
  assert.match(f.status.textContent, /confirmed by the server and applied/);
  assert.equal(f.resume.disabled, true); assert.equal(f.stop.disabled, true); await f.resume.click(); await f.stop.click();
  assert.equal(f.calls.resume, 0); assert.equal(f.calls.stop, 0); await noTreeComparison(f);
});

test("unknown saved stop resumes only the stopping action and then reports retained cancellation", async () => {
  const f = await fixture(treeInfo({ stopRequested: true, stopCoversHead: true, canResume: true }));
  assert.equal(f.resume.textContent, "Продолжить остановку"); assert.equal(f.resume.disabled, false); assert.equal(f.stop.disabled, true);
  assert.match(f.status.textContent, /Ожидается подтверждение сервера/);
  f.controls.resume = () => treeInfo({ stopped: true, stopRequested: true,
    operations: [{ id: "same-operation", kind: "template.save", state: "rejected", cancelled: true }] });
  await f.resume.click(); assert.equal(f.calls.resume, 1); assert.equal(f.calls.confirm, 0); assert.equal(f.calls.stop, 0);
  assert.match(f.status.textContent, /Автоматического нового сохранения нет/); assert.equal(f.resume.disabled, true); await noTreeComparison(f);
});

test("read-only unknown tree check invokes inspect alone and reflects the adapter's later apply permission", async () => {
  const f = await fixture(treeInfo());
  assert.match(f.status.textContent, /пока не подтверждён/); assert.equal(f.resume.disabled, true); assert.equal(f.stop.disabled, true);
  f.controls.info = committedInfo(false); await f.check.click();
  assert.deepEqual(f.calls.inspect, [false, true]); assert.equal(f.calls.resume, 0); assert.equal(f.calls.stop, 0); assert.equal(f.calls.confirm, 0);
  assert.equal(f.resume.textContent, "Применить результат"); assert.equal(f.resume.disabled, false); await noTreeComparison(f);
});

test("legacy defaults keep their messages/actions, while comparison requires a callable method and no explicit refusal", async () => {
  const pending = { operations: [{ id: "old-operation", kind: "template.save", state: "unknown" }], stopped: false, stopRequested: false, stopCoversHead: false };
  const f = await fixture(pending);
  assert.match(f.status.textContent, /продолжите прежнюю отправку/); assert.equal(f.resume.textContent, "Продолжить отправку");
  assert.equal(f.resume.disabled, false); assert.equal(f.stop.disabled, false); assert.equal(f.compare.hidden, true);
  f.controls.confirm = false; await f.stop.click(); assert.equal(f.calls.confirm, 1); assert.equal(f.calls.stop, 0);
  f.controls.info = { ...pending, stopped: true }; await f.check.click();
  assert.match(f.status.textContent, /Перед новым сохранением нужна сверка с сервером/);
  assert.equal(f.compare.hidden, false); assert.equal(f.compare.disabled, false); await f.compare.click(); assert.equal(f.calls.compare, 1);
  f.controls.info.canCompare = false; await f.check.click(); assert.equal(f.compare.hidden, true); await f.compare.dispatch("click"); assert.equal(f.calls.compare, 1);
  delete f.controls.info.canCompare; delete f.work.compare; await f.check.click(); assert.equal(f.compare.hidden, true); assert.equal(f.compare.disabled, true);
  await f.compare.dispatch("click"); assert.equal(f.calls.compare, 1);
});

test("offline stop rereads its durable marker locally, preserves the original error and never triggers a secondary action", async () => {
  for (const unreadable of [false, true]) {
    const f = await fixture(treeInfo({ canResume: true, canStop: true }));
    f.controls.stop = () => {
      f.controls.info = treeInfo({ stopRequested: true, stopCoversHead: true, canResume: true, canStop: false });
      throw Error("Offline: original stop response missing");
    };
    if (unreadable) f.work.inspect = async refresh => { f.calls.inspect.push(refresh); throw Error("Local read failed"); };
    await f.stop.click();
    assert.equal(f.status.textContent, "Offline: original stop response missing");
    assert.deepEqual(f.calls.inspect, [false, false], "only the initial and best-effort local reads");
    assert.equal(f.calls.stop, 1); assert.equal(f.calls.confirm, 1); assert.equal(f.calls.resume, 0); assert.equal(f.calls.compare, 0);
    assert.equal(f.check.disabled, false); assert.equal(f.close.disabled, false);
    if (!unreadable) { assert.equal(f.resume.textContent, "Продолжить остановку"); assert.equal(f.stop.disabled, true); }
  }
  const legacy = await fixture({ operations: [{ id: "legacy", kind: "template.save", state: "unknown" }], stopRequested: false, stopped: false });
  legacy.controls.stop = () => { throw Error("Legacy error"); };
  await legacy.stop.click(); assert.deepEqual(legacy.calls.inspect, [false]); assert.equal(legacy.status.textContent, "Legacy error");
});
