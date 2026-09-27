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

test('toolbar adds named links to selected text and bags, edits addresses and cancels invalid input', async({page,isMobile,context})=>{
  await fixture(page);
  await context.route('https://example.com/created**',route=>route.fulfill({contentType:'text/html',body:'Created link'}));
  const openItem=()=>activate(page.locator('[data-item-id="notesItem"] .item-title-hitarea'),isMobile);
  await openItem();
  await page.locator('#itemNote').fill('Открыть инструкцию здесь');
  await page.locator('#itemNote').evaluate(el=>{el.focus();el.setSelectionRange(8,18);});
  await activate(page.locator('#itemDialog [data-note-command="link"]'),isMobile);
  const panel=page.locator('#itemDialog .rich-note-link-panel');
  await expect(panel.locator('[data-note-link-field="text"]')).toHaveValue('инструкцию');
  await panel.locator('[data-note-link-field="url"]').fill('example.com/created');
  await panel.screenshot({path: `test-results/note-link-panel-${isMobile ? 'mobile' : 'desktop'}.png`});
  expect(await page.locator('#itemDialog').evaluate(el=>el.scrollWidth <= el.clientWidth)).toBe(true);
  await panel.locator('[data-note-link-field="url"]').blur();
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(panel.locator('[data-note-link-apply]'),isMobile);
  await expect(panel).not.toBeVisible();
  await expect(page.locator('#itemNoteRich a')).toHaveText('инструкцию');
  await expect(page.locator('#itemNoteRich')).toHaveText('Открыть инструкцию здесь');
  await save(page,'#saveItemBtn',isMobile);
  await page.reload(); await waitForApp(page); await openItem();
  const link=page.locator('#itemNoteRich a');
  await expect(link).toHaveAttribute('href','https://example.com/created');
  await link.evaluate(el=>{el.closest('[contenteditable]').focus();const r=document.createRange();r.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(r);});
  await activate(page.locator('#itemDialog [data-note-command="link"]'),isMobile);
  await expect(panel.locator('[data-note-link-field="url"]')).toHaveValue('https://example.com/created');
  await panel.locator('[data-note-link-field="text"]').fill('руководство');
  await panel.locator('[data-note-link-field="url"]').fill('https://example.com/created?updated=1');
  await panel.locator('[data-note-link-field="url"]').blur();
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(panel.locator('[data-note-link-apply]'),isMobile);
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText('руководство');
  await expect(link).toHaveAttribute('href','https://example.com/created?updated=1');
  await save(page,'#saveItemBtn',isMobile);
  await activate(page.getByRole('heading',{name:'Сумка',exact:true}),isMobile);
  await page.locator('#rootContainerNote').fill('');
  await activate(page.locator('#rootContainerDialog [data-note-command="link"]'),isMobile);
  const bagPanel=page.locator('#rootContainerDialog .rich-note-link-panel');
  await bagPanel.locator('[data-note-link-field="text"]').fill('Описание сумки');
  await bagPanel.locator('[data-note-link-field="url"]').fill('javascript:alert(1)');
  await bagPanel.locator('[data-note-link-field="url"]').blur();
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(bagPanel.locator('[data-note-link-apply]'),isMobile);
  await expect(bagPanel).toBeVisible();
  await expect(page.locator('#rootContainerNoteRich a')).toHaveCount(0);
  await bagPanel.locator('[data-note-link-field="url"]').blur();
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(bagPanel.getByRole('button',{name:'Отмена',exact:true}),isMobile);
  await expect(page.locator('#rootContainerNote')).toBeVisible();
  await activate(page.locator('#rootContainerDialog [data-note-command="link"]'),isMobile);
  await bagPanel.locator('[data-note-link-field="text"]').fill('Описание сумки');
  await bagPanel.locator('[data-note-link-field="url"]').fill('https://example.com/created#bag');
  await bagPanel.locator('[data-note-link-field="url"]').blur();
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await activate(bagPanel.locator('[data-note-link-apply]'),isMobile);
  await save(page,'#saveRootContainerBtn',isMobile);
  await page.reload(); await waitForApp(page);
  await activate(page.getByRole('heading',{name:'Сумка',exact:true}),isMobile);
  const popupPromise=page.waitForEvent('popup');
  await activate(page.locator('#rootContainerNoteRich a'),isMobile);
  const popup=await popupPromise; await popup.waitForLoadState();
  expect(popup.url()).toBe('https://example.com/created#bag');
  await popup.close();
});


test('layout notes support formatting, named links, reload and discard', async ({page,isMobile})=>{
  await fixture(page);
  await activate(page.locator('#editLayoutBtn'),isMobile);
  await activate(page.locator('[data-trip-add]'),isMobile);
  await paste(page.locator('#layoutEditNotes'), '<p><strong>Проверить</strong> перед поездкой</p>');
  await expect(page.locator('#layoutEditNotesRich strong')).toHaveText('Проверить');
  await activate(page.locator('#layoutEditDialog [data-note-command="link"]'),isMobile);
  const panel=page.locator('#layoutEditDialog .rich-note-link-panel');
  await panel.locator('[data-note-link-field="text"]').fill('Инструкция');
  await panel.locator('[data-note-link-field="url"]').fill('https://example.com/manual');
  await panel.locator('[data-note-link-field="url"]').blur();
  await activate(panel.locator('[data-note-link-apply]'),isMobile);
  await save(page,'#saveEditedLayoutBtn',isMobile);
  await expect(page.locator('.layout-notes-content strong')).toHaveText('Проверить');
  await expect(page.locator('.layout-notes-content a')).toHaveAttribute('href','https://example.com/manual');
  await page.reload(); await waitForApp(page);
  await activate(page.locator('#editLayoutBtn'),isMobile);
  await expect(page.locator('#layoutEditNotesRich strong')).toHaveText('Проверить');
  await expect(page.locator('#layoutEditNotesRich a')).toHaveText('Инструкция');
  await expect(page.locator('#saveEditedLayoutBtn')).toBeDisabled();
  await page.locator('#layoutEditNotesRich').fill('Не сохранять');
  await page.evaluate(()=>document.activeElement?.blur());
  await activate(page.locator('#layoutEditDialog header button'),isMobile);
  await activate(page.locator('#confirmCancelBtn'),isMobile);
  await activate(page.locator('#editLayoutBtn'),isMobile);
  await expect(page.locator('#layoutEditNotesRich strong')).toHaveText('Проверить');
  await page.screenshot({path:`test-results/v1613-layout-notes-${isMobile?'mobile':'desktop'}.png`});
});


test('history renders safe formatted before/after notes and exact layout quantities', async({page})=>{
  const {readFile}=await import('node:fs/promises');
  const {resolve}=await import('node:path');
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await page.route('**/__testsrc/**',async route=>{
    const relative=new URL(route.request().url()).pathname.split('/__testsrc/')[1];
    if (!relative.startsWith('src/') || relative.includes('..')) return route.abort();
    await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(relative),'utf8')});
  });
  await page.evaluate(async()=>{
    const {renderHistoryRecordDetails}=await import('/__testsrc/src/ui/history-diff.js');
    const before={items:{i:{id:'i',name:'Носки',note:'Старое'}},containers:{b:{id:'b',name:'Сумка',note:'Старое'}},layouts:{l:{id:'l',name:'Поход',notes:'Старое',arrangement:{items:{i:'b'},itemQuantities:{i:1}}}}};
    const after=structuredClone(before);
    for (const [map,key] of [['items','note'],['containers','note'],['layouts','notes']]) {
      const entity=Object.values(after[map])[0];
      entity[key]='Новое инструкция';
      entity[`${key}Html`]='<p><strong>Новое</strong> <a href="https://example.com/manual">инструкция</a></p><img src=x onerror="window.historyXss=1"><script>window.historyXss=1</script>';
    }
    after.layouts.l.arrangement.itemQuantities.i=3;
    const host=document.createElement('section');host.id='history-render-test';
    host.innerHTML=renderHistoryRecordDetails({id:1},0,[{id:1}],{recordState:()=>before,currentComparisonState:()=>after});
    document.body.append(host);
  });
  const result=page.locator('#history-render-test');
  await expect(result.locator('.history-note-comparison')).toHaveCount(3);
  await expect(result.locator('.note-content strong')).toHaveText(['Новое','Новое','Новое']);
  await expect(result.locator('a')).toHaveCount(3);
  await expect(result.locator('a').first()).toHaveAttribute('rel','noopener noreferrer');
  await expect(result).toContainText('Количество «Носки»: 1 → 3');
  await expect(result).not.toContainText('Изменено размещение');
  await expect(result).not.toContainText('<strong>');
  await expect(result.locator('script,img,[onerror]')).toHaveCount(0);
  expect(await page.evaluate(()=>window.historyXss)).toBeUndefined();
  await result.screenshot({path:'test-results/v1613-history-formatted.png'});
});


test('existing links can be edited through visible fields in layout, item and bag notes', async ({page,isMobile}) => {
  test.setTimeout(60000);
  await fixture(page);
  const cases = [
    ['layoutEditNotes', 'layoutEditDialog', '#editLayoutBtn', '#saveEditedLayoutBtn'],
    ['itemNote', 'itemDialog', '[data-item-id="notesItem"] .item-title-hitarea', '#saveItemBtn'],
    ['rootContainerNote', 'rootContainerDialog', '[data-root-container-id="notesBag"] .container-title', '#saveRootContainerBtn']
  ];
  for (const [id,dialog,trigger,saveButton] of cases) {
    const open = () => activate(id === 'rootContainerNote' ? page.getByRole('heading',{name:'Сумка',exact:true}) : page.locator(trigger),isMobile);
    await open();
    if (id === 'layoutEditNotes') await activate(page.locator('[data-trip-add]'),isMobile);
    await page.locator(`#${id}`).fill('');
    await paste(page.locator(`#${id}`), '<p><a href="https://example.com/first"><strong>Первая</strong></a> и <a href="https://example.com/second">Вторая</a></p>');
    await save(page,saveButton,isMobile);
    await page.reload(); await waitForApp(page);
    await open();
    await activate(page.locator(`#${dialog} [data-note-command="edit-link"]`),isMobile);
    const panel=page.locator(`#${dialog} .rich-note-link-panel`);
    await expect(panel.locator('[data-note-edit-link]')).toHaveCount(2);
    await activate(panel.locator('[data-note-edit-link]').nth(1),isMobile);
    await expect(panel.locator('[data-note-link-field="text"]')).toHaveValue('Вторая');
    await expect(panel.locator('[data-note-link-field="url"]')).toHaveValue('https://example.com/second');
    await panel.locator('[data-note-link-field="text"]').fill('Новая подпись');
    await panel.locator('[data-note-link-field="url"]').fill('https://example.com/updated');
    await page.evaluate(()=>document.activeElement?.blur());
    await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
    await activate(panel.getByRole('button',{name:'Сохранить ссылку',exact:true}),isMobile);
    await expect(page.locator(`#${id}Rich a`)).toHaveCount(2);
    await expect(page.locator(`#${id}Rich a`).nth(1)).toHaveText('Новая подпись');
    await save(page,saveButton,isMobile);
    await page.reload(); await waitForApp(page);
    await open();
    await expect(page.locator(`#${id}Rich a`).nth(1)).toHaveAttribute('href','https://example.com/updated');
    await expect(page.locator(`#${id}Rich a`).first()).toHaveText('Первая');
    await expect(page.locator(`#${id}Rich strong`)).toHaveText('Первая');
    await activate(page.locator(`#${dialog} header button[value="cancel"]`),isMobile);
  }
});
