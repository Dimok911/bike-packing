import { test, expect } from '@playwright/test';
import { prepareIsolatedGuest, openApp, createEmptyLayout, activateGuestControl } from './guest-test-helpers.js';

for (const initial of ['ru', 'en']) test(`catalog description follows language changes without reload from ${initial}`, async ({ page }) => {
  await prepareIsolatedGuest(page, initial);
  await openApp(page);
  await createEmptyLayout(page, '123456');
  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  for (const language of [initial, initial === 'ru' ? 'en' : 'ru', initial]) {
    if (await page.locator('html').getAttribute('lang') !== language) {
      await activateGuestControl(page.locator('#menuBtn'));
      await page.locator('#languageSelect').selectOption(language);
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      // Guest mode may offer the demo for the newly selected language.
      await page.locator('#confirmDialog').waitFor({ state: 'visible', timeout: 3000 }).then(
        () => activateGuestControl(page.locator('#confirmCancelBtn')), () => {});
      if (await page.locator('#languageSelect').isVisible()) await activateGuestControl(page.locator('#menuBtn'));
    }
    await activateGuestControl(page.locator('[data-add-packing-root]'));
    await activateGuestControl(page.locator('#createRootForLayoutBtn'));
    await activateGuestControl(page.locator('#openBagCatalogBtn'));
    await page.locator('#bagCatalogSearch').fill('9973');
    const description = page.locator('.manufacturer-catalog-description').first();
    await expect(description).toContainText(language === 'ru' ? 'Нарамная сумка ORTLIEB' : 'ORTLIEB frame bag');
    if (language === 'en') await expect(description).not.toContainText(/[А-Яа-яЁё]/);
    for (const id of ['bagCatalogDialog', 'rootContainerDialog', 'layoutRootDialog']) {
      const dialog = page.locator('#'+id);
      if (await dialog.isVisible()) await activateGuestControl(dialog.locator('header button[value="cancel"]'));
    }
  }
  expect(navigations).toBe(0);
});
