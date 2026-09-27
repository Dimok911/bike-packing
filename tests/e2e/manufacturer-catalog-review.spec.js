import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

for (const language of ["ru", "en"]) {
  test(`catalog review combines type and manufacturer filters and preserves drafts (${language})`, async ({ page }) => {
    const fixtureFiles = new Set([
      "/tests/fixtures/manufacturer-catalog-review.html", "/styles.css",
      "/src/ui/manufacturer-catalog-review-dialog.js", "/src/data/manufacturer-catalog-comparison.js", "/src/data/manufacturer-catalog-photo-selection.js",
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

for (const language of ["ru", "en"]) {
  test(`photo review filter stays scoped to the manufacturer (${language})`, async ({ page }) => {
    const files = new Set(["/tests/fixtures/manufacturer-catalog-review.html", "/styles.css", "/src/ui/manufacturer-catalog-review-dialog.js", "/src/data/manufacturer-catalog-comparison.js", "/src/data/manufacturer-catalog-photo-selection.js", "/src/utils/html.js", "/src/utils/language.js", "/src/config/constants.js"]);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "bike-packing.localhost" || !files.has(url.pathname)) return route.abort();
      return route.fulfill({ contentType: url.pathname.endsWith(".html") ? "text/html" : url.pathname.endsWith(".css") ? "text/css" : "text/javascript", body: await readFile(resolve(`.${url.pathname}`), "utf8") });
    });
    await page.goto(`/tests/fixtures/manufacturer-catalog-review.html?lang=${language}&photos=1`);
    await page.locator('[data-catalog-type="photos"]').click();
    await expect(page.locator('[data-change-id]')).toHaveCount(1);
    await expect(page.locator('.catalog-review-photo-warning')).toContainText(language === "ru" ? "Ранее сохранённые фотографии" : "Previously saved photographs");
    await page.locator('[data-catalog-note]').fill('Check size mapping');
    await page.locator('[data-catalog-manufacturer="ortlieb"]').click();
    await expect(page.locator('[data-change-id]')).toHaveCount(0);
    await page.locator('[data-catalog-manufacturer="tailfin"]').click();
    await expect(page.locator('[data-change-id]')).toHaveCount(1);
    await expect(page.locator('[data-catalog-note]')).toHaveValue('Check size mapping');
    await expect(page.locator('[data-catalog-type="photos"]')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#catalogUpdatesBtn')).toHaveAttribute('data-review-count','8');
  });
}

for (const language of ["ru", "en"]) {
  test(`photo gallery displays added and removed thumbnails (${language})`, async ({ page }) => {
    const files = new Set(["/tests/fixtures/manufacturer-catalog-review.html", "/styles.css", "/src/ui/manufacturer-catalog-review-dialog.js", "/src/data/manufacturer-catalog-comparison.js", "/src/data/manufacturer-catalog-photo-selection.js", "/src/utils/html.js", "/src/utils/language.js", "/src/config/constants.js", "/assets/manufacturer-catalog/ortlieb/frame-pack-10.jpg", "/assets/manufacturer-catalog/ortlieb/frame-pack-11.jpg", "/assets/manufacturer-catalog/ortlieb/frame-pack-12.jpg"]);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "bike-packing.localhost" || !files.has(url.pathname)) return route.abort();
      const image=url.pathname.endsWith('.jpg');
      return route.fulfill({ contentType: image ? "image/jpeg" : url.pathname.endsWith(".html") ? "text/html" : url.pathname.endsWith(".css") ? "text/css" : "text/javascript", body: await readFile(resolve(`.${url.pathname}`), image ? undefined : "utf8") });
    });
    await page.goto(`/tests/fixtures/manufacturer-catalog-review.html?lang=${language}&gallery=1`);
    await page.locator('[data-catalog-type="photos"]').click();
    const card=page.locator('[data-change-id="ortlieb:changed:gallery-demo"]');
    await expect(card).toBeVisible();
    await expect(card.locator('.state-added')).toHaveCount(1);
    await expect(card.locator('.state-removed')).toHaveCount(1);
    await expect(card.locator('.state-added')).toContainText(language==='ru'?'Предлагается добавить':'Proposed addition');
    await expect(card.locator('.state-added')).toContainText(language==='ru'?'Новая обложка':'New cover');
    await expect(card.locator('del, ins')).toHaveCount(0);
    await expect(card.locator('.state-added img')).toBeVisible();
    await card.locator('.state-added img').scrollIntoViewIfNeeded();
    await expect.poll(()=>card.locator('.state-added img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await card.locator('summary').click();
    await expect(card.locator('.state-unchanged img')).toBeVisible();
    await expect(card.getByLabel(language==='ru'?'В итоговой галерее':'In the final gallery').filter({visible:true}).first()).toBeVisible();
    await expect(card).toContainText(language==='ru'?'не добавляет повторно':'without adding a duplicate');
    const bounds=await card.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.width+1);
    if(language==='ru') await page.screenshot({path:`node_modules/.cache/catalog-photo-repair/gallery-${test.info().project.name}.png`,fullPage:true});
  });
}

for(const language of ['ru','en']){
 test(`current product opens above review and preserves draft (${language})`,async({page})=>{
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='bike-packing.localhost'||!(url.pathname==='/tests/fixtures/manufacturer-catalog-review.html'||url.pathname==='/styles.css'||/^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname)))return route.abort();
   return route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(resolve('.'+url.pathname),'utf8')});
  });
  await page.goto(`/tests/fixtures/manufacturer-catalog-review.html?lang=${language}&detail=1`);
  await page.locator('[data-catalog-manufacturer="ortlieb"]').click();
  await page.locator('[data-catalog-type="missing"]').click();
  const card=page.locator('[data-change-id]');
  await card.locator('textarea').fill('Preserve this note');
  const title=card.locator('[data-catalog-current-product]');
  await title.scrollIntoViewIfNeeded();
  const scrollBefore=await page.locator('#catalogUpdatesContent').evaluate(el=>el.scrollTop);
  for(const close of ['button','escape']){
   await title.click();
   const detail=page.locator('#bagCatalogProductDetailDialog');
   await expect(detail).toBeVisible();
   await expect(page.locator('#catalogUpdatesDialog')).toHaveAttribute('open','');
   await expect(detail).toContainText('Current Frame Pack');
   await expect(detail).toContainText('F9973');
   if(close==='button')await detail.getByRole('button',{name:'Close details'}).click();
   else await page.keyboard.press('Escape');
   await expect(detail).not.toBeVisible();
   await expect(page.locator('#catalogUpdatesDialog')).toBeVisible();
   await expect(card.locator('textarea')).toHaveValue('Preserve this note');
   await expect(page.locator('[data-catalog-type="missing"]')).toHaveAttribute('aria-pressed','true');
   expect(await page.locator('#catalogUpdatesContent').evaluate(el=>el.scrollTop)).toBe(scrollBefore);
  }
 });
}

for(const language of ['ru','en']){
 test(`individual photographs persist with a visible manual exception (${language})`,async({page})=>{
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.hostname!=='bike-packing.localhost'||!(url.pathname==='/tests/fixtures/manufacturer-catalog-review.html'||url.pathname==='/styles.css'||/^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname)||/^\/assets\/manufacturer-catalog\/ortlieb\/frame-pack-1[012]\.jpg$/.test(url.pathname)))return route.abort();
   return route.fulfill({contentType:url.pathname.endsWith('.jpg')?'image/jpeg':url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(resolve('.'+url.pathname))});
  });
  await page.goto(`/tests/fixtures/manufacturer-catalog-review.html?lang=${language}&gallery=1`);
  await page.locator('[data-catalog-type="photos"]').click();
  const card=page.locator('[data-change-id="ortlieb:changed:gallery-demo"]');
  const added=card.locator('[data-catalog-photo-url$="frame-pack-12.jpg"]'),removed=card.locator('[data-catalog-photo-url$="frame-pack-10.jpg"]');
  await expect(added).toBeChecked();await expect(removed).not.toBeChecked();
  await added.uncheck();await removed.check();await card.locator('textarea').fill('Fits the small size');
  await page.locator('[data-catalog-type="added"]').click();await page.locator('[data-catalog-type="photos"]').click();
  await expect(added).not.toBeChecked();await expect(removed).toBeChecked();
  await card.locator('[data-catalog-decision="approved"]').click();await expect(card).toHaveCount(0);
  await page.locator('[data-catalog-type="exceptions"]').click();
  await expect(page.locator('.catalog-review-changes')).toContainText('Fits the small size');
  await expect(page.locator('.catalog-review-changes')).toContainText(language==='ru'?'ожидает публикации':'awaiting publication');
  await expect(page.locator('.catalog-review-changes img')).toHaveCount(2);
  await page.locator('[data-catalog-type="photos"]').click();await page.locator('[data-catalog-review-only]').uncheck();
  await expect(added).not.toBeChecked();await expect(removed).toBeChecked();
  await card.locator('[data-catalog-photo-default]').click();await expect(added).toBeChecked();await expect(removed).not.toBeChecked();
 });
}
