import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test.beforeEach(async ({ page, context }) => {
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://repository.test") return route.abort();
    if (/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) {
      return route.fulfill({ contentType: "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    }
    return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Recovery choice test</title>" });
  });
  await page.goto("https://repository.test");
  await page.evaluate(async () => {
    const { askPersonalOrdinaryRecovery } = await import("/src/ui/personal-ordinary-recovery-dialog.js");
    window.choice = null;
    window.preparationCount = 0;
    void askPersonalOrdinaryRecovery({ actionCount: 1, getRecoveryCopy: () => ({ entries: [] }),
      prepareServerChoice: () => {
        window.preparationCount++;
        return new Promise((resolve, reject) => { window.commit = resolve; window.fail = () => reject(Error("Storage transaction failed")); });
      }
    }).then(choice => { window.choice = choice; });
  });
});

test("recovery choice waits for durable storage, including Escape and repeated taps", async ({ page }) => {
  const dialog = page.locator("#personalOrdinaryRecoveryDialog");
  const server = dialog.getByRole("button", { name: "Загрузить серверную версию", exact: true });
  await server.click();
  await expect(dialog).toContainText("Сохраняем копию для восстановления");
  await expect(server).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Решить позже", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await server.dispatchEvent("click");
  expect(await page.evaluate(() => [window.choice, window.preparationCount])).toEqual([null, 1]);
  await expect(dialog).toBeVisible();
  await page.evaluate(() => window.commit());
  await expect.poll(() => page.evaluate(() => window.choice)).toBe("server");
  await expect(dialog).toHaveCount(0);
});

test("failed storage leaves the dialog open and permits postponing without server choice", async ({ page }) => {
  const dialog = page.locator("#personalOrdinaryRecoveryDialog");
  const server = dialog.getByRole("button", { name: "Загрузить серверную версию", exact: true });
  await server.click();
  await page.evaluate(() => window.fail());
  await expect(dialog.getByRole("alert")).toHaveText("Storage transaction failed");
  await expect(server).toBeEnabled();
  expect(await page.evaluate(() => window.choice)).toBeNull();
  await dialog.getByRole("button", { name: "Решить позже", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.choice)).toBe("later");
});
