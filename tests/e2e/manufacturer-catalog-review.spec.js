import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

for (const language of ["ru", "en"]) {
  test(`catalog review combines type and manufacturer filters and preserves drafts (${language})`, async ({ page }) => {
    const fixtureFiles = new Set([
      "/tests/fixtures/manufacturer-catalog-review.html", "/styles.css",
      "/src/ui/manufacturer-catalog-review-dialog.js", "/src/data/manufacturer-catalog-comparison.js",
      "/src/utils/html.js", "/src/utils/language.js", "/src/config/constants.js",
    ]);
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== "bike-packing.localhost" || !fixtureFiles.has(url.pathname)) return route.abort();
      return route.fulfill({ contentType: url.pathname.endsWith(".html") ? "text/html" : url.pathname.endsWith(".css") ? "text/css" : "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    });
    await page.goto(`/tests/fixtures/manufacturer-catalog-review.html?lang=${language}`);
    const cards = page.locator('[data-change-id]');
    const type = (value) => page.locator(`[data-catalog-type="${value}"]`);
    await expect(cards).toHaveCount(7);
    await page.locator('[data-catalog-manufacturer="ortlieb"]').click();
    await expect(cards).toHaveCount(3);
    await expect(type("added")).toHaveText(/ · 2$/);
    await expect(type("missing")).toHaveText(/ · 1$/);
    await expect(type("changed")).toHaveText(/ · 0$/);
    await cards.first().locator('textarea').fill("Keep this draft");
    await type("missing").click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveClass(/type-missing/);
    await type("changed").click();
    await expect(cards).toHaveCount(0);
    await page.locator('[data-catalog-review-only]').uncheck();
    await expect(cards).toHaveCount(1);
    await expect(cards).toHaveClass(/type-changed/);
    await page.locator('[data-catalog-manufacturer="apidura"]').click();
    await expect(type("changed")).toHaveAttribute("aria-pressed", "true");
    await expect(cards).toHaveCount(2);
    await page.locator('[data-catalog-manufacturer="ortlieb"]').click();
    await type("added").click();
    await expect(cards.first().locator('textarea')).toHaveValue("Keep this draft");
    await page.locator('[data-catalog-review-only]').check();
    await cards.first().locator('[data-catalog-decision="approved"]').click();
    await expect(cards).toHaveCount(1);
    await expect(type("added")).toHaveText(/ · 1$/);
    await expect(type("added")).toHaveAttribute("aria-pressed", "true");
    await page.locator('#catalogUpdatesRefreshBtn').click();
    await expect(cards).toHaveCount(1);
    await expect(type("added")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#catalogUpdatesBtn')).toHaveAttribute('data-review-count', '6');
    const bounds = await page.locator('.catalog-review-type-filters').evaluate((el) => ({ scroll: el.scrollWidth, width: el.clientWidth }));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  });
}
