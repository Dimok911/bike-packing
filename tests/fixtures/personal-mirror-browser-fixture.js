// Read/seed the actual browser store across the storage migration. No app
// lexical hooks are used. Seeding is only for constructing an offline scenario
// before the test reloads the application.
export async function readBrowserPersonalMirror(page, key) {
  return page.evaluate(async key => {
    const legacy = localStorage.getItem(key);
    if (legacy !== null) return legacy;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("bike-packing-personal-mirrors-v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("entries")) { db.close(); resolve(null); return; }
        const tx = db.transaction("entries"), rows = tx.objectStore("entries").getAll();
        let raw = null;
        rows.onsuccess = () => { raw = rows.result.find(row => row.namespace === "snapshot" && row.key === key)?.raw ?? null; };
        tx.oncomplete = () => { db.close(); resolve(raw); };
        tx.onabort = () => { db.close(); reject(tx.error); };
      };
    });
  }, key);
}

export async function seedBrowserPersonalMirror(page, key, raw) {
  await page.evaluate(async ({ key, raw }) => {
    // Old releases have no IndexedDB mirror repository. Do not create an empty
    // version-1 database while merely seeding their existing localStorage.
    if (localStorage.getItem(key) !== null) { localStorage.setItem(key, raw); return; }
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("bike-packing-personal-mirrors-v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("entries")) { db.close(); localStorage.setItem(key, raw); resolve(); return; }
        const tx = db.transaction(["entries", "bindings"], "readwrite"), store = tx.objectStore("entries"), rows = store.getAll();
        rows.onsuccess = () => {
          const row = rows.result.find(row => row.namespace === "snapshot" && row.key === key);
          if (!row) { tx.abort(); return; }
          store.put({ ...row, raw });
          const metas = tx.objectStore("bindings"), meta = metas.get(row.bindingKey);
          meta.onsuccess = () => metas.put({ ...meta.result, revision: meta.result.revision + 1 });
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error || Error("Missing seeded mirror")); };
      };
    });
  }, { key, raw });
}
