import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
for (const language of ['ru', 'en']) {
  test(`catalog newcomers and exact SKU selection (${language})`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'bike-packing.localhost' || !(url.pathname === '/tests/fixtures/manufacturer-catalog-variants.html' || url.pathname === '/styles.css' || /^\/assets\/manufacturer-brands\/[a-z0-9.-]+$/i.test(url.pathname) || /^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname))) return route.abort();
      return route.fulfill({ contentType: url.pathname.endsWith('.svg') ? 'image/svg+xml' : url.pathname.endsWith('.png') ? 'image/png' : url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(resolve('.' + url.pathname)) });
    });
    await page.goto(`/tests/fixtures/manufacturer-catalog-variants.html?lang=${language}`);
    const dialog = page.locator('#bagCatalogDialog');
    const ortlieb = dialog.locator('[data-bag-catalog-brand="ortlieb"]');
    await expect(ortlieb.locator('.manufacturer-new-badge')).toContainText('1');
    await ortlieb.click();
    await expect(dialog.locator('[data-bag-catalog-family="panniers"] .manufacturer-new-badge')).toContainText('1');
    await dialog.locator('[data-bag-catalog-family="panniers"]').click();
    await expect(dialog.locator('[data-bag-catalog-category="pannier"] .manufacturer-new-badge')).toContainText('1');
    await dialog.locator('[data-bag-catalog-category="pannier"]').click();
    await expect(dialog.locator('.manufacturer-catalog-product')).toHaveCount(2);
    await dialog.locator('[data-bag-catalog-new]').click();
    await expect(dialog.locator('.manufacturer-catalog-product')).toHaveCount(1);
    await expect(dialog.locator('.manufacturer-catalog-product .manufacturer-new-badge')).toBeVisible();
    await dialog.locator('[data-bag-catalog-variant-select="new-bag"]').selectOption('F5207');
    await expect(dialog.locator('.manufacturer-catalog-sku')).toHaveText('F5207');
    await expect(dialog.locator('.manufacturer-catalog-specs')).toContainText('PS36C');
    await expect(dialog.locator('.manufacturer-catalog-source-link')).toHaveAttribute('href', /variant=47592189034674$/);
    await dialog.locator('[data-bag-catalog-brand="arkel"]').click();
    await expect(dialog.locator('h3')).toHaveText('Recent Arkel');
    await expect(dialog.locator('[data-bag-catalog-new]')).toHaveAttribute('aria-pressed', 'true');
  });
}

for (const language of ['ru','en']) {
  test(`Topeak without photos keeps a full width card and no undefined (${language})`, async ({page})=>{
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.hostname!=='bike-packing.localhost'||!(url.pathname==='/tests/fixtures/manufacturer-catalog-variants.html'||url.pathname==='/styles.css'||/^\/assets\/manufacturer-brands\/[a-z0-9.-]+$/i.test(url.pathname)||/^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname)))return route.abort();
      return route.fulfill({contentType:url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.png')?'image/png':url.pathname.endsWith('.html')?'text/html':url.pathname.endsWith('.css')?'text/css':'text/javascript',body:await readFile(resolve('.'+url.pathname))});
    });
    await page.goto(`/tests/fixtures/manufacturer-catalog-variants.html?lang=${language}&empty-photo=1`);
    await page.locator('[data-bag-catalog-brand="topeak"]').click();
    await page.locator('[data-bag-catalog-family="bikepacking"]').click();
    await page.locator('[data-bag-catalog-category="saddle"]').click();
    const card=page.locator('.manufacturer-catalog-product');
    await expect(card).toHaveCount(1);
    await expect(card).not.toContainText('undefined');
    await expect(card.locator('h3')).toHaveText('AERO WEDGE PACK 0.41 L');
    const bounds=await card.evaluate(el=>({card:el.clientWidth,body:el.querySelector('.manufacturer-catalog-product-body').getBoundingClientRect().width,scroll:el.scrollWidth}));
    expect(bounds.body).toBeGreaterThan(bounds.card-4);
    expect(bounds.scroll).toBeLessThanOrEqual(bounds.card+1);
    if(language==='ru')await page.screenshot({path:`node_modules/.cache/catalog-photo-repair/topeak-fixed-${test.info().project.name}.png`,fullPage:true});
  });
}
