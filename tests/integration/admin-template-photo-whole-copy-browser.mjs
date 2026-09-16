import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, webkit, devices, expect as baseExpect } from "@playwright/test";

// Imported by the disposable canonical API harness. This module never starts a
// server, builds a bundle, seeds application state, or fabricates an API reply.
const frontendOrigin = "https://experiment.vniipo-help.ru";
const canonicalOrigin = "https://api.vniipo-help.ru";
const prefix = "/letters-vniipo/api", bike = prefix + "/bike-packing";
const parentPath = bike + "/admin/template-operations", stagePath = bike + "/admin/template-photo-assets/whole-copy";
const wholeDb = "bike-packing-admin-template-photo-whole-copy-actions-v1";
const acceptedPrefix = "bike-packing-admin-photo-whole-copy-accepted-v1:";
const journalPrefix = "bike-packing-admin-photo-whole-copy-commands-v1:";
const engines = ["chromium", "mobile-webkit"], cases = ["positive", "lost-ack", "cancel"];
const expect = baseExpect.configure({ timeout: 60_000 });
const clone = value => structuredClone(value);
const sha = text => createHash("sha256").update(text, "utf8").digest("hex");
const assertLocalBlobUrl = url => {
  assert.equal(url.protocol, "blob:"); assert.equal(url.origin, frontendOrigin);
  assert.equal(url.search, ""); assert.equal(url.hash, "");
  assert.equal(url.username, ""); assert.equal(url.password, "");
  assert.match(url.href, /^blob:https:\/\/experiment\.vniipo-help\.ru\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
};
const selection = (name, values) => {
  const value = process.env[name];
  assert.ok(value === undefined || values.includes(value), `${name} must be absent or one of ${values.join(", ")}`);
  return value === undefined ? values : [value];
};
const loopback = (value, name) => {
  const url = new URL(value);
  assert.equal(url.protocol, "http:", name); assert.equal(url.hostname, "127.0.0.1", name);
  assert.ok(url.port && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash, name);
  return url.origin;
};
const binding = (side, session) => side.binding || ({ environment: "bike-packing-experiment", actorId: session.actorId, listId: side.listId, itemKey: side.itemKey });
const openInput = value => value.itemKey.startsWith("shared-layout:")
  ? { type: "shared", sharedId: value.itemKey.slice("shared-layout:".length) }
  : { type: "demo", demoListId: value.listId, language: "ru" };
const wholeSaves = requests => requests.filter(row => row.method === "POST" && row.path === parentPath && row.body?.body?.photoCopy?.version === 3);
const stages = requests => requests.filter(row => row.method === "POST" && row.path === stagePath);
const cancelled = requests => requests.filter(row => row.method === "POST" && row.path.startsWith(parentPath + "/") && row.path.endsWith("/cancel"));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function destination(value, method, options) {
  const url = new URL(value);
  assert.ok(!url.username && !url.password && !url.hash, "No URL credentials or fragments");
  if (url.origin === canonicalOrigin) {
    assert.ok(url.pathname.startsWith("/experiment" + prefix + "/"), "Exact canonical Experiment prefix required");
    url.pathname = url.pathname.slice("/experiment".length);
  } else {
    assert.equal(url.origin, frontendOrigin, "No external API/photo fallback");
    assert.ok(url.pathname.startsWith(prefix + "/"), "Only relative application photo routes use the frontend origin");
    assert.match(url.pathname, /^\/letters-vniipo\/api\/bike-packing\/(?:lists\/[^/]+|admin\/shared-layouts\/[^/]+)\/photos\/[^/]+\/(?:file|thumb)$/);
    assert.equal(method, "GET");
  }
  let origin = options.apiBaseUrl;
  if (url.pathname === prefix + "/auth/me") {
    assert.equal(method, "GET"); origin = options.authBaseUrl;
  } else if (method === "GET") {
    assert.ok([
      /^\/letters-vniipo\/api\/bike-packing\/(?:capabilities|authorization|lists|public-templates|public-shared-layouts|public-lists)$/,
      /^\/letters-vniipo\/api\/bike-packing\/admin\/template-records$/,
      /^\/letters-vniipo\/api\/bike-packing\/public-template-payloads\/(?:demo-state(?:%3[Aa](?:ru|en))?|shared-layout%3[Aa][a-f0-9-]{36})$/,
      /^\/letters-vniipo\/api\/bike-packing\/admin\/template-operations\/[a-f0-9-]{36}$/,
      /^\/letters-vniipo\/api\/bike-packing\/admin\/template-photo-assets\/whole-copy\/[a-f0-9-]{36}$/,
      /^\/letters-vniipo\/api\/bike-packing\/lists\/[^/]+(?:\/(?:state|freshness|changes|snapshots|photos\/[^/]+\/(?:file|thumb)))?$/,
      /^\/letters-vniipo\/api\/bike-packing\/admin\/shared-layouts\/[^/]+\/(?:state|photos\/[^/]+\/(?:file|thumb))$/,
    ].some(pattern => pattern.test(url.pathname)), `Unexpected read route: ${url.pathname}`);
  } else {
    assert.equal(method, "POST", "No legacy PUT/DELETE/business writer is part of this acceptance");
    assert.ok(url.pathname === parentPath || url.pathname === parentPath + "/prepare" || url.pathname === stagePath
      || new RegExp("^" + parentPath + "/[a-f0-9-]{36}/cancel$").test(url.pathname), `Unexpected write route: ${url.pathname}`);
  }
  // tagsBaseUrl is deliberately not a catch-all. Add a read route only after an
  // actual app request and its service implementation establish its necessity.
  return { url: origin + url.pathname + url.search, pathname: url.pathname };
}

async function nativeRows(page) {
  const raw = await page.evaluate(name => new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => { request.transaction.abort(); resolve({ actions: [], claims: [] }); };
    request.onerror = () => { if (request.error?.name !== "AbortError") reject(request.error); };
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(["actions", "stage-dispatches"], "readonly");
      const actions = tx.objectStore("actions").getAll(), claims = tx.objectStore("stage-dispatches").getAll();
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve({ actions: actions.result, claims: claims.result }); };
    };
  }), wholeDb);
  return { ...raw, actions: raw.actions.map(row => ({ ...row, raw: clone(row), intent: JSON.parse(row.intentJson), checkedIntentHash: sha(row.intentJson) })) };
}
async function openTemplate(page, side, session) {
  await page.waitForFunction(actor => window.__adminUiTest?.user()?.id === actor, session.actorId, { timeout: 60_000 });
  await page.evaluate(input => window.__adminUiTest.openPrepared(input), openInput(binding(side, session)));
  await page.waitForFunction(listId => {
    const state = __adminUiTest.state(); return state.layouts[state.activeLayoutId]?.adminCausalSource?.binding.listId === listId;
  }, side.listId, { timeout: 60_000 });
}
async function waitAccepted(page, count, timeout = 120_000) {
  await page.waitForFunction(({ prefix, count }) => {
    if (window.__adminUiLastError) throw Error(JSON.stringify(window.__adminUiLastError));
    return Object.keys(localStorage).filter(key => key.startsWith(prefix)).length === count;
  },
    { prefix: acceptedPrefix, count }, { timeout });
}
async function recovery(page, activate, action = "check") {
  if (!await page.locator("#adminTemplateRecoveryDialog").isVisible()) await activate("#syncBtn");
  await expect(page.locator("#adminTemplateRecoveryDialog")).toBeVisible();
  const selector = action === "stop" ? "[data-admin-stop]" : action === "apply" ? "[data-admin-resume]" : "[data-admin-check-result]";
  await expect(page.locator(selector)).toBeEnabled(); await activate(selector);
  if (action === "stop") {
    await expect(page.locator("#confirmDialog")).toBeVisible(); await activate("#confirmOkBtn");
  }
}

async function observe(page, seed, requests) {
  const records = await nativeRows(page), targetBinding = records.actions[0]?.intent.binding;
  const local = await page.evaluate(({ sourceList, targetList, acceptedPrefix, journalPrefix }) => {
    const state = __adminUiTest.state(), find = list => list && Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === list);
    const namespace = row => row && ({ layout: row,
      items: Object.fromEntries(Object.entries(state.items).filter(([, value]) => value.publicCatalogLayoutId === row.id)),
      containers: Object.fromEntries(Object.entries(state.containers).filter(([, value]) => value.publicCatalogLayoutId === row.id)) });
    const rows = prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix)).map(([key, raw]) => ({ key, raw, value: JSON.parse(raw) }));
    const mirror = __adminUiTest.mirrorContext(), target = find(targetList);
    return { state: { full: state, source: namespace(find(sourceList)), target: namespace(find(targetList)), privatePayload: __adminUiTest.privatePayload() },
      context: target ? __adminUiTest.operationContext(target.adminCausalSource.binding, target.id, true) : null,
      mirror, plans: rows("bike-packing-admin-save-plans-v1:"),
      journals: rows(journalPrefix), acceptances: rows(acceptedPrefix), error: window.__adminUiLastError || null,
      bodyText: document.body.innerText, decodedPhoto: window.__wholeDecodedPhoto || null };
  }, { sourceList: seed.source.listId, targetList: targetBinding?.listId, acceptedPrefix, journalPrefix });
  assert.equal(local.mirror.indexedDB, true, "The actual release must use its IndexedDB account mirror");
  const durableMirror = await page.evaluate(key => new Promise((resolve, reject) => {
    const open = indexedDB.open("bike-packing-personal-mirrors-v1");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction("entries", "readonly"), request = tx.objectStore("entries").getAll();
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.oncomplete = () => { db.close(); resolve(request.result.filter(row => row.namespace === "snapshot" && row.key === key)); };
    };
  }), local.mirror.key);
  assert.equal(durableMirror.length, 1); assert.equal(durableMirror[0].raw, local.mirror.raw, "Native committed mirror must match the application's read view");
  return { ...local, durableMirror, records, targetBinding, requests: clone(requests) };
}

// Genuine browser storage and visible forms; every service response is forwarded
// from the disposable canonical API. The caller independently checks SQL/files.
export async function runAdminTemplatePhotoWholeCopyBrowserAcceptance({ t, frontendDirectory, apiBaseUrl, authBaseUrl,
  apiPath = bike, session, seedCase, assertCheckpoint, setWholeEnabled, artifactDirectory,
  bundleOnDirectory = path.join(frontendDirectory, "test-results/admin-template-photo-whole-copy-browser-on-build"),
  bundleOffDirectory = path.join(frontendDirectory, "test-results/admin-template-photo-whole-copy-browser-off-build") }) {
  assert.equal(apiPath, bike); assert.equal(session.cookieName, "personal_tags_session");
  const options = { apiBaseUrl: loopback(apiBaseUrl, "API"), authBaseUrl: loopback(authBaseUrl, "auth") };
  for (const directory of [bundleOnDirectory, bundleOffDirectory]) await fs.access(path.join(directory, "index.html"));
  await fs.mkdir(artifactDirectory, { recursive: true });
  for (const engine of selection("BIKE_PACKING_WHOLE_BROWSER_ENGINE", engines))
    for (const caseName of selection("BIKE_PACKING_WHOLE_BROWSER_CASE", cases))
      await t.test(`real browser whole ${engine}: ${caseName}`, { timeout: 360_000 }, async caseTest => {
        const seed = await seedCase({ engine, caseName });
        assert.ok(seed.source.listId && seed.source.itemKey && seed.personal.listId);
        const browser = await (engine === "chromium" ? chromium : webkit).launch({ headless: true });
        const context = await browser.newContext({ ...(engine === "chromium" ? devices["Desktop Chrome"] : devices["iPhone 15"]),
          locale: "ru-RU", serviceWorkers: "block" });
        await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
        await context.addInitScript(() => {
          if (location.origin === "https://experiment.vniipo-help.ru") localStorage.setItem("bike-packing-language-v1", "ru");
        });
        let page, bundle = bundleOnDirectory, closed = false, hideParent = false, faultId, dropSave = caseName === "lost-ack";
        const requests = [], errors = [];
        const activate = selector => engine === "mobile-webkit" ? page.locator(selector).tap() : page.locator(selector).click();
        const checkpoint = async phase => {
          const observations = await observe(page, seed, requests);
          await assertCheckpoint({ engine, caseName, phase, observations });
          console.info(`[whole browser ${engine}/${caseName}] ${phase}`); caseTest.diagnostic(phase); return observations;
        };
        await context.route("**/*", async route => {
          const request = route.request(), url = new URL(request.url());
          try {
            if (url.protocol === "blob:") { assertLocalBlobUrl(url); await route.continue(); return; }
            if (request.method() === "GET" && url.origin === "https://vniipo-help.ru"
              && ["/shared-ui/photo-gallery/stable.js", "/shared-ui/input-layout/stable.js"].includes(url.pathname)) {
              await route.abort("failed"); return; // Exercise the actual bundled fallback.
            }
            if (url.origin === frontendOrigin && !url.pathname.startsWith(prefix + "/")) {
              assert.equal(request.method(), "GET");
              const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname), file = path.resolve(bundle, "." + relative);
              assert.ok(file.startsWith(path.resolve(bundle) + path.sep));
              const contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
                ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream";
              await route.fulfill({ status: 200, contentType, body: await fs.readFile(file) }); return;
            }
            const target = destination(request.url(), request.method(), options), raw = request.postDataBuffer();
            const row = { method: request.method(), path: target.pathname, body: raw?.length ? JSON.parse(raw.toString("utf8")) : null, status: null };
            requests.push(row);
            if (hideParent && row.method === "GET" && row.path === parentPath + "/" + faultId) {
              row.dropped = "parent read hidden until cold recovery"; await route.abort("failed"); return;
            }
            if (caseName === "cancel" && row.method === "POST" && row.path === stagePath && stages(requests).length === 2) {
              row.dropped = "second stage interrupted before dispatch"; await route.abort("failed"); return;
            }
            const headers = { ...request.headers(), cookie: `${session.cookieName}=${encodeURIComponent(session.token)}`, origin: frontendOrigin };
            delete headers.host; delete headers["content-length"];
            const response = await fetch(target.url, { method: row.method, headers, body: raw || undefined,
              redirect: "manual", signal: AbortSignal.timeout(30_000) });
            row.status = response.status; assert.ok(row.status < 300 || row.status >= 400);
            const bytes = Buffer.from(await response.arrayBuffer());
            if ((response.headers.get("content-type") || "").includes("json")) row.payload = JSON.parse(bytes.toString("utf8"));
            if (dropSave && row.method === "POST" && row.path === parentPath && row.body?.body?.photoCopy?.version === 3) {
              assert.equal(row.payload?.operation?.state, "committed");
              dropSave = false; faultId = row.body.operationId; hideParent = true; row.dropped = "committed response lost";
              await route.abort("failed"); return;
            }
            const responseHeaders = Object.fromEntries(response.headers);
            for (const name of ["content-encoding", "content-length", "set-cookie"]) delete responseHeaders[name];
            await route.fulfill({ status: row.status, headers: responseHeaders, body: bytes });
          } catch (error) {
            if (!closed) errors.push(`${request.method()} ${url.origin}${url.pathname}\n${error.stack}`);
            await route.abort("failed").catch(() => {});
          }
        });
        const start = async () => {
          page = await context.newPage(); page.on("pageerror", error => errors.push(error.stack)); page.setDefaultTimeout(60_000);
          await page.goto(frontendOrigin); await page.locator("body.app-ready").waitFor();
          await page.waitForFunction(actor => __adminUiTest?.user()?.id === actor && __adminUiTest.privateLoadContext().initialRemoteLoadPending === false,
            session.actorId, { timeout: 60_000 });
          await openTemplate(page, seed.source, session);
        };
        const cold = async off => {
          await page.close(); hideParent = false; bundle = off ? bundleOffDirectory : bundleOnDirectory;
          if (off && setWholeEnabled) await setWholeEnabled(false);
          await start();
        };
        try {
          await start(); const before = await checkpoint("bootstrap");
          const sourceId = before.state.source.layout.id, title = `Полная копия ${engine} ${caseName}`;
          await page.getByRole("button", { name: "Создать новую укладку", exact: true }).click();
          await page.locator("#layoutCreateMode").selectOption("template-copy");
          await page.locator("#layoutCopyFrom").selectOption("template-draft:" + sourceId);
          await page.locator("#layoutName").fill(title); await page.locator("#layoutName").blur(); await activate("#saveLayoutBtn");
          if (caseName === "positive") {
            await waitAccepted(page, 1); await expect(page.locator("#layoutDialog")).toBeHidden();
            const accepted = await checkpoint("accepted"), owner = Object.values(accepted.state.target.items).find(item => item.photos?.length);
            assert.ok(owner, "A copied item with a real photograph is required");
            await activate('.tab[data-view="items"]'); await activate(`#itemsView [data-list-item-id="${owner.id}"] .item-title`);
            await expect(page.locator("#itemDialog")).toBeVisible();
            await page.locator("#itemPhotoPreview").scrollIntoViewIfNeeded();
            await expect.poll(() => page.locator("#itemPhotoPreview img").first().evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
            const photo = await page.locator("#itemPhotoPreview img").first().evaluate(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }));
            await activate("#itemPhotoPreview [data-photo-open] >> nth=0");
            await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
            await page.waitForFunction(() => Array.from(document.querySelectorAll("dialog.photo-lightbox img.photo-lightbox-image"))
              .some(image => image.complete && image.naturalWidth > 0 && image.dataset.photoLightboxQuality === "full"));
            const full = await page.locator('dialog.photo-lightbox img.photo-lightbox-image[data-photo-lightbox-quality="full"]').first()
              .evaluate(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }));
            await page.evaluate(value => { window.__wholeDecodedPhoto = value; }, { preview: photo, full });
            await activate(".photo-lightbox-close");
            const name = "Правка после полной копии";
            await page.locator("#itemName").fill(name); await page.locator("#itemName").blur(); await activate("#saveItemBtn");
            await page.waitForFunction(listId => Object.values(__adminUiTest.state().layouts).some(row => row.adminCausalSource?.binding.listId === listId
              && row.adminCausalSource.base.stateRevision === 2 && !row.adminCausalSource.planId), accepted.targetBinding.listId, { timeout: 120_000 });
            await checkpoint("ordinary-save"); await cold(false);
            const after = await checkpoint("cold"); assert.equal(after.state.target.items[owner.id].name, name);
          } else if (caseName === "lost-ack") {
            await expect.poll(() => wholeSaves(requests).filter(row => row.dropped).length).toBe(1);
            await checkpoint("lost-ack"); await cold(true);
            if (await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, acceptedPrefix) === 0) {
              await recovery(page, activate);
              if (await page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, acceptedPrefix) === 0)
                await recovery(page, activate, "apply");
            }
            await waitAccepted(page, 1); await checkpoint("cold");
          } else {
            await expect.poll(() => stages(requests).filter(row => row.dropped).length).toBe(1);
            if (await page.locator("#layoutDialog").isVisible()) await page.locator('#layoutDialog button[value="cancel"]').first().click();
            await recovery(page, activate, "stop");
            await expect.poll(() => cancelled(requests).filter(row => row.payload?.result?.payload?.code === "operation_cancelled").length).toBe(1);
            await checkpoint("cancelled"); await cold(true); await checkpoint("cold");
          }
          const final = await checkpoint("final");
          assert.equal(final.records.actions.length, 1); assert.equal(wholeSaves(requests).length, caseName === "cancel" ? 0 : 1);
          assert.equal(final.acceptances.length, caseName === "cancel" ? 0 : 1);
          assert.deepEqual(final.state.privatePayload, before.state.privatePayload);
          assert.deepEqual(errors, []);
          await fs.writeFile(path.join(artifactDirectory, `${engine}-${caseName}.json`), JSON.stringify({ observations: final, requests, errors }, null, 2));
        } catch (error) {
          const observations = page && !page.isClosed() ? await observe(page, seed, requests).catch(failure => ({ failure: failure.message })) : null;
          await fs.writeFile(path.join(artifactDirectory, `${engine}-${caseName}-failure.json`), JSON.stringify({ error: error.stack, observations, requests, errors }, null, 2));
          if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifactDirectory, `${engine}-${caseName}.png`), fullPage: true }).catch(() => {});
          throw error;
        } finally {
          closed = true; await context.tracing.stop({ path: path.join(artifactDirectory, `${engine}-${caseName}-trace.zip`) });
          await context.close(); await browser.close();
        }
      });
}
