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
const parentPath = bike + "/admin/template-operations", stagePath = bike + "/admin/template-photo-assets/tree-copy";
const treeDb = "bike-packing-admin-template-photo-tree-copy-actions-v1";
const acceptedPrefix = "bike-packing-admin-photo-tree-copy-accepted-v1:";
const journalPrefix = "bike-packing-admin-photo-tree-copy-commands-v1:";
const engines = ["chromium", "mobile-webkit"], cases = ["positive", "lost-ack", "mirror-quota", "acceptance-quota", "cancel", "late-commit"];
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
const treeSaves = requests => requests.filter(row => row.method === "POST" && row.path === parentPath && row.body?.body?.photoCopy?.version === 2);
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
      /^\/letters-vniipo\/api\/bike-packing\/admin\/template-photo-assets\/tree-copy\/[a-f0-9-]{36}$/,
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
  }), treeDb);
  return { ...raw, actions: raw.actions.map(row => ({ ...row, raw: clone(row), intent: JSON.parse(row.intentJson), checkedIntentHash: sha(row.intentJson) })) };
}
async function observe(page, seed, requests, personalHydration = null) {
  const records = await nativeRows(page);
  const local = await page.evaluate(({ sourceList, targetList, acceptedPrefix, journalPrefix }) => {
    const state = window.__adminUiTest.state();
    const layout = list => Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === list);
    const namespace = row => row && ({ layout: row,
      items: Object.fromEntries(Object.entries(state.items).filter(([, value]) => value.publicCatalogLayoutId === row.id)),
      containers: Object.fromEntries(Object.entries(state.containers).filter(([, value]) => value.publicCatalogLayoutId === row.id)) });
    const rows = prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix)).map(([key, raw]) => ({ key, raw, value: JSON.parse(raw) }));
    const target = layout(targetList), mirror = __adminUiTest.mirrorContext();
    return { state: { full: { ...state, activeLayoutId: state.activeLayoutId }, source: namespace(layout(sourceList)), target: namespace(target), privatePayload: __adminUiTest.privatePayload() },
      mirror: { ...mirror, raw: localStorage.getItem(mirror.key) },
      privateLoadContext: __adminUiTest.privateLoadContext(),
      privateMeta: __adminUiTest.privateMeta(),
      context: target ? __adminUiTest.operationContext(target.adminCausalSource.binding, target.id, true) : null,
      fetchCredentials: window.__treeBrowserFetchCredentials,
      sharedRuntimes: { gallery: window.VniipoPhotoGallery?.version, input: window.VniipoInputLayout?.version },
      decodedCopiedPhoto: window.__treeBrowserDecodedPhoto || null,
      previewImages: Array.from(document.querySelectorAll("#itemPhotoPreview img")).map(image => {
        const box = image.getBoundingClientRect();
        return { src: image.currentSrc || image.getAttribute("src"), remote: image.dataset.photoRemoteFullSrc,
          complete: image.complete, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
          box: { x: box.x, y: box.y, width: box.width, height: box.height }, viewportHeight: innerHeight };
      }),
      plans: rows("bike-packing-admin-save-plans-v1:").map(row => ({ ...row, plan: row.value.plan })),
      journals: rows(journalPrefix), acceptances: rows(acceptedPrefix), error: window.__adminUiLastError || null,
      formFailure: window.__treeFormFailure || null,
      recordFailure: window.__treeRecordFailure || null, editorFailure: window.__treeEditorFailure || null,
      fault: window.__treeBrowserFault || null, nativeQuota: window.__treeBrowserQuota || null };
  }, { sourceList: seed.source.listId, targetList: seed.target.listId, acceptedPrefix, journalPrefix });
  return { ...local, records, personalHydration: clone(personalHydration), requests: clone(requests), operationIds: records.actions.map(row => row.intent.action.operationId),
    stageIds: records.actions.flatMap(row => row.intent.action.body.photoCopy.owners.flatMap(owner => owner.photos.map(photo => photo.assetId))) };
}

async function openTemplate(page, side, session) {
  await page.waitForFunction(actor => window.__adminUiTest?.user()?.id === actor, session.actorId, { timeout: 60_000 });
  await page.evaluate(input => window.__adminUiTest.openPrepared(input), openInput(binding(side, session)));
  await page.waitForFunction(listId => {
    const state = __adminUiTest.state(); return state.layouts[state.activeLayoutId]?.adminCausalSource?.binding.listId === listId;
  }, side.listId, { timeout: 60_000 });
}
async function picker(page, seed, session, activate) {
  await openTemplate(page, seed.source, session);
  const ids = await page.evaluate(({ sourceList, targetList, rootId }) => {
    const state = __adminUiTest.state(), source = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === sourceList),
      target = Object.values(state.layouts).find(row => row.adminCausalSource?.binding.listId === targetList);
    return { root: source.adminCausalSource.photoOwnerMap.owners.find(row => row.type === "containers" && row.serverId === rootId)?.localId, target: target?.id };
  }, { sourceList: seed.source.listId, targetList: seed.target.listId, rootId: seed.sourceRootEntityId });
  assert.ok(ids.root && ids.target, "Both real materialized owner maps are required");
  await activate('.tab[data-view="packing"]');
  await activate(`#packingView .container-card[data-root-container-id="${ids.root}"] > .container-header .container-title h2`);
  await expect(page.locator("#rootContainerDialog")).toBeVisible();
  await activate("#rootContainerCopyToContainerBtn");
  await expect(page.locator("#containerPickerDialog")).toBeVisible();
  await page.locator("#containerPickerLayoutSelect").selectOption(ids.target);
  const target = '#containerPickerBoard [data-pick-root-index="1"]';
  await expect(page.locator(target)).toBeVisible(); return target;
}
async function waitAccepted(page, count, timeout = 120_000) {
  await page.waitForFunction(({ prefix, count }) => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length === count,
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

/** All URLs are explicit disposable loopback servers; credentials never enter
 * returned observations/logs. The BE callback independently checks SQL/FS.
 * No retries. A diagnostic filter changes the selected cases, never their tests.
 */
export async function runAdminTemplatePhotoTreeCopyBrowserAcceptance({ t, frontendDirectory, apiBaseUrl, authBaseUrl, tagsBaseUrl,
  apiPath = bike, session, seedCase, assertCheckpoint, setTreeEnabled, artifactDirectory,
  bundleOnDirectory = path.join(frontendDirectory, "test-results/admin-template-photo-tree-copy-browser-on-build"),
  bundleOffDirectory = path.join(frontendDirectory, "test-results/admin-template-photo-tree-copy-browser-off-build") }) {
  assert.equal(apiPath, bike); assert.equal(session.cookieName, "personal_tags_session");
  assert.ok(typeof session.token === "string" && session.token && typeof session.actorId === "string" && session.actorId);
  const options = { apiBaseUrl: loopback(apiBaseUrl, "apiBaseUrl"), authBaseUrl: loopback(authBaseUrl, "authBaseUrl") };
  if (tagsBaseUrl) options.tagsBaseUrl = loopback(tagsBaseUrl, "tagsBaseUrl");
  assert.equal(typeof seedCase, "function"); assert.equal(typeof assertCheckpoint, "function");
  assert.ok(setTreeEnabled === undefined || typeof setTreeEnabled === "function");
  assert.ok(path.isAbsolute(frontendDirectory) && path.isAbsolute(artifactDirectory));
  for (const directory of [bundleOnDirectory, bundleOffDirectory]) await fs.access(path.join(directory, "index.html"));
  const selectedEngines = selection("BIKE_PACKING_TREE_BROWSER_ENGINE", engines), selectedCases = selection("BIKE_PACKING_TREE_BROWSER_CASE", cases);
  const bundledVersions = Object.fromEntries(await Promise.all([["gallery", "vniipo-photo-gallery-fallback.js"], ["input", "vniipo-input-layout-fallback.js"]]
    .map(async ([name, file]) => {
      const text = await fs.readFile(path.join(frontendDirectory, "src/vendor", file), "utf8"), version = text.match(/const VERSION = "([^"]+)";/)?.[1];
      assert.ok(version, "Actual bundled fallback version required"); return [name, version];
    })));
  await fs.mkdir(artifactDirectory, { recursive: true });
  for (const engine of selectedEngines) for (const caseName of selectedCases) await t.test(`real browser tree ${engine}: ${caseName}`, { timeout: 540_000 }, async caseTest => {
    const seed = await seedCase({ engine, caseName });
    for (const side of [seed.source, seed.target]) { assert.ok(side.listId && side.itemKey && Number.isInteger(side.stateRevision)); }
    assert.notEqual(seed.source.listId, seed.target.listId);
    assert.ok(seed.personal?.listId && seed.personal.payload && Number.isSafeInteger(seed.personal.stateRevision));
    assert.notEqual(seed.personal.listId, seed.source.listId); assert.notEqual(seed.personal.listId, seed.target.listId);
    assert.ok(Number.isSafeInteger(seed.target.stateRevision) && seed.target.stateRevision >= 0, "Mirror quota needs the confirmed numeric target baseline");
    // Chromium's GPU child may ignore CHROME_LOG_FILE and write debug.log in
    // its inherited cwd. All service processes are already running and this
    // serial browser launcher restores the harness cwd before any UI work.
    const previousDirectory = process.cwd(); let browser;
    try {
      process.chdir(artifactDirectory);
      browser = await (engine === "chromium" ? chromium : webkit).launch({ headless: true,
        ...(engine === "chromium" ? { env: { ...process.env, CHROME_LOG_FILE: path.join(artifactDirectory, `${engine}-${caseName}-chrome.log`) } } : {}) });
    } finally { process.chdir(previousDirectory); }
    const context = await browser.newContext({ ...(engine === "chromium" ? devices["Desktop Chrome"] : devices["iPhone 15"]), locale: "ru-RU", serviceWorkers: "block" });
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
    await context.addInitScript(() => {
      if (location.origin === "https://experiment.vniipo-help.ru") localStorage.setItem("bike-packing-language-v1", "ru");
      const original = window.fetch;
      window.__treeBrowserFetchCredentials = [];
      window.fetch = function (input, init) {
        const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
        if (url.origin === "https://api.vniipo-help.ru") window.__treeBrowserFetchCredentials.push({
          method: init?.method || (input instanceof Request ? input.method : "GET"), path: url.pathname,
          credentials: init?.credentials ?? (input instanceof Request ? input.credentials : "same-origin") });
        return original.apply(this, arguments);
      };
    });
    let page, bundle = bundleOnDirectory, closed = false, personalHydration = null, privateBaseline = null;
    const requests = [], errors = [], blockedDependencies = [], firstStage = deferred(), releaseStage = deferred();
    let holdFirstStage = true, faultId = null, hideParent = false, dropSave = ["lost-ack", "late-commit"].includes(caseName);
    const checkpoint = async phase => {
      console.info(`[tree browser ${engine}/${caseName}] ${phase}: checking`);
      caseTest.diagnostic(`tree browser ${engine}/${caseName}: ${phase}`);
      const observations = await observe(page, seed, requests, personalHydration);
      for (const row of observations.fetchCredentials) if (/\/(?:auth\/me|bike-packing\/authorization)$/.test(row.path)
        || row.path.includes("/admin/template-operations") || row.path.includes("/admin/template-photo-assets/tree-copy")) {
        assert.equal(row.credentials, "include", `Actual authenticated browser fetch credentials: ${row.method} ${row.path}`);
      }
      assert.deepEqual(observations.sharedRuntimes, bundledVersions, "Actual bundled Shared UI runtimes remain active after the two blocked external scripts");
      await assertCheckpoint({ engine, caseName, phase, observations });
      console.info(`[tree browser ${engine}/${caseName}] ${phase}: checked`); return observations;
    };
    const activate = selector => engine === "mobile-webkit" ? page.locator(selector).tap() : page.locator(selector).click();
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      try {
        // WebKit routes object URLs too. Leave the exact same-origin native
        // memory blob to the browser; it is neither a bundle file nor a fetch.
        if (url.protocol === "blob:") {
          assert.equal(request.method(), "GET"); assertLocalBlobUrl(url);
          await route.continue(); return;
        }
        // Isolated bootstrap intentionally exercises the existing bundled
        // Shared UI fallbacks. It does not contact or emulate SharedServices.
        if (request.method() === "GET" && url.origin === "https://vniipo-help.ru" && !url.hash
          && ["/shared-ui/photo-gallery/stable.js", "/shared-ui/input-layout/stable.js"].includes(url.pathname)) {
          const gallery = url.pathname.includes("photo-gallery"), query = [...url.searchParams.keys()].sort();
          assert.deepEqual(query, gallery ? ["bundled", "contract", "window"] : ["contract", "window"]);
          assert.equal(url.searchParams.get("contract"), gallery ? "2" : "1");
          assert.match(url.searchParams.get("window"), /^\d+$/);
          if (gallery) assert.equal(url.searchParams.get("bundled"), bundledVersions.gallery);
          blockedDependencies.push({ method: "GET", origin: url.origin, path: url.pathname }); await route.abort("failed"); return;
        }
        if (url.origin === frontendOrigin && !url.pathname.startsWith(prefix + "/")) {
          assert.equal(request.method(), "GET");
          const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname), file = path.resolve(bundle, "." + relative);
          assert.ok(file.startsWith(path.resolve(bundle) + path.sep), "Bundle path traversal refused");
          const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" }[path.extname(file)] || "application/octet-stream";
          await route.fulfill({ status: 200, contentType: mime, body: await fs.readFile(file) }); return;
        }
        const target = destination(request.url(), request.method(), options), rawBody = request.postDataBuffer();
        const row = { method: request.method(), path: target.pathname, query: url.search,
          body: rawBody?.length ? JSON.parse(rawBody.toString("utf8")) : null, status: null };
        requests.push(row);
        if (row.method === "POST" && row.path === stagePath && holdFirstStage) {
          holdFirstStage = false; firstStage.resolve(); await releaseStage.promise;
        }
        if (hideParent && row.method === "GET" && row.path === parentPath + "/" + faultId) {
          row.dropped = "GET blocked during deliberate lost ACK window"; await route.abort("failed"); return;
        }
        if (caseName === "cancel" && row.method === "POST" && row.path === stagePath && stages(requests).length === 2) {
          faultId = row.body.manifest.templateOperationId; row.dropped = "second stage interrupted before send after one real stage";
          await route.abort("failed"); return;
        }
        const headers = { ...request.headers(), cookie: `${session.cookieName}=${encodeURIComponent(session.token)}` };
        delete headers.host; delete headers["content-length"];
        headers.origin = frontendOrigin;
        // Node fetch keeps the canonical fixture cookie outside Playwright's
        // trace/API call arguments; the destination has already been validated.
        const response = await fetch(target.url, { method: row.method, headers, body: rawBody || undefined,
          redirect: "manual", signal: AbortSignal.timeout(30_000) });
        row.status = response.status; assert.ok(row.status < 300 || row.status >= 400, "Redirects are forbidden");
        const bytes = Buffer.from(await response.arrayBuffer());
        if ((response.headers.get("content-type") || "").includes("json")) row.payload = JSON.parse(bytes.toString("utf8"));
        if (dropSave && row.method === "POST" && row.path === parentPath && row.body?.body?.photoCopy?.version === 2) {
          assert.equal(row.payload?.operation?.state, "committed", "Lost ACK must follow a real commit");
          dropSave = false; faultId = row.body.operationId; hideParent = true; row.dropped = "committed response lost";
          await route.abort("failed"); return;
        }
        const responseHeaders = Object.fromEntries(response.headers);
        delete responseHeaders["content-encoding"]; delete responseHeaders["content-length"]; delete responseHeaders["set-cookie"];
        await route.fulfill({ status: row.status, headers: responseHeaders, body: bytes });
      } catch (error) {
        if (!closed) errors.push(`${request.method()} ${url.origin}${url.pathname}${url.search ? "?[redacted]" : ""}\n${error.stack || error}`);
        await route.abort("failed").catch(() => {});
      }
    });
    const start = async () => {
      const requestStartIndex = requests.length;
      personalHydration = { requestStartIndex, listId: seed.personal.listId, stateRevision: seed.personal.stateRevision };
      page = await context.newPage(); page.on("pageerror", error => errors.push(error.stack || error.message));
      page.setDefaultTimeout(60_000); await page.goto(frontendOrigin);
      await page.locator("body.app-ready").waitFor({ timeout: 60_000 });
      const privateIds = Object.fromEntries(["layouts", "items", "containers"].map(kind => [kind, Object.keys(seed.personal.payload[kind] || {}).sort()]));
      await page.waitForFunction(({ actorId, privateIds }) => {
        const hook = window.__adminUiTest, loading = hook?.privateLoadContext?.();
        if (hook?.user()?.id !== actorId || loading?.initialRemoteLoadPending !== false) return false;
        const payload = hook.privatePayload();
        return Object.entries(privateIds).every(([kind, ids]) => JSON.stringify(Object.keys(payload[kind] || {}).sort()) === JSON.stringify(ids));
      }, { actorId: session.actorId, privateIds }, { timeout: 60_000 });
      // A convenience selected-list pointer is not hydration authority. Bind
      // the exact personal namespace to a real response from THIS page load.
      const personalPath = `${bike}/lists/${encodeURIComponent(seed.personal.listId)}`;
      const stateRead = requests.slice(requestStartIndex).find(row => row.method === "GET" && row.path === personalPath + "/state"
        && row.status === 200 && row.payload?.ok === true && row.payload.listId === seed.personal.listId
        && row.payload.stateRevision === seed.personal.stateRevision && row.payload.payload);
      const freshnessRead = requests.slice(requestStartIndex).find(row => row.method === "GET" && row.path === personalPath + "/freshness"
        && row.status === 200 && row.payload?.ok === true && row.payload.listId === seed.personal.listId
        && row.payload.stateRevision === seed.personal.stateRevision);
      const privatePayload = await page.evaluate(() => __adminUiTest.privatePayload());
      assert.ok(stateRead || privateBaseline && freshnessRead, "This page must receive the exact personal state, or revalidate its existing snapshot through real freshness");
      if (privateBaseline) assert.deepEqual(privatePayload, privateBaseline, "Cold personal hydration preserves the independent full private snapshot");
      else privateBaseline = clone(privatePayload);
      await openTemplate(page, seed.target, session);
    };
    const cold = async (off, blockParent = false) => {
      await checkpoint("before-cold");
      await page.close(); bundle = off ? bundleOffDirectory : bundleOnDirectory; hideParent = blockParent;
      if (off && setTreeEnabled) await setTreeEnabled(false);
      await start();
      if (off && setTreeEnabled) {
        const advertised = await page.evaluate(async url => {
          const response = await fetch(url, { credentials: "include" });
          if (!response.ok) throw Error("Actual OFF capabilities unavailable"); return response.json();
        }, canonicalOrigin + "/experiment" + bike + "/capabilities");
        assert.ok(Array.isArray(advertised.capabilities));
        assert.ok(!advertised.capabilities.includes("adminTemplatePhotoTreeCopyV1"), "Real API must withdraw its tree write capability while OFF");
      }
    };
    const finishConfirmedRecovery = async () => {
      // Opening a retained template invokes the real cold GET/apply hook. If it
      // has already accepted this exact result, do not click Sync and create an
      // unrelated ordinary save just to force the recovery dialog to appear.
      const accepted = () => page.evaluate(prefix => Object.keys(localStorage).filter(key => key.startsWith(prefix)).length, acceptedPrefix);
      if (await accepted() === 0) {
        await recovery(page, activate);
        if (await accepted() === 0) {
          await expect(page.locator("[data-admin-resume]")).toHaveText("Применить результат");
          await recovery(page, activate, "apply");
        }
      }
      await waitAccepted(page, 1);
    };
    let final;
    try {
      await start(); await openTemplate(page, seed.source, session);
      const before = await checkpoint("bootstrap"), firstControl = await picker(page, seed, session, activate);
      let attemptedIntent = null;
      if (caseName === "mirror-quota") await page.evaluate(name => {
        const add = IDBObjectStore.prototype.add;
        window.__treeBrowserQuota = { armed: true, attempts: [], removals: [] };
        IDBObjectStore.prototype.add = function (value, ...args) {
          if (this.transaction.db.name === name && this.name === "actions") {
            __treeBrowserQuota.attempts.push(structuredClone(value));
            if (__treeBrowserQuota.armed) {
              __treeBrowserQuota.armed = false; this.transaction.abort();
              throw new DOMException("Native transaction quota injected", "QuotaExceededError");
            }
          }
          return add.call(this, value, ...args);
        };
        const remove = Storage.prototype.removeItem;
        Storage.prototype.removeItem = function (key) {
          if (/^bike-packing-(?:prototype-(?:state|base-state)|recovery-state)-v1/.test(key)) __treeBrowserQuota.removals.push(key);
          return remove.call(this, key);
        };
      }, treeDb);
      const clearAttemptDiagnostic = () => page.evaluate(() => {
        window.__adminUiLastError = null; window.__treeFormFailure = null;
        window.__treeRecordFailure = null; window.__treeEditorFailure = null;
      });
      await clearAttemptDiagnostic();
      await activate(firstControl);
      if (caseName === "mirror-quota") {
        await page.waitForFunction(() => window.__treeBrowserQuota.attempts.length === 1);
        await expect(page.locator(firstControl)).toBeEnabled();
        const failed = await checkpoint("native-idb-quota");
        assert.equal(failed.records.actions.length, 0); assert.equal(failed.records.claims.length, 0);
        assert.equal(failed.plans.filter(row => row.plan.version === 9).length, 0);
        assert.equal(stages(requests).length, 0); assert.equal(treeSaves(requests).length, 0);
        assert.deepEqual(failed.state.target.items, before.state.target.items); assert.deepEqual(failed.state.target.containers, before.state.target.containers);
        assert.deepEqual(failed.nativeQuota.removals, []);
        attemptedIntent = failed.nativeQuota.attempts[0];
        await clearAttemptDiagnostic();
        await activate(firstControl);
      }
      console.info(`[tree browser ${engine}/${caseName}] waiting for first stage or actual submission failure`);
      caseTest.diagnostic(`tree browser ${engine}/${caseName}: waiting for first stage or precise form failure`);
      let stageWaitFinished = false, timer;
      const formFailure = (async () => {
        while (!stageWaitFinished) {
          const failure = await page.evaluate(() => window.__treeFormFailure || window.__adminUiLastError || null);
          if (failure) throw Error(`Actual tree form submission failed: ${failure.code || ""} ${failure.message || failure}\n${failure.stack || ""}`);
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      })();
      try {
        await Promise.race([firstStage.promise, formFailure, new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error("First tree stage not reached")), 90_000); timer.unref?.();
        })]);
      } finally { stageWaitFinished = true; clearTimeout(timer); }
      const captured = await checkpoint("before-first-stage");
      assert.equal(captured.records.actions.length, 1); assert.equal(captured.plans.filter(row => row.plan.version === 9).length, 1);
      assert.deepEqual(captured.state.target.items, before.state.target.items); assert.deepEqual(captured.state.target.containers, before.state.target.containers);
      assert.equal(captured.state.target.layout.adminCausalSource.photoTreeCopyPending, captured.operationIds[0]);
      assert.equal(captured.records.actions[0].intentHash, captured.records.actions[0].checkedIntentHash);
      if (attemptedIntent) assert.deepEqual(captured.records.actions[0].raw, attemptedIntent, "Same open selection retries its original native bytes and IDs");
      if (caseName === "mirror-quota") await page.evaluate(({ listId, operationId, base }) => {
        if (!Number.isSafeInteger(base) || base < 0) throw Error("Confirmed mirror quota baseline is required");
        const original = Storage.prototype.setItem;
        window.__treeBrowserFault = { enabled: true, hits: 0, operationId, base };
        Storage.prototype.setItem = function (key, value) {
          if (__treeBrowserFault.enabled && String(key).startsWith("bike-packing-prototype-state-v1")) {
            let state; try { state = JSON.parse(value); } catch {}
            const layout = Object.values(state?.layouts || {}).find(row => row.adminCausalSource?.binding.listId === listId);
            if (layout && !layout.adminCausalSource.photoTreeCopyPending && layout.adminCausalSource.base.stateRevision > __treeBrowserFault.base) {
              __treeBrowserFault.hits++; throw new DOMException("Native mirror quota injected", "QuotaExceededError");
            }
          }
          return original.call(this, key, value);
        };
      }, { listId: seed.target.listId, operationId: captured.operationIds[0], base: seed.target.stateRevision });
      if (caseName === "acceptance-quota") await page.evaluate(prefix => {
        const original = Storage.prototype.setItem;
        window.__treeBrowserFault = { enabled: true, hits: 0 };
        Storage.prototype.setItem = function (key, value) {
          if (__treeBrowserFault.enabled && String(key).startsWith(prefix)) {
            __treeBrowserFault.hits++; throw new DOMException("Native acceptance quota injected after mirror", "QuotaExceededError");
          }
          return original.call(this, key, value);
        };
      }, acceptedPrefix);
      releaseStage.resolve();
      if (caseName === "positive") {
        await waitAccepted(page, 1); await checkpoint("first-copy");
        await openTemplate(page, seed.target, session);
        const photoOwner = captured.records.actions[0].intent.action.body.photoCopy.owners.find(owner => owner.entityType === "item" && owner.photos.length);
        assert.ok(photoOwner, "Joint seed includes a copied item photo for real image decode");
        const copiedLocalId = captured.records.actions[0].intent.snapshot.copiedOwners.find(owner => owner.serverId === photoOwner.entityId).localId;
        await activate('.tab[data-view="items"]'); await activate(`#itemsView [data-list-item-id="${copiedLocalId}"] .item-title`);
        await expect(page.locator("#itemDialog")).toBeVisible();
        await page.locator("#itemPhotoPreview").scrollIntoViewIfNeeded();
        await expect(page.locator("#itemPhotoPreview")).toBeVisible();
        await page.waitForFunction(() => {
          const image = document.querySelector("#itemPhotoPreview img"); return image?.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
        }, null, { timeout: 60_000 });
        const preview = await page.locator("#itemPhotoPreview img").first().evaluate(image => ({ src: image.currentSrc,
          fullSrc: image.dataset.photoRemoteFullSrc, width: image.naturalWidth, height: image.naturalHeight }));
        assert.ok(preview.fullSrc.includes(`/photos/${photoOwner.photos[0].photoId}/file`), "Preview belongs to the copied target photograph");
        await activate("#itemPhotoPreview [data-photo-open] >> nth=0");
        await expect(page.locator("dialog.photo-lightbox")).toBeVisible();
        await page.waitForFunction(() => Array.from(document.querySelectorAll("dialog.photo-lightbox img.photo-lightbox-image"))
          .some(image => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 && image.dataset.photoLightboxQuality === "full"), null, { timeout: 60_000 });
        const full = await page.locator('dialog.photo-lightbox img.photo-lightbox-image[data-photo-lightbox-quality="full"]').first()
          .evaluate(image => ({ src: image.currentSrc, width: image.naturalWidth, height: image.naturalHeight }));
        for (const decoded of [preview, full]) {
          assert.ok(decoded.width > 0 && decoded.height > 0, "The actual copied image must decode in the browser");
          const imageUrl = new URL(decoded.src); if (imageUrl.protocol === "blob:") assertLocalBlobUrl(imageUrl);
        }
        await page.evaluate(value => { window.__treeBrowserDecodedPhoto = value; }, { serverId: photoOwner.entityId,
          photoId: photoOwner.photos[0].photoId, preview, full });
        await checkpoint("copied-photo-decoded");
        await activate(".photo-lightbox-close"); await activate('#itemDialog header button[value="cancel"]');
        await expect(page.locator("#itemDialog")).toBeHidden();
        const itemId = await page.evaluate(({ listId, serverId }) => Object.values(__adminUiTest.state().layouts)
          .find(row => row.adminCausalSource?.binding.listId === listId).adminCausalSource.photoOwnerMap.owners
          .find(row => row.type === "items" && row.serverId === serverId)?.localId,
        { listId: seed.target.listId, serverId: seed.ordinaryItemEntityId });
        assert.ok(itemId, "Seed must identify an existing target item for the ordinary save");
        await activate('.tab[data-view="items"]'); await activate(`#itemsView [data-list-item-id="${itemId}"] .item-title`);
        await expect(page.locator("#itemDialog")).toBeVisible();
        const name = `Проверенная правка ${engine === "chromium" ? "Хром" : "Вебкит"}`;
        await page.locator("#itemName").fill(name); await page.locator("#itemName").blur();
        await expect(page.locator("#itemName")).toHaveValue(name); await activate("#saveItemBtn");
        await page.waitForFunction(({ listId, revision }) => Object.values(__adminUiTest.state().layouts).some(row => row.adminCausalSource?.binding.listId === listId
          && row.adminCausalSource.base.stateRevision === revision && !row.adminCausalSource.planId),
        { listId: seed.target.listId, revision: seed.target.stateRevision + 2 }, { timeout: 120_000 });
        await checkpoint("ordinary-save"); await cold(false); await checkpoint("cold");
        const nextControl = await picker(page, seed, session, activate); await activate(nextControl);
        // Actual mobile WebKit trace advanced through three successful stages
        // and the fourth GET at 120s; cold full-record checks grow with target.
        await waitAccepted(page, 2, engine === "mobile-webkit" ? 240_000 : 120_000);
        final = await checkpoint("second-copy");
        assert.equal(treeSaves(requests).length, 2); assert.equal(new Set(final.operationIds).size, 2);
        assert.equal(final.records.actions.length, 2); assert.equal(final.acceptances.length, 2);
        const ordinary = Object.values(final.state.target.items).find(row => row.id === itemId); assert.equal(ordinary?.name, name);
      } else if (caseName === "lost-ack" || caseName === "late-commit") {
        await expect.poll(() => treeSaves(requests).filter(row => row.dropped).length).toBe(1);
        await checkpoint("lost-ack"); await cold(true, caseName === "late-commit");
        if (caseName === "late-commit") {
          // A real stop can race a committed save. Do not synthesize the result:
          // hide its GET only until the explicit Stop marker is durable.
          await recovery(page, activate, "stop");
          await page.waitForFunction(prefix => Object.entries(localStorage).some(([key, raw]) => key.startsWith(prefix) && JSON.parse(raw).cancelRequested === true), journalPrefix);
          hideParent = false;
        }
        await finishConfirmedRecovery(); final = await checkpoint("cold");
        assert.equal(treeSaves(requests).length, 1); assert.equal(stages(requests).length, captured.stageIds.length);
        assert.deepEqual(final.operationIds, captured.operationIds); assert.deepEqual(final.stageIds, captured.stageIds);
      } else if (caseName === "mirror-quota" || caseName === "acceptance-quota") {
        await page.waitForFunction(() => window.__treeBrowserFault.hits > 0, null, { timeout: 120_000 });
        const failed = await checkpoint(caseName); assert.equal(failed.acceptances.length, 0);
        assert.deepEqual(failed.state.target.items, captured.state.target.items); assert.deepEqual(failed.state.target.containers, captured.state.target.containers);
        await cold(true); await finishConfirmedRecovery(); final = await checkpoint("cold"); assert.equal(treeSaves(requests).length, 1);
        assert.deepEqual(final.records.actions, captured.records.actions);
      } else {
        await expect.poll(() => stages(requests).filter(row => row.dropped).length).toBe(1);
        await recovery(page, activate, "stop");
        await expect.poll(() => cancelled(requests).filter(row => row.payload?.result?.payload?.code === "operation_cancelled").length).toBe(1);
        await cold(true); await recovery(page, activate); final = await checkpoint("cold");
        assert.equal(treeSaves(requests).length, 0); assert.equal(final.acceptances.length, 0);
        assert.deepEqual(final.state.target.items, captured.state.target.items); assert.deepEqual(final.state.target.containers, captured.state.target.containers);
        assert.equal(final.journals[0].value.cancelRequested, true); assert.equal(cancelled(requests).length, 1);
      }
      final ||= await checkpoint("final");
      for (const row of final.records.actions) assert.equal(row.intentHash, row.checkedIntentHash);
      assert.ok(final.fetchCredentials.some(row => row.path.endsWith("/auth/me")), "Actual browser auth fetch observed");
      assert.deepEqual(final.state.privatePayload, before.state.privatePayload);
      assert.deepEqual(errors, [], "No page errors, unexpected routes, redirects or external network fallback");
      await checkpoint("final");
      await fs.writeFile(path.join(artifactDirectory, `${engine}-${caseName}.json`), JSON.stringify({ engine, caseName, observations: final, requests, errors, blockedDependencies }, null, 2));
    } catch (error) {
      const observations = page && !page.isClosed() ? await observe(page, seed, requests, personalHydration).catch(failure => ({ observationError: failure.message })) : null;
      await fs.writeFile(path.join(artifactDirectory, `${engine}-${caseName}-failure.json`), JSON.stringify({ error: error.stack, observations, requests, errors, blockedDependencies }, null, 2));
      if (page && !page.isClosed()) await page.screenshot({ path: path.join(artifactDirectory, `${engine}-${caseName}.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally {
      releaseStage.resolve(); closed = true;
      await context.tracing.stop({ path: path.join(artifactDirectory, `${engine}-${caseName}-trace.zip`) });
      await context.close(); await browser.close();
    }
  });
}
