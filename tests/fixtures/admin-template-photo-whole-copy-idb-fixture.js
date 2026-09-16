// Events, serial transactions and cloned IDB values are modeled here. This
// double verifies store orchestration; the browser suite owns native IDB proof.
export function wholePhotoIndexedDBFixture() {
  const databases = new Map(), controls = { onGet: () => {}, onCommit: () => {}, quota: false, abortWrite: false, failOpen: false };
  const transactions = [], requests = [];
  const indexedDB = { open(name, version) {
    const request = {};
    queueMicrotask(() => {
      if (controls.failOpen) { request.error = Error("IDB unavailable"); request.onerror?.(); return; }
      const fresh = !databases.has(name);
      if (fresh) databases.set(name, { stores: new Map(), tail: Promise.resolve() });
      const saved = databases.get(name);
      const db = { objectStoreNames: { contains: key => saved.stores.has(key) }, close() {},
        createObjectStore(key) { saved.stores.set(key, new Map()); return { createIndex() {} }; },
        transaction(names, mode, options) {
          transactions.push({ name, names: [...names], mode, options });
          let done = false, pending = 0, working, finishTail;
          const previous = saved.tail; saved.tail = new Promise(resolve => { finishTail = resolve; });
          const ready = previous.then(() => { working = new Map(names.map(key => [key, structuredClone(saved.stores.get(key))])); });
          const tx = { abort() {
            if (done) return; done = true;
            queueMicrotask(() => { tx.onabort?.(); finishTail(); });
          }, objectStore(storeName) {
            if (!names.includes(storeName)) throw Error("Store outside transaction");
            const enqueue = (operation, key, value) => {
              const result = {}; pending++;
              requests.push({ mode, storeName, operation, key });
              ready.then(() => queueMicrotask(() => {
                if (done) return;
                try {
                  const rows = working.get(storeName);
                  if (operation === "get") { controls.onGet({ mode, storeName, key }); result.result = structuredClone(rows.get(key)); }
                  if (operation === "allKeys") { controls.onGet({ mode, storeName, key }); result.result = [...rows.keys()].sort(); }
                  if (operation === "keys") { controls.onGet({ mode, storeName, key }); result.result = [...rows].filter(([, row]) => row.bindingKey === key).map(([rowKey]) => rowKey); }
                  if (operation === "add") {
                    if (controls.quota) throw Error("Quota exceeded");
                    if (rows.has(value.key)) throw Error("Constraint violation");
                    rows.set(value.key, structuredClone(value)); result.result = value.key;
                  }
                  result.onsuccess?.();
                } catch (error) { result.error = tx.error = error; result.onerror?.(); tx.onerror?.(); tx.abort(); }
                pending--; complete();
              }));
              return result;
            };
            return { get: key => enqueue("get", key), getAllKeys: () => enqueue("allKeys"), add: value => enqueue("add", value.key, value),
              index: () => ({ getAllKeys: key => enqueue("keys", key) }) };
          } };
          function complete() {
            if (pending || done) return;
            setImmediate(() => {
              if (pending || done) return;
              if (mode === "readwrite" && controls.abortWrite) { tx.error = Error("Transaction aborted"); tx.abort(); return; }
              done = true;
              if (mode === "readwrite") for (const [storeName, rows] of working) saved.stores.set(storeName, rows);
              controls.onCommit({ mode, names, saved }); tx.oncomplete?.(); finishTail();
            });
          }
          ready.then(complete);
          return tx;
        }
      };
      request.result = db;
      if (fresh) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  } };
  return { indexedDB, controls, requests, transactions, databases,
    rows: (storeName = "actions") => databases.get("bike-packing-admin-template-photo-whole-copy-actions-v1")?.stores.get(storeName) };
}
