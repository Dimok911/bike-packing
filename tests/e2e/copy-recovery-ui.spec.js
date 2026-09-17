import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

async function setup(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://copy-ui.test/**', async route => {
    const file = new URL(route.request().url()).pathname;
    if (file.startsWith('/src/ui/')) return route.fulfill({ contentType: 'text/javascript', body: await readFile(path.resolve('.' + file), 'utf8') });
    if (file === '/styles.css') return route.fulfill({ contentType: 'text/css', body: await readFile('styles.css', 'utf8') });
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><body>
      <dialog id="creation"><form class="dialog-card"><h2>Копия шаблона</h2><footer><button type="button" id="add">Добавить</button></footer></form></dialog>
      <p id="opened"></p><script type="module">
      import { createTemplateCopyFeedback } from '/src/ui/template-copy-feedback.js';
      import { createAdminTemplateRecoveryDialog } from '/src/ui/admin-template-recovery-dialog.js';
      const creation = document.querySelector('#creation');
      let info = {recoveryKind:'photo-whole-copy',operations:[{state:'queued'}],canResume:true,canStop:true,applied:false};
      const controller = createAdminTemplateRecoveryDialog({documentRef:document,openModalDialog:d=>d.showModal(),confirmStop:async()=>true,
        prepare:async()=>({inspect:async()=>info,stop:async()=>info={...info,stopped:true,canStop:false,canResume:false,operations:[{state:'rejected',cancelled:true}]},
          resume:async progress=>{progress({phase:'photos',completed:5,total:33}); await new Promise(r=>setTimeout(r,100)); return info={...info,applied:true,canResume:false,operations:[{state:'committed'}]};},
          openResult:async()=>{document.querySelector('#opened').textContent='Открыта исходная подтверждённая копия';}})});
      creation.showModal();
      const feedback=createTemplateCopyFeedback({dialog:creation,button:document.querySelector('#add')});
      feedback.progress({phase:'photos',completed:4,total:33});
      const error=Object.assign(new Error('Ответ не получен'),{savedCopyTitle:'Tristan Ridley 2',recoverCopy:async()=>{creation.close();await controller.show('source-editor');}});
      feedback.error(error);feedback.finish();
      </script></body></html>` });
  });
  await page.goto('http://copy-ui.test/');
  return errors;
}

test('saved copy has a visible recovery action and opens the confirmed result', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.getByRole('status')).toContainText('Tristan Ridley 2');
  await page.getByRole('button', { name: 'Завершить или отменить копирование', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Отменить копирование', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Завершить копирование', exact: true }).click();
  await expect(page.locator('#opened')).toHaveText('Открыта исходная подтверждённая копия');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('confirmed cancellation says no template was created and offers no further send', async ({ page }) => {
  const errors = await setup(page);
  await page.getByRole('button', { name: 'Завершить или отменить копирование', exact: true }).click();
  await page.getByRole('button', { name: 'Отменить копирование', exact: true }).click();
  await expect(page.getByText('Копирование отменено сервером.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Завершить копирование', exact: true })).toBeDisabled();
  await expect(page.locator('#opened')).toHaveText('');
  expect(errors).toEqual([]);
});
