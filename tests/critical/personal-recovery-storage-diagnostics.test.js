import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY } from "../../src/config/constants.js";
import { readPersonalRecoveryStorageDiagnostics as read, formatPersonalRecoveryStorageBytes as format } from "../../src/ui/personal-recovery-storage-diagnostics.js";
import { askPersonalOrdinaryRecovery } from "../../src/ui/personal-ordinary-recovery-dialog.js";

function storage(entries = []) {
  const map = new Map(entries);
  return { map, get length() { return map.size; }, key: index => [...map.keys()][index] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem() { throw Error("Diagnostics must not write"); }, removeItem() { throw Error("Diagnostics must not delete"); }, clear() { throw Error("Diagnostics must not clear"); } };
}
const bytes = entries => entries.reduce((sum, [key, value]) => sum + 2 * (key.length + value.length), 0);

test("storage estimate counts key/value UTF16 units, partitions all keys, and never exposes private data", () => {
  const queue = [["bike-packing-personal-save-v1:private-user:private-operation", "😀ёж"]];
  const recovery = [["bike-packing-personal-ordinary-recovery-v1:private-user:archive", "original secret"],
    ["bike-packing-personal-ordinary-recovery-v1:private-user:complete:receipt", "receipt secret"]];
  const journal = [["bike-packing-experiment-uncertain-write-v1:private-user", "saved request"]];
  const cache = [[PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY, "renewable"]], other = [["access-token", "private-token"], ["", ""]];
  const entries = [...queue, ...recovery, ...journal, ...cache, ...other], store = storage(entries), result = read(store);
  assert.deepEqual(result, { available: true, estimate: "utf16-key-and-value-bytes", totalBytes: bytes(entries),
    personalQueueBytes: bytes(queue), recoveryBytes: bytes(recovery), transportJournalBytes: bytes(journal), publicCacheBytes: bytes(cache), otherBytes: bytes(other) });
  assert.deepEqual([...store.map], entries);
  assert.doesNotMatch(JSON.stringify(result), /private|secret|access-token|receipt/);
});

test("empty storage is zero; inaccessible or changing storage is unavailable, never a partial total", () => {
  assert.equal(read(storage()).totalBytes, 0);
  for (const store of [undefined, {}, { get length() { throw Error("denied"); } },
    { length: 1, key() { throw Error("denied"); } }, { length: 1, key: () => "key", getItem() { throw Error("denied"); } },
    { length: 1, key: () => null }, { length: 1, key: () => "key", getItem: () => null },
    { length: 2, key: () => "duplicate", getItem: () => "value" }]) assert.deepEqual(read(store), { available: false });
  let reads = 0;
  assert.deepEqual(read({ get length() { return reads++ ? 2 : 1; }, key: () => "key", getItem: () => "value" }), { available: false });
});

test("sizes use binary units and never imply quota or remaining capacity", () => {
  assert.equal(format(0), "0 Б"); assert.equal(format(1024), "1,00 KiB");
  assert.equal(format(1024 * 1024), "1,00 MiB"); assert.equal(format(1536, "en"), "1.50 KiB");
  assert.equal(format(-1), "недоступно"); assert.equal(format(NaN, "en"), "unavailable");
});

// Minimal DOM exercising actual click handlers and download contents, without
// browser storage mutation or network access.
function fixture(store, { denied = false, renderFailure = false } = {}) {
  const nodes = [], downloads = [];
  const element = tag => {
    const node = { tag, children: [], listeners: {}, attributes: {}, textContent: "", disabled: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { if (renderFailure) throw Error("render failure"); this.children = children; },
      setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(type, handler) { this.listeners[type] = handler; },
      get childElementCount() { return this.children.length; }, showModal() {}, close() {}, remove() {}, focus() {},
      click() { return this.listeners.click?.(); } };
    nodes.push(node); return node;
  };
  const documentRef = { createElement: element, getElementById: () => null, body: element("body") };
  const windowRef = { get localStorage() { if (denied) throw Error("denied"); return store; }, Blob,
    URL: { createObjectURL(blob) { downloads.push(blob); return "blob:test"; }, revokeObjectURL() {} }, setTimeout: fn => fn() };
  return { documentRef, windowRef, nodes, downloads, button: name => nodes.find(node => node.tag === "button" && node.textContent === name) };
}

test("dialog exports before/after sizes on preparation failure and keeps recovery choices available", async () => {
  const store = storage([[PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY, "x".repeat(2000)], ["bike-packing-personal-save-v1:private", "saved"]]);
  const f = fixture(store), original = { marker: "original-copy", entries: [] }, before = read(store);
  const pending = askPersonalOrdinaryRecovery({ ...f, actionCount: 1, getRecoveryCopy: () => original,
    prepareServerChoice() { store.map.delete(PUBLIC_TEMPLATE_OFFLINE_CACHE_KEY); throw Object.assign(Error("quota"), { reason: "quota" }); } });
  await f.button("Загрузить серверную версию").click();
  assert.equal(f.button("Загрузить серверную версию").disabled, false);
  await f.button("Скачать данные для разбора").click();
  const downloaded = JSON.parse(await f.downloads[0].text());
  assert.deepEqual(downloaded.recoveryStorageDiagnostics.beforeServerChoice, before);
  assert.deepEqual(downloaded.recoveryStorageDiagnostics.current, read(store));
  assert.equal(downloaded.recoveryStorageDiagnostics.current.publicCacheBytes, 0);
  assert.equal(downloaded.recoveryPreparationFailure.reason, "quota");
  assert.deepEqual(original, { marker: "original-copy", entries: [] });
  assert.ok(f.nodes.some(node => /Хранилище этого сайта: ~/.test(node.textContent)));
  assert.ok(f.nodes.some(node => /фактическая квота неизвестна/i.test(node.textContent)));
  await f.button("Решить позже").click(); assert.equal(await pending, "later");
});

test("denied storage and optional rendering failure never block export or server choice", async () => {
  for (const options of [{ denied: true }, { renderFailure: true }]) {
    const f = fixture(storage(), options); let prepared = 0;
    const pending = askPersonalOrdinaryRecovery({ ...f, actionCount: 1, getRecoveryCopy: () => ({ entries: [] }), prepareServerChoice() { prepared++; } });
    await f.button("Скачать данные для разбора").click();
    assert.equal(f.downloads.length, 1);
    const downloaded = JSON.parse(await f.downloads[0].text());
    assert.equal(downloaded.recoveryStorageDiagnostics.current.available, !options.denied);
    await f.button("Загрузить серверную версию").click();
    assert.equal(await pending, "server"); assert.equal(prepared, 1);
  }
});
