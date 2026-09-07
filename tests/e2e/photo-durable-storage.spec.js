import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = "https://experiment.vniipo-help.ru";
async function fixture(page, context) {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && /^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    if (url.origin === origin && url.pathname === "/__photo-storage-test") return route.fulfill({ contentType: "text/html", body:
      `<script type="module">import * as photos from '/src/sync/photos.js';window.photos=photos;</script>` });
    return route.abort();
  });
  await page.goto(`${origin}/__photo-storage-test`); await page.waitForFunction(() => window.photos);
}

test("local cache success means IndexedDB transaction complete and survives reload with exact binary data", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    let complete = false;
    const native = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args) {
      const tx = native.apply(this, args); tx.addEventListener("complete", () => { complete = true; }); return tx;
    };
    try {
      await window.photos.putCachedPhoto({ id: "durable", bytes: new TextEncoder().encode("exact photo bytes").buffer }, "id:actor-a");
      return complete;
    } finally { IDBDatabase.prototype.transaction = native; }
  });
  expect(outcome).toBe(true);
  await page.reload(); await page.waitForFunction(() => window.photos);
  expect(await page.evaluate(async () => new TextDecoder().decode((await window.photos.getCachedPhoto("durable", "id:actor-a")).bytes))).toBe("exact photo bytes");
  expect(await page.evaluate(() => window.photos.getCachedPhoto("durable", "id:actor-b"))).toBeNull();
});

test("abort after the photo put request succeeds must reject without reporting durable storage", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    const native = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = native.apply(this, args), tx = this.transaction;
      request.addEventListener("success", () => tx.abort()); return request;
    };
    try {
      await window.photos.putCachedPhoto({ id: "aborted", bytes: new TextEncoder().encode("not committed").buffer }, "id:actor-a"); return "reported-success";
    } catch { return "rejected"; } finally { IDBObjectStore.prototype.put = native; }
  });
  expect(outcome).toBe("rejected");
  expect(await page.evaluate(() => window.photos.getCachedPhoto("aborted", "id:actor-a"))).toBeNull();
});

test("a local photo callback failure aborts its queued writes and the next transaction still works", async ({ page, context }) => {
  await fixture(page, context);
  const outcome = await page.evaluate(async () => {
    let rejected = false;
    try { await window.photos.photoDbStore("readwrite", store => {
      store.put({ id: "callback-failure", bytes: new TextEncoder().encode("must not commit").buffer }); throw Error("fixture callback failure");
    }); } catch { rejected = true; }
    const persisted = await window.photos.photoDbStore("readonly", store => store.get("callback-failure"));
    await window.photos.putCachedPhoto({ id: "next", bytes: new TextEncoder().encode("next").buffer }, "id:actor-a");
    return { rejected, persisted: Boolean(persisted), next: (await window.photos.getCachedPhoto("next", "id:actor-a")).id };
  });
  expect(outcome).toEqual({ rejected: true, persisted: false, next: "next" });
});

test("photo cache preserves actual Blob bytes and MIME through browser reload", async ({ page, context, browserName }) => {
  // Playwright's Windows WebKit fails native IndexedDB Blob preparation before
  // commit. This is NOT evidence about real iOS Safari; do not claim that test.
  test.skip(browserName === "webkit", "Windows WebKit native Blob persistence is unavailable; real Safari coverage remains open");
  await fixture(page, context);
  await page.evaluate(() => window.photos.putCachedPhoto({ id: "actual-blob", blob: new Blob(["image bytes"], { type: "image/png" }) }, "id:actor-a"));
  await page.reload(); await page.waitForFunction(() => window.photos);
  expect(await page.evaluate(async () => {
    const { blob } = await window.photos.getCachedPhoto("actual-blob", "id:actor-a"); return { text: await blob.text(), type: blob.type };
  })).toEqual({ text: "image bytes", type: "image/png" });
});
