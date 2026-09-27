import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
for (const language of ['ru', 'en']) {
  test(`catalog newcomers and exact SKU selection (${language})`, async ({ page }) => {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'bike-packing.localhost' || !(url.pathname === '/tests/fixtures/manufacturer-catalog-variants.html' || url.pathname === '/styles.css' || /^\/src\/[a-z0-9/.-]+\.js$/i.test(url.pathname))) return route.abort();
      return route.fulfill({ contentType: url.pathname.endsWith('.html') ? 'text/html' : url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: await readFile(resolve('.' + url.pathname), 'utf8') });
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
