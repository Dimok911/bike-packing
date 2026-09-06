import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { REQUIRED_ADMIN_API_VERSION, REQUIRED_ADMIN_API_CAPABILITIES } from "../../src/config/api-contract.js";

const frontend = "https://experiment.vniipo-help.ru";
const euBase = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api";
const cors = {
  "Access-Control-Allow-Origin": frontend, "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Expose-Headers": "X-Vniipo-Proxy-Target, X-Vniipo-Proxy-Write-Gate", Vary: "Origin",
};

async function fixture(page, context, { gate = "enabled", uploadFailure = false, recovery = false, recoveryAfterReload = false } = {}) {
  const requests = [];
  let receipt = null, pageLoads = 0;
  await context.addCookies([
    { name: "bikepacking_experiment_session", value: "fixture-not-real", domain: ".vniipo-help.ru", path: "/", httpOnly: true, secure: true, sameSite: "None" },
    { name: "personal_tags_session", value: "host-only-fixture", url: "https://api.vniipo-help.ru", httpOnly: true, secure: true, sameSite: "None" },
  ]);
  await context.addInitScript(() => {
    if (!sessionStorage.getItem("bike-packing-experiment-transport-v1")) sessionStorage.setItem("bike-packing-experiment-transport-v1", "eu");
    localStorage.setItem("transport-test-local-state", "local-edit-and-pending-photo");
    window.transportCredentials = [];
    const originalFetch = window.fetch;
    window.fetch = (url, options) => {
      window.transportCredentials.push({ url: String(url), credentials: options?.credentials });
      return originalFetch(url, options);
    };
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      window.transportXhrCredentials = this.withCredentials;
      return originalSend.call(this, body);
    };
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === frontend && url.pathname.startsWith("/src/")) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    if (url.origin === frontend && url.pathname === "/__transport-test") {
      pageLoads++;
      return route.fulfill({ contentType: "text/html", body: `<html><body><div id="settings"></div><button id="run">Run</button><output id="result"></output><script type="module">
        import { apiFetchRequest, apiUploadFormDataRequest } from '/src/sync/api-client.js';
        import { createExperimentTransport, experimentTransport } from '/src/sync/experiment-transport.js';
        import { createPhotoOperationRecovery } from '/src/sync/photo-operation-recovery.js';
        import { renderExperimentTransportSettings, bindExperimentTransportSettings } from '/src/ui/experiment-transport-settings.js';
        document.querySelector('#settings').innerHTML = renderExperimentTransportSettings({language:'en'});
        bindExperimentTransportSettings(document.querySelector('#settings'), {language:'en'});
        // Explicit dependency injection in this isolated fixture only. The
        // shipped singleton's immutable release gate remains disabled.
        const transport = createExperimentTransport({euEnabled:true});
        const photoRecovery = createPhotoOperationRecovery({transport, enabled:${recovery}});
        window.fixtureTransport = transport;
        window.shippedTransport = experimentTransport;
        document.querySelector('#run').onclick = async () => {
          try {
            const auth = await apiFetchRequest('/auth/me', {}, {transport});
            const photo = await transport.fetchPhoto('${frontend}/letters-vniipo/api/bike-packing/lists/test/photos/photo/file', {credentials:'include'});
            const body = new FormData(); body.set('file', new Blob(['fixture-photo'], {type:'image/png'}));
            body.set('photoId','fixture-photo'); body.set('entityId','fixture-item'); body.set('entityType','item');
            const uploaded = await apiUploadFormDataRequest('/bike-packing/lists/test/photos', {body}, {transport, photoRecovery});
            document.querySelector('#result').textContent = JSON.stringify({user:auth.user.id,photo:photo.status,uploaded:uploaded.ok});
          } catch (error) { document.querySelector('#result').textContent = 'ERROR: '+error.message; }
        };
      </script></body></html>` });
    }
    if (["https://api-eu.vniipo-help.ru", "https://201.51.16.219"].includes(url.origin)
      || (url.origin === frontend && url.pathname.startsWith("/letters-vniipo/api/"))) {
      const method = route.request().method();
      const headers = await route.request().allHeaders();
      requests.push({ url: url.href, method, headers });
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      if (url.pathname.endsWith("/capabilities")) return route.fulfill({
        contentType: "application/json", headers: { ...cors, "X-Vniipo-Proxy-Target": "bike-packing-experiment", "X-Vniipo-Proxy-Write-Gate": gate },
        body: JSON.stringify({ ok: true, apiCompatibilityVersion: REQUIRED_ADMIN_API_VERSION,
          capabilities: [...REQUIRED_ADMIN_API_CAPABILITIES, ...(recovery ? ["personalPhotoUploadOperationsV1"] : [])] }),
      });
      if (gate !== "enabled") return route.fulfill({ status: 403, headers: cors, body: "gate closed" });
      if (url.pathname.endsWith("/auth/me")) return route.fulfill({ headers: cors, contentType: "application/json", body: '{"ok":true,"user":{"id":"fixture-user"}}' });
      if (url.pathname.endsWith("/file")) return route.fulfill({ headers: cors, contentType: "image/png", body: "fixture-image" });
      if (method === "GET" && url.pathname.includes("/photo-operations/")) {
        const data = receipt && (!recoveryAfterReload || pageLoads > 1)
          ? receipt : { ok: true, operation: { state: "unknown" } };
        return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify(data) });
      }
      if (method === "POST" && url.pathname.endsWith("/photos")) {
        if (recovery) {
          const multipart = route.request().postDataBuffer().toString("utf8");
          const operationId = multipart.match(/name="operationId"\r\n\r\n([^\r]+)/)?.[1];
          expect(operationId).toMatch(/^[a-f0-9-]{36}$/);
          const fileHash = createHash("sha256").update("fixture-photo").digest("hex");
          receipt = { ok: true, operation: { id: operationId, state: "committed", environment: "bike-packing-experiment",
            actorId: "fixture-user", listId: "test", photoId: "fixture-photo", entityId: "fixture-item", entityType: "item",
            fileHash, thumbHash: fileHash, payloadDigest: "a".repeat(64) },
          photo: { id: "fixture-photo", url: `${frontend}/letters-vniipo/api/bike-packing/lists/test/photos/fixture-photo/file` } };
        }
        if (uploadFailure) return route.abort("failed");
        return route.fulfill({ headers: cors, contentType: "application/json", body: JSON.stringify(receipt || { ok: true }) });
      }
    }
    // This fixture must NEVER reach a real account/API/Production endpoint.
    throw new Error(`Unexpected network destination: ${url.origin}${url.pathname}`);
  });
  await page.goto(`${frontend}/__transport-test`);
  await expect(page.getByRole("heading", { name: "Experiment connection" })).toBeVisible();
  return requests;
}

test("EU transport keeps frontend/local state and credential options for fetch, photo and XHR", async ({ page, context, browserName }) => {
  const requests = await fixture(page, context);
  await page.locator("#run").click();
  await expect(page.locator("#result")).toHaveText('{"user":"fixture-user","photo":200,"uploaded":true}');
  expect(page.url()).toBe(`${frontend}/__transport-test`);
  expect(await page.evaluate(() => localStorage.getItem("transport-test-local-state"))).toBe("local-edit-and-pending-photo");
  expect(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith("bike-packing-experiment-uncertain-write-v1:")).map(key => JSON.parse(localStorage[key]).confirmed))).toEqual([true]);
  const actual = requests.filter(({ method }) => method !== "OPTIONS");
  expect(actual.map(({ url }) => url)).toEqual([
    `${euBase}/bike-packing/capabilities`, `${euBase}/auth/me`, `${euBase}/bike-packing/lists/test/photos/photo/file`, `${euBase}/bike-packing/lists/test/photos`,
  ]);
  expect(actual[0].headers.cookie || "").toBe("");
  expect(await page.evaluate(() => window.transportCredentials.map(({credentials}) => credentials))).toEqual(["omit", "include", "include"]);
  expect(await page.evaluate(() => window.transportXhrCredentials)).toBe(true);
  const matchingCookies = await context.cookies(euBase);
  expect(matchingCookies.map(({ name }) => name)).toEqual(["bikepacking_experiment_session"]);
  for (const request of actual.slice(1)) {
    // Cookie egress is visible in Chromium's intercepted request. WebKit's
    // intercepted fixture did not expose it: live Safari auth remains a gate,
    // not something this mocked response can prove or bypass with fake headers.
    if (browserName === "chromium") {
      expect(request.headers.cookie).toContain("bikepacking_experiment_session=fixture-not-real");
      expect(request.headers.cookie).not.toContain("personal_tags_session");
    }
    expect(request.headers.origin).toBe(frontend);
  }
});

test("read-only gate blocks authenticated transport; IP never claims sign-in or enables EU", async ({ page, context }) => {
  const requests = await fixture(page, context, { gate: "read-only" });
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("read-only");
  await page.getByRole("button", { name: "Check IP (anonymous only)", exact: true }).click();
  await expect(page.locator("[data-transport-status]")).toContainText("Sign-in and sync are not available on IP");
  await expect(page.getByRole("button", { name: "Use EU after reload", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Check EU domain", exact: true }).click();
  await expect(page.locator("[data-transport-status]")).toContainText("write gate is closed");
  expect(requests.filter(({ method }) => method !== "OPTIONS").every(({ url, headers }) => url.endsWith("/capabilities") && !headers.cookie)).toBe(true);
});

test("lost upload response persists a retry barrier across reload without deleting local data", async ({ page, context }) => {
  const requests = await fixture(page, context, { uploadFailure: true });
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("ERROR:");
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  await page.reload();
  await expect(page.locator("[data-transport-status]")).toContainText("unknown outcome");
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("reconcile server state");
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(await page.evaluate(() => localStorage.getItem("transport-test-local-state"))).toBe("local-edit-and-pending-photo");
});

test("release gate blocks shipped EU transport even with enabled proxy and valid fixture cookie", async ({ page, context }) => {
  await fixture(page, context);
  expect(await page.evaluate(async () => {
    try { await window.shippedTransport.prepare(); return "incorrectly enabled"; }
    catch (error) { return error.message; }
  })).toContain("not approved");
  await page.getByRole("button", { name: "Check EU domain", exact: true }).click();
  await expect(page.locator("[data-transport-status]")).toContainText("Activation remains subject to the release gate");
  await expect(page.getByRole("button", { name: "Use EU after reload", exact: true })).toBeDisabled();
});

test("real Web Locks and shared journal block simultaneous EU/direct photo replay in separate tabs", async ({ page, context }) => {
  const requests = await fixture(page, context, { uploadFailure: true });
  const second = await context.newPage();
  await second.goto(`${frontend}/__transport-test`);
  await second.evaluate(() => sessionStorage.setItem("bike-packing-experiment-transport-v1", "direct"));
  await second.reload();
  expect(await page.evaluate(() => Boolean(navigator.locks?.request))).toBe(true);
  await Promise.all([page.locator("#run").click(), second.locator("#run").click()]);
  await expect(page.locator("#result")).toContainText("ERROR:");
  await expect(second.locator("#result")).toContainText("ERROR:");
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  const ids = await Promise.all([page, second].map(tab => tab.evaluate(() => window.fixtureTransport.uncertainWrite.id)));
  expect(ids[0]).toBe(ids[1]);
});

test("tab close/reopen and copied session selection cannot remove an unknown upload", async ({ page, context }) => {
  const requests = await fixture(page, context, { uploadFailure: true });
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("ERROR:");
  const id = await page.evaluate(() => window.fixtureTransport.uncertainWrite.id);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(`${frontend}/__transport-test`);
  await expect(reopened.locator("[data-transport-status]")).toContainText("unknown outcome");
  expect(await reopened.evaluate(() => window.fixtureTransport.uncertainWrite.id)).toBe(id);
  await reopened.evaluate(() => sessionStorage.setItem("bike-packing-experiment-transport-v1", "direct"));
  await reopened.reload();
  await reopened.locator("#run").click();
  await expect(reopened.locator("#result")).toContainText("reconcile server state");
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
});

test("acknowledged photo receipt prevents a stale duplicated queue from sending again", async ({ page, context }) => {
  const requests = await fixture(page, context);
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText('"uploaded":true');
  const copied = await context.newPage();
  await copied.goto(`${frontend}/__transport-test`);
  await copied.locator("#run").click();
  await expect(copied.locator("#result")).toContainText("already sent");
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
});

test("protected photo recovers a lost upload response using a terminal GET and no second POST", async ({ page, context }) => {
  const requests = await fixture(page, context, { recovery: true, uploadFailure: true });
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText('"uploaded":true');
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(requests.some(({ url, method }) => method === "GET" && url.includes("/photo-operations/"))).toBe(true);
  expect(await page.evaluate(() => window.fixtureTransport.uncertainWrite)).toBe(null);
});

test("protected photo recovers after reload and route switch with the same operation ID", async ({ page, context }) => {
  const requests = await fixture(page, context, { recovery: true, uploadFailure: true, recoveryAfterReload: true });
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText("ERROR:");
  const id = await page.evaluate(() => window.fixtureTransport.uncertainWrite.id);
  await page.evaluate(() => sessionStorage.setItem("bike-packing-experiment-transport-v1", "direct"));
  await page.reload();
  await page.locator("#run").click();
  await expect(page.locator("#result")).toContainText('"uploaded":true');
  expect(requests.filter(({ method }) => method === "POST")).toHaveLength(1);
  expect(requests.filter(({ url }) => url.includes("/photo-operations/")).every(({ url }) => url.endsWith(id))).toBe(true);
  expect(await page.evaluate(() => window.fixtureTransport.uncertainWrite)).toBe(null);
});
