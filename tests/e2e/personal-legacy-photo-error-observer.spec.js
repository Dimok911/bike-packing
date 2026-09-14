import { test, expect } from "@playwright/test";
import { setupPersonalLegacyPhotoBrowser, readyLegacyPhotoBrowser } from "../fixtures/personal-legacy-photo-browser-fixture.js";

test.setTimeout(60000);
test.use({ screenshot: "off" });

test.afterEach(async ({ page }, info) => {
  const f = page.legacyPhotoFixture;
  if (!f) return;
  await f.flushErrors();
  await info.attach("browser-error-observer-evidence", { contentType: "application/json", body: JSON.stringify({
    errors: f.errors, browserErrors: f.browserErrors, pageErrors: f.pageErrors, posts: f.posts, revision: f.revision
  }, null, 2) });
});

test("uncaught async throw and unhandled rejection reach the browser error observer across reload", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  await f.flushErrors(); expect(f.errors).toEqual([]);
  await page.evaluate(() => {
    window.setTimeout(() => { throw new Error("error observer async throw"); }, 0);
  });
  await expect.poll(() => f.browserErrors.map(event => event.type)).toEqual(["error"]);
  await f.flushErrors();
  expect(f.errors[0]).toContain("error observer async throw");
  await expect.poll(() => f.pageErrors.some(error => error.message.includes("error observer async throw"))).toBe(true);

  await page.reload(); await readyLegacyPhotoBrowser(page);
  await page.evaluate(() => {
    // Deliberately neither returned nor caught: exercise the actual browser's
    // unhandledrejection event rather than manually dispatching a lookalike.
    void Promise.reject(new Error("error observer unhandled rejection"));
  });
  await expect.poll(() => f.browserErrors.map(event => event.type)).toEqual(["error", "unhandledrejection"]);
  await f.flushErrors();
  expect(f.errors).toEqual([expect.stringContaining("error observer async throw"), "error observer unhandled rejection"]);
  await expect.poll(() => f.pageErrors.some(error => error.message.includes("error observer unhandled rejection"))).toBe(true);
  expect(f.posts).toEqual([]); expect(f.revision).toBe(1582);
});

test("caught Promise rejection and aborted fetch remain handled without hiding native diagnostics", async ({ page, context }) => {
  const f = await setupPersonalLegacyPhotoBrowser(page, context);
  const url = "https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api/bike-packing/capabilities?error-observer=handled";
  let aborted = 0;
  await page.route(url, async route => { aborted++; await route.abort("failed"); });
  const results = await page.evaluate(async url => {
    const handled = await Promise.reject(new Error("error observer caught rejection")).catch(error => error.message);
    const network = await fetch(url, { credentials: "include" }).then(
      () => ({ rejected: false }), error => ({ rejected: true, message: String(error.message) }));
    // Let browser rejection reporting reach its next task checkpoint before
    // flushing the observer. No event is cancelled or filtered by its text.
    await new Promise(resolve => window.setTimeout(resolve, 0));
    return { handled, network };
  }, url);
  expect(aborted).toBe(1);
  expect(results.handled).toBe("error observer caught rejection");
  expect(results.network.rejected).toBe(true);
  await f.flushErrors();
  expect(f.errors).toEqual([]); expect(f.browserErrors).toEqual([]);
  // pageErrors is retained verbatim in the evidence, including any native
  // WebKit failed-load diagnostic. It is not cleared or required to be empty.
  expect(f.posts).toEqual([]); expect(f.revision).toBe(1582);
});
