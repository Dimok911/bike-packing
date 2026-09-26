import { test, expect } from '@playwright/test';
import { openApp, prepareIsolatedRussianGuest, createEmptyLayout, waitForApp } from './guest-test-helpers.js';

const tableHtml = '<h2>Recommendations</h2><p><b>Проверить</b> перед поездкой</p><table><thead><tr><th>Tire Size</th><th>Sealant Amount</th><th>Min. Bottle Per Bike</th></tr></thead><tbody><tr><td>700c x 40mm</td><td><span style="font-weight:700">60ml</span></td><td>125ml</td></tr><tr><td>29 x 3</td><td>140ml</td><td>500ml</td></tr></tbody></table><ul><li>Запас</li></ul>';
async function paste(locator, html, text = '') {
  await locator.evaluate((el, data) => {
    el.focus();
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', data.html);
    clipboardData.setData('text/plain', data.text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, { html, text });
}
async function fixture(page) {
  await prepareIsolatedRussianGuest(page);
  await openApp(page);
  await createEmptyLayout(page, 'Заметки');
  await page.evaluate(() => {
    const key = 'bike-packing-prototype-state-v1';
    const state = JSON.parse(localStorage.getItem(key));
    const layout = Object.values(state.layouts).find(x => x.name === 'Заметки');
    state.containers.notesBag = { id: 'notesBag', name: 'Сумка', parentId: null, itemIds: ['notesItem'], childIds: [], order: [{ type: 'item', id: 'notesItem' }], weight: 0, note: 'Старая заметка' };
    state.items.notesItem = { id: 'notesItem', name: 'Герметик', containerId: 'notesBag', quantity: 1, weight: 0, stockQuantity: 1, categories: [], note: '' };
    layout.rootContainerIds = ['notesBag'];
    layout.arrangement = { rootContainerIds: ['notesBag'], containers: { notesBag: { itemIds: ['notesItem'], childIds: [], order: [{type:'item',id:'notesItem'}] } }, items: {notesItem:'notesBag'}, itemQuantities:{notesItem:1} };
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload(); await waitForApp(page);
}
async function activate(locator, isMobile) {
  await locator.scrollIntoViewIfNeeded();
  if (isMobile) await locator.tap(); else await locator.click();
}
async function save(page, selector, isMobile) {
  await page.evaluate(() => document.activeElement?.blur());
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(page.locator(selector), isMobile);
}

test('item and bag notes preserve pasted tables, formatting, edits and search after reload', async ({page, isMobile}) => {
  await fixture(page);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'), isMobile);
  await paste(page.locator('#itemNote'), tableHtml);
  const editor = page.locator('#itemNoteRich');
  await expect(editor).toBeVisible();
  await expect(editor.locator('table tr')).toHaveCount(3);
  await expect(editor.locator('strong')).toHaveText(['Проверить', '60ml']);
  await editor.locator('td').first().evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    getSelection().removeAllRanges(); getSelection().addRange(range); el.closest('[contenteditable]').focus();
  });
  await page.keyboard.insertText('700c x 45mm');
  await expect(editor.locator('td').first()).toHaveText('700c x 45mm');
  await editor.screenshot({path:`test-results/rich-notes-${isMobile ? 'mobile' : 'desktop'}.png`});
  expect(await page.locator('#itemDialog').evaluate(el=>el.scrollWidth <= el.clientWidth)).toBe(true);
  await save(page, '#saveItemBtn', isMobile);
  await expect(page.locator('#itemDialog')).not.toBeVisible();
  await activate(page.getByRole('heading', {name:'Сумка',exact:true}), isMobile);
  await expect(page.locator('#rootContainerNote')).toHaveValue('Старая заметка');
  await page.locator('#rootContainerNote').fill('');
  await paste(page.locator('#rootContainerNote'), '<p><i>Ремнабор</i></p>'+tableHtml);
  await expect(page.locator('#rootContainerNoteRich table')).toHaveCount(1);
  await save(page, '#saveRootContainerBtn', isMobile);
  await page.reload(); await waitForApp(page);
  await activate(page.getByRole('heading',{name:'Сумка',exact:true}),isMobile);
  await expect(page.locator('#rootContainerNoteRich em')).toHaveText('Ремнабор');
  await expect(page.locator('#rootContainerNoteRich table')).toHaveCount(1);
  await activate(page.locator('#rootContainerDialog header button[value="cancel"]'),isMobile);
  await page.locator('#searchInput').evaluate(el => { el.value = '700c x 45mm'; el.dispatchEvent(new InputEvent('input', {bubbles:true,inputType:'insertFromPaste'})); });
  await page.locator('#searchInput').blur();
  await activate(page.locator('[data-item-id="notesItem"] .search-note-match-badge'),isMobile);
  await expect(editor.locator('mark[data-note-match]')).toHaveText('700c x 45mm');
  await expect(editor.locator('strong')).toHaveText(['Проверить', '60ml']);
  const saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1')).items.notesItem);
  expect(saved.note).toContain('700c x 45mm');
  expect(saved.noteHtml).toContain('<table>');
  expect(saved.noteHtml).not.toContain('data-note-match');
});

test('pasted HTML removes executable content and source styling, and old-client plain edits win', async ({page,isMobile}) => {
  await fixture(page);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  const requests=[]; page.on('request',r=>{if(r.url().includes('unsafe-note')) requests.push(r.url());});
  await paste(page.locator('#itemNote'), '<p id="unsafe-note" style="position:fixed;color:red" onclick="window.noteAttack=1"><b>Безопасно</b></p><script>window.noteAttack=1</script><img src="https://unsafe-note.invalid/image" onerror="window.noteAttack=1"><svg onload="window.noteAttack=1"></svg><iframe src="https://unsafe-note.invalid/frame"></iframe><a href="javascript:window.noteAttack=1">Нет ссылки</a><a href="https://example.com/page">Ссылка</a><table><tr><td colspan="2" onmouseover="window.noteAttack=1">Ячейка</td></tr></table>');
  const editor=page.locator('#itemNoteRich');
  await expect(editor.locator('script,img,svg,iframe,[onclick],[onmouseover],[style],#unsafe-note')).toHaveCount(0);
  await expect(editor.locator('a[href]')).toHaveCount(1);
  await expect(editor.locator('a[href]')).toHaveAttribute('rel','noopener noreferrer');
  await expect(editor.locator('td')).toHaveAttribute('colspan','2');
  expect(await page.evaluate(()=>window.noteAttack)).toBeUndefined();
  expect(requests).toEqual([]);
  await save(page,'#saveItemBtn',isMobile);
  await page.evaluate(()=>{ const k='bike-packing-prototype-state-v1'; const s=JSON.parse(localStorage.getItem(k)); s.items.notesItem.note='Изменено старым клиентом'; localStorage.setItem(k,JSON.stringify(s)); });
  await page.reload(); await waitForApp(page);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  await expect(page.locator('#itemNote')).toBeVisible();
  await expect(page.locator('#itemNote')).toHaveValue('Изменено старым клиентом');
  await expect(editor).not.toBeVisible();
});

test('formatting alone is saved and empty rich notes can be cleared', async({page,isMobile})=>{
  await fixture(page);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  await page.locator('#itemNote').fill('Текст');
  await page.locator('#itemNote').evaluate(el=>{el.focus();el.setSelectionRange(0,el.value.length);});
  await activate(page.locator('#itemDialog [data-note-command="bold"]'),isMobile);
  await expect(page.locator('#itemNoteRich')).toBeVisible();
  await save(page,'#saveItemBtn',isMobile);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  await expect(page.locator('#itemNoteRich strong')).toHaveText('Текст');
  await page.locator('#itemNoteRich').fill('');
  await save(page,'#saveItemBtn',isMobile);
  await activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  await expect(page.locator('#itemNote')).toBeVisible();
  await expect(page.locator('#itemNote')).toHaveValue('');
});

test('new bags and items save rich notes and preserve them in the form draft', async({page,isMobile})=>{
  test.skip(isMobile, 'Desktop creation path; mobile rich editing is covered above');
  await prepareIsolatedRussianGuest(page); await openApp(page); await createEmptyLayout(page,'Новые заметки');
  await page.locator('[data-add-packing-root]').click();
  await page.locator('#createRootForLayoutBtn').click();
  await page.locator('#rootContainerName').fill('Новая сумка');
  await paste(page.locator('#rootContainerNote'),tableHtml);
  await save(page,'#saveRootContainerBtn',false);
  await expect(page.locator('#rootContainerDialog')).not.toBeVisible();
  const bag=page.locator('#packingView [data-root-container-id]').filter({hasText:'Новая сумка'});
  await bag.locator('[data-add-to-container]').click();
  await page.locator('#createItemForContainerBtn').click();
  await page.locator('#itemName').fill('Новая вещь');
  await paste(page.locator('#itemNote'),tableHtml);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bike-packing-new-item-form-draft-v1')||'null')?.fields?.noteHtml||'')).toContain('<table>');
  await save(page,'#saveItemBtn',false);
  await expect(page.locator('#itemDialog')).not.toBeVisible();
  const records=await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1'));return [Object.values(s.items).find(x=>x.name==='Новая вещь'),Object.values(s.containers).find(x=>x.name==='Новая сумка')];});
  for(const record of records) {expect(record.noteHtml).toContain('<table>');expect(record.note).toContain('60ml');}
});

test('item and bag links open separately after save and reload without closing the note', async({page,isMobile,context})=>{
  await fixture(page);
  const target='https://example.com/note-manual?part=1#table';
  await context.route('https://example.com/note-manual**',route=>route.fulfill({contentType:'text/html',body:'<h1>Note manual</h1>'}));
  for (const kind of ['item','bag']) {
    const prefix=kind==='item'?'item':'rootContainer';
    const open=()=>activate(kind==='item'?page.locator('[data-item-id="notesItem"] .item-title-hitarea'):page.getByRole('heading',{name:'Сумка',exact:true}),isMobile);
    await open();
    await page.locator(`#${prefix}Note`).fill('');
    await paste(page.locator(`#${prefix}Note`),`<p><a href="${target}"><strong>Инструкция</strong></a></p>`);
    await save(page,kind==='item'?'#saveItemBtn':'#saveRootContainerBtn',isMobile);
    await page.reload(); await waitForApp(page);
    await open();
    const originalUrl=page.url();
    const originalHtml=await page.locator(`#${prefix}NoteRich`).innerHTML();
    const popupPromise=page.waitForEvent('popup');
    await activate(page.locator(`#${prefix}NoteRich a strong`),isMobile);
    const popup=await popupPromise;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(target);
    expect(await popup.evaluate(()=>window.opener)).toBeNull();
    await expect(popup.getByRole('heading')).toHaveText('Note manual');
    expect(page.url()).toBe(originalUrl);
    await expect(page.locator(`#${prefix}Dialog`)).toBeVisible();
    expect(await page.locator(`#${prefix}NoteRich`).innerHTML()).toBe(originalHtml);
    await popup.close();
    await activate(page.locator(`#${prefix}Dialog header button[value="cancel"]`),isMobile);
  }
});
