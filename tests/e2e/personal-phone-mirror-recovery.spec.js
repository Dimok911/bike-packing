import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { setupPersonalLegacyPhotoBrowser } from "../fixtures/personal-legacy-photo-browser-fixture.js";
import { readBrowserPersonalMirror } from "../fixtures/personal-mirror-browser-fixture.js";
import { STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY } from "../../src/config/constants.js";

test.use({ screenshot: "off", trace: "off" });
test("built app recovers the actual phone journal under a 5 MiB localStorage ceiling and reloads confirmed", async ({ page, context }) => {
  test.skip(!process.env.BIKE_PHONE_RECOVERY_FILE, "Local private phone export required");
  test.setTimeout(120000);
  const exported = JSON.parse(await readFile(process.env.BIKE_PHONE_RECOVERY_FILE, "utf8"));
  const record = JSON.parse(exported.entries.find(row => row.key.startsWith("bike-packing-personal-save-v1:")).value);
  const payload = record.action.body.payload;
  const layoutId = Object.values(payload.layouts).find(layout => layout.name === "Демо-укладка 2 2").id;
  const pendingIds = ["container-1784362740260", "container-13", "container-20"];
  for (const id of pendingIds) expect(Boolean(payload.containers[id])).toBe(true);
  const bagId = Object.values(payload.containers).find(bag => bag.photos?.length).id;
  const f = await setupPersonalLegacyPhotoBrowser(page, context, { ordinaryRecovery: true,
    phoneRecovery: { ...exported, payload, layoutId, bagId, pendingIds } });
  expect(await page.evaluate(() => window.__phoneSeedBytes)).toBeGreaterThan(3.7 * 1024 * 1024);
  await page.locator("#layoutSelect").selectOption(layoutId);
  await expect(page.locator("#personalRecoveryNotice")).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "Разобрать изменения", exact: true }).click();
  const dialog = page.locator("#personalOrdinaryRecoveryDialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Загрузить серверную версию", exact: true }).click();
  try {
    await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  } catch (error) {
    console.log(JSON.stringify({ phase: "phone-confirmation", posts: f.posts.length, cancellations: f.cancellations.length, revision: f.revision,
      errors: f.errors.map(value => String(value).split("\n")[0].slice(0, 180)), pageErrors: f.pageErrors.map(value => String(value).split("\n")[0].slice(0, 180)),
      lastCalls: f.calls.slice(-5).map(call => ({ method: call.method, status: call.status, code: call.code, receipt: call.receiptState })),
      ui: await page.evaluate(() => ({ notice: document.querySelector("#personalRecoveryNotice")?.textContent?.slice(0, 250),
        status: document.querySelector("#syncStatus")?.textContent, quota: window.__phoneQuotaFailures,
        entries: Object.entries(localStorage).filter(([key]) => key.startsWith("bike-packing-personal-")).map(([key, raw]) => ({ archive: key.includes(":archive:"),
          complete: key.includes(":complete:"), bytes: 2 * (key.length + raw.length) })),
        storageBytes: Object.entries(localStorage).reduce((sum, [key, raw]) => sum + 2 * (key.length + raw.length), 0),
        dialogs: [...document.querySelectorAll("dialog[open]")].map(dialog => dialog.textContent.slice(-500)) })) }));
    throw error;
  }
  expect(f.posts.length).toBe(1); expect(f.revision).toBe(1586);
  expect(f.posts[0].operationId === record.action.operationId).toBe(false);
  await expect(page.locator("#layoutSelect")).toHaveValue(layoutId);
  for (const id of pendingIds) await expect(page.locator(`#packingView [data-root-container-id="${id}"]`)).toBeVisible();
  const scope = exported.binding.scopeKey;
  const mirrors = await page.evaluate(keys => keys.map(key => localStorage.getItem(key) === null),
    [STORAGE_KEY, BASE_STATE_KEY, RECOVERY_STATE_KEY].map(key => `${key}::${scope}`));
  expect(mirrors).toEqual([true, true, true]);
  expect(Boolean(await readBrowserPersonalMirror(page, `${STORAGE_KEY}::${scope}`))).toBe(true);
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.locator("#layoutSelect").selectOption(layoutId);
  await expect(page.locator("#syncBtn")).toHaveAttribute("data-sync-state", "synced", { timeout: 30000 });
  await expect(page.locator("#personalRecoveryNotice")).not.toBeVisible();
  for (const id of pendingIds) await expect(page.locator(`#packingView [data-root-container-id="${id}"]`)).toBeVisible();
  expect(f.posts.length).toBe(1); expect(f.cancellations.length).toBe(1);
  await f.flushErrors();
  expect(f.errors.length).toBe(0); expect(f.pageErrors.length).toBe(0);
  // Start again without the API. Static release files are still fulfilled by
  // the fixture; account discovery and list contents must come from IndexedDB.
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
  await page.route("**/letters-vniipo/api/**", route => route.abort("internetdisconnected"));
  await page.reload();
  await expect(page.locator("body")).toHaveClass(/app-ready/, { timeout: 30000 });
  await page.locator("#layoutSelect").selectOption(layoutId);
  for (const id of pendingIds) await expect(page.locator(`#packingView [data-root-container-id="${id}"]`)).toBeVisible();
  expect(f.posts.length).toBe(1);
});


test("unavailable primary storage leaves an explicit retry screen instead of opening an empty editor", async ({ page, context }) => {
  await setupPersonalLegacyPhotoBrowser(page, context);
  await page.addInitScript(() => { indexedDB.open = () => { throw new DOMException("Unavailable fixture", "InvalidStateError"); }; });
  await page.reload();
  await expect(page.locator("#appStartupTitle")).toHaveText("Не удалось открыть данные на устройстве");
  await expect(page.getByRole("button", { name: "Повторить загрузку", exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toHaveClass(/app-ready/);
});
