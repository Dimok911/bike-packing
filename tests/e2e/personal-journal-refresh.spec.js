import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test.beforeEach(async ({ context }) => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'https://journal.test') return route.abort();
    if (/^\/src\/[a-zA-Z0-9/_-]+\.js$/.test(url.pathname)) return route.fulfill({ contentType: 'text/javascript', body: await readFile(resolve('.' + url.pathname), 'utf8') });
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Journal refresh test</title><p id="ready"></p>' });
  });
});

async function open(page) {
  await page.goto('https://journal.test/');
  await page.evaluate(async () => {
    const { createPersonalJournalStorage } = await import('/src/storage/personal-journal-storage.js');
    const { createPersonalSaveRecovery } = await import('/src/sync/personal-save-recovery.js');
    const { createPersonalSaveRecoveryDialog } = await import('/src/ui/personal-save-recovery-dialog.js');
    const binding = { environment: 'bike-packing-experiment', actorId: 'test', listId: 'list', scopeKey: 'id:test' };
    window.key = 'bike-packing-personal-save-v1:' + encodeURIComponent(JSON.stringify(binding)) + ':checkpoint';
    window.store = await createPersonalJournalStorage();
    window.recovery = createPersonalSaveRecovery({ refreshStorage: scope => store.refreshReferences(scope),
      onBlocked: value => { dialog.show(); dialog.setReason(value.error.code); },
      onReadReady: () => { dialog.finishReadRefresh(); document.querySelector('#ready').textContent = 'Ready'; } });
    window.dialog = createPersonalSaveRecoveryDialog({ ownsError: error => recovery.owns(error), getRecoveryCopy: () => recovery.preparedRecoveryCopy(store) });
    window.reader = recovery.outbox(() => ({ hasPending: () => store.getItem(key) !== null }), binding.scopeKey);
  });
}

test('another tab publishes a new checkpoint: failed read hydrates and unblocks without changing durable data', async ({ page, context }) => {
  await open(page); const writer = await context.newPage(); await open(writer);
  await writer.evaluate(() => store.writeRequired(key, 'exact checkpoint'.repeat(30000)));
  const before = await writer.evaluate(() => localStorage.getItem(key));
  await page.evaluate(() => { try { reader.hasPending(); } catch {} });
  await expect(page.locator('#ready')).toHaveText('Ready');
  await expect(page.locator('#personalSaveRecoveryDialog')).toHaveCount(0);
  expect(await page.evaluate(() => reader.hasPending())).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem(key))).toBe(before);
  expect(await page.evaluate(() => store.getItem(key))).toBe('exact checkpoint'.repeat(30000));
});

test('recovery download waits for IDB and includes the full new record with the retained draft', async ({ page, context }) => {
  await open(page); const writer = await context.newPage(); await open(writer);
  await writer.evaluate(() => store.writeRequired(key, 'exact original journal'.repeat(20000)));
  await page.evaluate(() => {
    try { store.getItem(key); } catch (error) { recovery.report(error, { scopeKey: 'id:test', snapshot: { name: 'unsaved draft' } }); }
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать копию для восстановления', exact: true }).click();
  const downloaded = await pending;
  const copy = JSON.parse(await readFile(await downloaded.path(), 'utf8'));
  expect(copy.storageReadable).toBe(true);
  expect(copy.journalEntries[0].value).toBe('exact original journal'.repeat(20000));
  expect(copy.unconfirmedMemoryDraft).toEqual({ name: 'unsaved draft' });
  await expect(page.locator('#personalSaveRecoveryDialog')).toBeVisible();
});

test('a partial recovery file explicitly reports unreadable queue data', async ({ page }) => {
  await page.goto('https://journal.test/');
  await page.evaluate(async () => {
    const { createPersonalSaveRecoveryDialog } = await import('/src/ui/personal-save-recovery-dialog.js');
    createPersonalSaveRecoveryDialog({ ownsError: () => false, getRecoveryCopy: async () => ({ storageReadable: false, journalEntries: [] }) }).show();
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать копию для восстановления', exact: true }).click();
  await pending;
  await expect(page.locator('[role="status"]')).toContainText('неполной копии');
});
