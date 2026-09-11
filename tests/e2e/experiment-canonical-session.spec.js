import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const experiment = "https://experiment.vniipo-help.ru";
const canonical = "https://api.vniipo-help.ru/experiment/letters-vniipo/api";

async function installFixture(page, { signedIn = false, logoutStatus = 200 } = {}) {
  const calls = [];
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push({ url: request.url(), method: request.method(), body: request.postData() });
    if (url.origin === experiment && !url.pathname.includes("/api/") && !url.pathname.startsWith("/session/")) {
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const root = path.resolve("www/vniipo-help.ru/bike-packing");
      const target = path.resolve(root, relative);
      if (!target.startsWith(root + path.sep)) return route.abort();
      try {
        const contentType = relative.endsWith(".js") ? "text/javascript" : relative.endsWith(".css") ? "text/css" : "text/html";
        return route.fulfill({ body: await readFile(target), contentType });
      } catch { return route.abort(); }
    }
    if (url.pathname === "/auth/migrate-session") {
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"ok":false,"code":"authentication_required"}' });
    }
    if (request.url() === `${canonical}/auth/me`) {
      return route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, user: signedIn ? { id: "isolated-user", email: "user@example.test" } : null }) });
    }
    if (request.url() === `${canonical}/auth/logout`) {
      if (logoutStatus === 200) signedIn = false;
      return route.fulfill({ status: logoutStatus, contentType: "application/json", body: JSON.stringify({ ok: logoutStatus === 200 }) });
    }
    if (url.pathname === "/session/clear-legacy") return route.fulfill({ status: 204 });
    return route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false,"error":"Isolated browser fixture"}' });
  });
  return calls;
}

test("Experiment startup/focus never migrates; only the transfer button does", async ({ page }) => {
  const calls = await installFixture(page);
  await page.goto(experiment);
  await expect(page.locator("body")).toHaveClass(/\bapp-ready\b/, { timeout: 15000 });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => calls.filter(({ url }) => url === `${canonical}/auth/me`).length).toBeGreaterThan(0);
  expect(calls.some(({ url }) => /migrate-session|experiment-share-session/.test(url))).toBe(false);
  await page.locator("#menuBtn").click();
  await page.locator("#authBtn").click();
  await expect(page.locator("#authMigrateExperiment")).toBeVisible();
  await page.locator("#authMigrateExperimentBtn").click();
  await expect(page.locator("#authDialogStatus")).toContainText(/данные сохранены|data is saved/);
  const migration = calls.filter(({ url }) => url.endsWith("/auth/migrate-session"));
  expect(migration).toHaveLength(1);
  expect(JSON.parse(migration[0].body)).toEqual({ useExperimentSession: true });
  expect(migration[0].method).toBe("POST");
  expect(calls.some(({ url }) => url.includes("experiment-share-session") || url.includes("/session/clear-legacy"))).toBe(false);
  await expect(page.locator("#authEmail")).toBeVisible();
});

for (const logoutStatus of [200, 503]) {
  test(`Experiment logout ${logoutStatus} never silently restores a legacy session`, async ({ page }) => {
    const calls = await installFixture(page, { signedIn: true, logoutStatus });
    await page.goto(experiment);
    await expect(page.locator("body")).toHaveClass(/\bapp-ready\b/, { timeout: 15000 });
    await page.locator("#menuBtn").click();
    await page.locator("#signOutBtn").click();
    await expect(page.locator("#confirmDialog")).toBeVisible();
    await page.locator("#confirmOkBtn").click();
    await expect.poll(() => calls.filter(({ url }) => url.endsWith("/auth/logout")).length).toBe(1);
    if (logoutStatus === 200) {
      await expect.poll(() => calls.filter(({ url }) => url.endsWith("/session/clear-legacy")).length).toBe(1);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("bike-packing-auth-signed-out"))).toBe("1");
    } else {
      await expect(page.locator("body")).toContainText(/Не удалось выйти|Sign-out failed/);
      expect(calls.some(({ url }) => url.endsWith("/session/clear-legacy"))).toBe(false);
    }
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    expect(calls.some(({ url }) => /migrate-session|experiment-share-session/.test(url))).toBe(false);
  });
}
