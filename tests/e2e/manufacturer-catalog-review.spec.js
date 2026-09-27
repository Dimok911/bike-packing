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
    await cards.first().locator(".catalog-review-note > summary").click();
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
    await page.locator('.catalog-review-note > summary').click();
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
    await card.locator('.catalog-review-photo-preview > summary').click();
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
  await card.locator('.catalog-review-note > summary').click();
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
  await added.uncheck();await removed.check();await card.locator('.catalog-review-note > summary').click();await card.locator('textarea').fill('Fits the small size');
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


test('saving a decision retains neighboring cards and drafts without another full download',async({page})=>{
  const files=new Set(['/tests/fixtures/manufacturer-catalog-review.html','/styles.css','/src/ui/manufacturer-catalog-review-dialog.js','/src/data/manufacturer-catalog-comparison.js','/src/data/manufacturer-catalog-photo-selection.js','/src/utils/html.js','/src/utils/language.js','/src/config/constants.js']);
  await page.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='bike-packing.localhost'||!files.has(url.pathname))return route.abort();return route.fulfill({contentType:url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(resolve('.'+url.pathname),'utf8')});});
  await page.goto('/tests/fixtures/manufacturer-catalog-review.html');
  const cards=page.locator('[data-change-id]');await expect(cards).toHaveCount(7);
  const neighbor=page.locator('[data-change-id="ortlieb:changed:model-2"]');
  await neighbor.locator('.catalog-review-note > summary').click();
  await neighbor.locator('textarea').fill('Preserve this neighboring draft');
  await neighbor.evaluate(el=>{el.dataset.testIdentity='same-node';});
  await cards.first().locator('[data-catalog-decision="approved"]').click();
  await expect(cards).toHaveCount(6);await expect(neighbor).toHaveAttribute('data-test-identity','same-node');
  await expect(neighbor.locator('textarea')).toHaveValue('Preserve this neighboring draft');
  await expect(page.locator('body')).toHaveAttribute('data-catalog-fetches','1');
  await neighbor.locator('[data-catalog-decision="rejected"]').click();
  await expect(cards).toHaveCount(5);await expect(page.locator('body')).toHaveAttribute('data-catalog-fetches','1');
  await expect(page.locator('#catalogUpdatesBtn')).toHaveAttribute('data-review-count','5');
});

async function openReviewFixture(page) {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'bike-packing.localhost' || !(url.pathname === '/tests/fixtures/manufacturer-catalog-review.html' || url.pathname === '/styles.css' || /^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname))) return route.abort();
    return route.fulfill({ contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(resolve('.' + url.pathname), 'utf8') });
  });
  await page.goto('/tests/fixtures/manufacturer-catalog-review.html');
  await expect(page.locator('[data-change-id]')).toHaveCount(7);
}

test('review advances the next card with a small gap through the final card', async ({ page }) => {
  await openReviewFixture(page);
  const cards = page.locator('[data-change-id]');
  const ids = await cards.evaluateAll(elements => elements.map(el => el.dataset.changeId));
  // Different heights reproduce both long descriptions and short final cards.
  await cards.evaluateAll(elements => elements.forEach((el, i) => { if (i < elements.length - 1) el.style.minHeight = (i % 2 ? 700 : 1000) + 'px'; }));
  for (let i = 0; i < ids.length - 1; i++) {
    await page.locator('[data-change-id="' + ids[i] + '"] [data-catalog-decision="' + (i % 2 ? 'rejected' : 'approved') + '"]').click();
    await expect(cards).toHaveCount(ids.length - i - 1);
    const next = page.locator('[data-change-id="' + ids[i + 1] + '"]');
    await expect.poll(() => next.evaluate(el => {
      const host = el.closest('.catalog-updates-content');
      return Math.abs(el.getBoundingClientRect().top - host.getBoundingClientRect().top - host.clientTop - 16);
    })).toBeLessThanOrEqual(1);
  }
  await cards.first().locator('[data-catalog-decision="approved"]').click();
  await expect(cards).toHaveCount(0);
  await expect(page.locator('.catalog-review-empty')).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-catalog-fetches', '1');
});

test('review comments collapse and preserve text and disclosure state through filters', async ({ page }) => {
  await openReviewFixture(page);
  const card = page.locator('[data-change-id="ortlieb:changed:model-0"]');
  const note = card.locator('textarea');
  await expect(note).not.toBeVisible();
  await card.locator('summary').click();
  await note.fill('My review comment');
  await card.locator('summary').click();
  await expect(note).not.toBeVisible();
  await page.locator('[data-catalog-type="missing"]').click();
  await page.locator('[data-catalog-type="added"]').click();
  await expect(note).not.toBeVisible();
  await card.locator('summary').click();
  await expect(note).toHaveValue('My review comment');
  await page.locator('[data-catalog-type="missing"]').click();
  await page.locator('[data-catalog-type="added"]').click();
  await expect(note).toBeVisible();
  await expect(note).toHaveValue('My review comment');
});

test('review dialog grows on tall screens with 200 pixel margins', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1440 });
  await openReviewFixture(page);
  const dialog = page.locator('#catalogUpdatesDialog');
  await dialog.evaluate(el => { el.close(); el.showModal(); });
  const bounds = await dialog.boundingBox();
  expect(Math.round(bounds.height)).toBe(1040);
  expect(Math.round(bounds.y)).toBe(200);
  expect(Math.round(1440 - bounds.y - bounds.height)).toBe(200);
  await page.screenshot({ path: 'node_modules/.cache/catalog-release-v1653/tall-' + test.info().project.name + '.png' });
  await page.setViewportSize({ width: 390, height: 700 });
  const small = await dialog.boundingBox();
  expect(small.height).toBeLessThanOrEqual(700);
  expect(small.height).toBeGreaterThan(650);
});


test('a deferred card stays in place instead of advancing the list', async ({ page }) => {
  await openReviewFixture(page);
  const card = page.locator('[data-change-id="ortlieb:changed:model-0"]');
  const button = card.locator('[data-catalog-decision="deferred"]');
  await button.scrollIntoViewIfNeeded();
  const before = await card.evaluate(el => el.getBoundingClientRect().top);
  await button.click();
  await expect(card.locator('.catalog-review-decision')).toHaveClass(/decision-deferred/);
  const after = await card.evaluate(el => el.getBoundingClientRect().top);
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  await expect(page.locator('[data-change-id]')).toHaveCount(7);
});
