import { expect, test } from "@playwright/test";
import { prepareIsolatedRussianGuest, openApp, createEmptyLayout, waitForApp } from "./guest-test-helpers.js";

test("layout photos: captions, reorder, fullscreen, persistence, discard and video validation", async ({ page, browserName }) => {
  test.setTimeout(60000);
  const navigatePhoto = async (direction) => {
    if (browserName !== 'webkit') {
      await expect.poll(()=>page.locator('.photo-lightbox-image').evaluateAll(images=>images.some(image=>image.complete && image.naturalWidth>0))).toBe(true);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      return page.locator(direction > 0 ? '.photo-lightbox-next' : '.photo-lightbox-prev').click();
    }
    await page.evaluate(async direction => {
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const track=document.querySelector('.photo-lightbox-track');
      const width=track.clientWidth;
      const start=direction>0?width*.8:width*.2;
      const send=(type,x,count=1)=>{
        const event=new Event(type,{bubbles:true,cancelable:true});
        const touch={identifier:1,clientX:x,clientY:300};
        Object.defineProperty(event,'touches',{value:count?[touch]:[]});
        Object.defineProperty(event,'changedTouches',{value:[touch]});track.dispatchEvent(event);
      };
      send('touchstart',start);send('touchmove',start-direction*12);
      await new Promise(resolve=>requestAnimationFrame(resolve));
      send('touchmove',start-direction*width*.65);
      await new Promise(resolve=>requestAnimationFrame(resolve));
      send('touchend',start-direction*width*.65,0);
    },direction);
  };
  await prepareIsolatedRussianGuest(page);
  await openApp(page);
  await createEmptyLayout(page, "Фото поездки");
  await page.locator("#editLayoutBtn").click();
  await page.locator("[data-trip-add]").click();
  const editor = page.locator("[data-layout-media-editor]");
  const png = Buffer.from(await page.evaluate(() => {
    const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#d7e4df';ctx.fillRect(0,0,320,180);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  if (browserName === 'webkit') {
    // Windows WebKit cannot persist Blob values in IndexedDB. Cover gallery UI
    // with already-synced images; Chromium above covers the actual upload path.
    await page.route('https://example.com/layout-test-*.png**', route=>route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'http://bike-packing.localhost:4173','Access-Control-Allow-Credentials':'true'},body:png}));
    await page.evaluate(()=>{
      const key='bike-packing-prototype-state-v1';const state=JSON.parse(localStorage.getItem(key));
      const layout=Object.values(state.layouts).find(x=>x.name==='Фото поездки');
      layout.photos=['a','b'].map(id=>({id:`layout-photo-${id}`,url:`https://example.com/layout-test-${id}.png`,thumbUrl:`https://example.com/layout-test-${id}.png`,width:320,height:180,status:'synced'}));
      localStorage.setItem(key,JSON.stringify(state));
    });
    await page.reload(); await waitForApp(page);
    await page.locator('#layoutSelect').selectOption({label:'Фото поездки (1 поездка)'});
    await page.locator('#editLayoutBtn').click();
  } else {
    await editor.locator("input[type=file]").first().setInputFiles([
      { name: "bike.png", mimeType: "image/png", buffer: png },
      { name: "bags.png", mimeType: "image/png", buffer: png }
    ]);
  }
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(2);
  await editor.locator("[data-layout-photo-caption]").nth(0).fill("Велосипед целиком");
  await editor.locator("[data-layout-photo-caption]").nth(1).fill("Упакованные сумки");
  await editor.locator('[data-layout-photo-move="-1"]').nth(1).click();
  await expect(editor.locator("[data-layout-photo-caption]").first()).toHaveValue("Упакованные сумки");
  await page.locator("#layoutEditNotes").fill("Заметки сохраняются");
  await editor.locator("[data-layout-video]").fill("javascript:alert(1)");
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator("dialog.keyboard-focus-active")).toHaveCount(0);
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await editor.locator("[data-layout-video]").fill("https://youtu.be/example");
  await expect(editor.locator("[data-layout-video-link]")).toHaveAttribute("href", "https://youtu.be/example");
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator("dialog.keyboard-focus-active")).toHaveCount(0);
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.reload();
  await waitForApp(page);
  await page.locator("#layoutSelect").selectOption({ label: "Фото поездки (1 поездка)" });
  const summary = page.locator('#layoutPhotoSummary');
  await expect(summary).toBeVisible();
  await expect(summary.locator('[data-photo-open]')).toHaveCount(2);
  await expect(summary.locator('figcaption')).toHaveText(['Упакованные сумки','Велосипед целиком']);
  await summary.locator('[data-photo-open]').nth(1).click();
  await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute('aria-current','true');
  await navigatePhoto(-1);
  await expect(page.locator('[data-photo-lightbox-dot="0"]')).toHaveAttribute('aria-current','true');
  await page.keyboard.press('Escape');
  // Guest users always see В, including after an admin preference remains in storage.
  await expect(page.locator('#packingVisualStyleControl')).toBeHidden();
  await expect(summary).toHaveAttribute('data-photo-view','grid');
  const description = page.locator('#layoutDescriptionSummary');
  await expect(page.locator('#layoutIntroductionTitle')).toHaveText('Поездки');
  await expect(description).toContainText('Заметки сохраняются');
  expect(await description.evaluate(el => el.previousElementSibling.id)).toBe('layoutPhotoSummary');
  await page.evaluate(() => {
    localStorage.setItem('bike-packing-layout-photo-view-v1','hidden');
    localStorage.setItem('bike-packing-layout-description-position-v1','above');
  });
  await page.reload(); await waitForApp(page);
  await page.locator('#layoutSelect').selectOption({label:'Фото поездки (1 поездка)'});
  await expect(summary).toHaveAttribute('data-photo-view','grid');
  await expect(summary).toBeVisible();
  expect(await description.evaluate(el => el.previousElementSibling.id)).toBe('layoutPhotoSummary');
  await createEmptyLayout(page,'Без фотографий');
  await expect(summary).toBeHidden();
  await page.locator('#layoutSelect').selectOption({label:'Фото поездки (1 поездка)'});
  await expect(summary.locator('[data-photo-open]')).toHaveCount(2);
  if (browserName !== 'webkit') await page.setViewportSize({width:1280,height:720});

  await page.locator("#editLayoutBtn").click();
  await expect(editor.locator("[data-layout-photo-caption]").first()).toHaveValue("Упакованные сумки");
  await expect(page.locator("#layoutEditNotes")).toHaveValue("Заметки сохраняются");
  await expect(editor.locator("[data-layout-video]")).toHaveValue("https://youtu.be/example");
  await editor.locator("[data-photo-open]").first().click();
  await expect(page.locator(".photo-lightbox-image")).toHaveCount(2);
  await expect(page.locator('[data-photo-lightbox-dot="0"]')).toHaveAttribute('aria-current', 'true');
  await navigatePhoto(1);
  await expect(page.locator('[data-photo-lightbox-dot="1"]')).toHaveAttribute('aria-current', 'true');
  await navigatePhoto(-1);
  await expect(page.locator('[data-photo-lightbox-dot="0"]')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press("Escape");
  await expect(page.locator("#layoutEditDialog")).toBeVisible();
  await editor.locator("[data-layout-photo-remove]").first().click();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(1);
  await page.locator("#layoutEditDialog header button").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmCancelBtn").click();
  await expect(page.locator("#layoutEditDialog")).not.toBeVisible();
  await page.locator("#editLayoutBtn").click();
  await expect(editor.locator("[data-layout-photo-caption]")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/layout-media-mobile.png" });
  const widths=await editor.evaluate(node=>({width:node.clientWidth,scroll:node.scrollWidth,children:[...node.querySelectorAll('*')].filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>({tag:el.tagName,cls:el.className,width:el.clientWidth,scroll:el.scrollWidth}))}));
  expect(widths.scroll,JSON.stringify(widths)).toBeLessThanOrEqual(widths.width+1);
});


test('photo introduction: admin variants, description placement and horizontal overflow', async ({page}) => {
  const {readFile} = await import('node:fs/promises');
  const {resolve} = await import('node:path');
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await page.route('**/__testsrc/**',async route => {
    const relative=new URL(route.request().url()).pathname.split('/__testsrc/')[1];
    if (!relative.startsWith('src/') || relative.includes('..')) return route.abort();
    await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(relative),'utf8')});
  });
  await page.evaluate(async () => {
    const {setupLayoutPhotoViewControl,createLayoutPhotoSummary}=await import('/__testsrc/src/ui/layout-photo-summary.js');
    const root=document.createElement('section');root.id='intro-fixture';root.style.width='340px';
    root.innerHTML='<div data-options></div><div data-intro class="layout-introduction"><section class="layout-photo-summary" data-photos></section><section id="layoutDescriptionSummary">Описание поездки</section></div>';
    document.body.prepend(root);
    let admin=true;
    setupLayoutPhotoViewControl(root.querySelector('[data-options]'),(en,ru)=>ru,()=>admin);
    const summary=createLayoutPhotoSummary({host:root.querySelector('[data-photos]'),canChoose:()=>admin,localText:(en,ru)=>ru,renderGallery:async()=>'<button data-photo-open class="layout-summary-thumbnail"><img alt="" /></button>',bindGalleries:()=>({destroy(){}})});
    const layout={id:'intro',photos:Array.from({length:15},(_,i)=>({id:`photo-${i}`,url:`https://example.com/${i}.png`,caption:`Фото ${i+1}`,status:'synced'}))};
    await summary.render(layout,true);
    window.introFixture={render:()=>summary.render(layout,true),guest:()=>{admin=false;return summary.render(layout,true);},hide:()=>summary.render(layout,false)};
  });
  const root=page.locator('#intro-fixture');
  const photos=root.locator('[data-photos]');
  await expect(root.locator('[data-layout-photo-view="grid"]')).toHaveAttribute('data-visual-default','true');
  await expect(root.locator('[data-trip-backdrop="photo"]')).toHaveValue('32');
  await root.locator('[data-trip-backdrop="photo"]').evaluate(el=>{el.value='68';el.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(await root.locator('[data-intro]').evaluate(el=>el.style.getPropertyValue('--trip-backdrop-photo'))).toBe('0.68');
  await expect(root.locator('[data-backdrop-output="photo"]')).toHaveText('68%');
  await page.evaluate(()=>window.introFixture.render());
  expect(await root.locator('[data-intro]').evaluate(el=>el.style.getPropertyValue('--trip-backdrop-photo'))).toBe('0.68');
  for (const variant of ['strip','hero','grid']) {
    await root.locator(`[data-layout-photo-view="${variant}"]`).click();
    await expect(photos).toHaveAttribute('data-photo-view',variant);
  }
  const list=photos.locator('.layout-photo-summary-list');
  expect(await list.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(await list.evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft>0;})).toBe(true);
  expect(await photos.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await root.locator('[data-intro]').evaluate(el=>el.lastElementChild.id)).toBe('layoutDescriptionSummary');
  await root.locator('[data-layout-photo-view="hidden"]').click();
  await expect(photos).toBeHidden();
  await expect(root.locator('#layoutDescriptionSummary')).toBeVisible();
  await page.evaluate(()=>window.introFixture.guest());
  expect(await root.locator('[data-intro]').evaluate(el=>el.style.getPropertyValue('--trip-backdrop-photo'))).toBe('0.32');
  await expect(photos).toBeVisible();
  await expect(photos).toHaveAttribute('data-photo-view','grid');
  expect(await root.locator('[data-intro]').evaluate(el=>el.lastElementChild.id)).toBe('layoutDescriptionSummary');
  await page.evaluate(()=>window.introFixture.hide());
  await root.locator('[data-layout-photo-view="strip"]').click();
  await expect(photos).toBeHidden();
});


test('shared link opens photos and rich description together without editing controls', async ({page}) => {
  await prepareIsolatedRussianGuest(page);
  const photo={id:'shared-photo',url:'https://example.com/shared-bike.svg',thumbUrl:'https://example.com/shared-bike.svg',caption:'Велосипед с сумками',width:320,height:180,status:'synced'};
  const payload={locations:[],categories:[],containers:{},items:{},layouts:{trip:{id:'trip',name:'Поездка на выходные',rootContainerIds:[],notes:'Два дня на велосипеде. Маршрут',notesHtml:'<p><strong>Два дня</strong> на велосипеде. <a href="https://example.com/route">Маршрут</a></p>',photos:[photo],videoUrl:'https://youtu.be/example'}},activeLayoutId:'trip'};
  payload.layouts.trip.trips=[{id:'first',name:'Первая поездка',notes:payload.layouts.trip.notes,notesHtml:payload.layouts.trip.notesHtml,videoUrl:payload.layouts.trip.videoUrl},{id:'second',name:'Вторая поездка',notes:'Новая поездка с тем же набором вещей'}];
  payload.layouts.trip.trips[0].privateNotes='Секретная заметка';payload.layouts.trip.trips[0].publishNotes=false;
  payload.layouts.trip.trips[1].privateNotes='Публичная заметка';payload.layouts.trip.trips[1].publishNotes=true;
  payload.layouts.trip.photos[0].tripId='first';
  delete payload.layouts.trip.notes; delete payload.layouts.trip.notesHtml; delete payload.layouts.trip.videoUrl;
  await page.route('**/bike-packing/lists/intro-test',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({list:{id:'intro-test',visibility:'shared',title:'Поездка на выходные',payload}})}));
  await page.route(`${photo.url}**`,route=>route.fulfill({contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'http://bike-packing.localhost:4173','Access-Control-Allow-Credentials':'true'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#d7e4df"/></svg>'}));
  await page.goto('/?sharedList=intro-test&sharedLayout=trip');
  await waitForApp(page);
  const photos=page.locator('#layoutPhotoSummary');
  const description=page.locator('#layoutDescriptionSummary');
  await expect(photos).toBeVisible();
  await expect(photos).toHaveAttribute('data-photo-view','grid');
  await expect(photos.locator('figcaption')).toHaveText('Велосипед с сумками');
  await expect.poll(()=>photos.locator('img').evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
  await expect(description.locator('strong').last()).toHaveText('Два дня');
  await expect(description.locator('a')).toHaveAttribute('href','https://example.com/route');
  await expect(page.locator('#layoutIntroduction [data-edit-layout-notes]')).toHaveCount(0);
  await expect(description).not.toContainText('Секретная заметка');
  await page.locator('[data-trip-next]').click();
  await expect(description).toContainText('Новая поездка с тем же набором вещей');
  await expect(description).toContainText('Публичная заметка');
  await expect(photos).toBeHidden();
  await page.locator('[data-trip-prev]').click();
  await expect(photos).toBeVisible();
  await expect(page.locator('#packingVisualStyleControl')).toBeHidden();
  const positions=await page.evaluate(()=>['layoutPhotoSummary','layoutDescriptionSummary','summary'].map(id=>document.getElementById(id).getBoundingClientRect().top));
  expect(positions[0]).toBeLessThan(positions[1]); expect(positions[1]).toBeLessThan(positions[2]);
  const fold=page.locator('[data-toggle-layout-introduction]');
  await expect(fold).toHaveAttribute('aria-expanded','true');
  const spacing=await page.evaluate(()=>{
    const controls=document.querySelector('.controls').getBoundingClientRect();
    const intro=document.querySelector('#layoutIntroduction').getBoundingClientRect();
    const summary=document.querySelector('#summary').getBoundingClientRect();
    return [intro.top-controls.bottom,summary.top-intro.bottom];
  });
  expect(spacing[0]).toBeGreaterThanOrEqual(12);
  expect(Math.abs(spacing[0]-spacing[1])).toBeLessThan(1);
  await fold.click();await expect(photos).toBeHidden();await expect(description).toBeHidden();
  await page.reload();await waitForApp(page);
  await expect(fold).toHaveAttribute('aria-expanded','false');
  await expect(photos).toBeHidden();await expect(description).toBeHidden();
  await fold.click();await expect(photos).toBeVisible();await expect(description).toBeVisible();
  await page.screenshot({path:`test-results/v1615-shared-description-${test.info().project.name}.png`});
});


test('trips: legacy migration, independent stories, count, paging, reload, cancel and removal', async ({page, isMobile}) => {
  test.setTimeout(90000);
  await prepareIsolatedRussianGuest(page); await openApp(page); await createEmptyLayout(page,'Общая укладка');
  const layoutId=await page.locator('#layoutSelect').inputValue();
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
  await page.route('https://example.com/trip-photo-*.png**',route=>route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'http://bike-packing.localhost:4173','Access-Control-Allow-Credentials':'true'},body:png}));
  await page.evaluate(id=>{
    const key='bike-packing-prototype-state-v1';const state=JSON.parse(localStorage.getItem(key));
    Object.assign(state.layouts[id],{notes:'Старое описание',photos:['a','b'].map(id=>({id,caption:`Фото ${id}`,url:`https://example.com/trip-photo-${id}.png`,thumbUrl:`https://example.com/trip-photo-${id}.png`,status:'synced'}))});
    localStorage.setItem(key,JSON.stringify(state));
  },layoutId);
  await page.reload(); await waitForApp(page); await page.locator('#layoutSelect').selectOption(layoutId);
  const original=await page.evaluate(id=>JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1')).layouts[id].arrangement,layoutId);
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Общая укладка (1 поездка)');
  await expect(page.locator('#layoutDescriptionSummary')).toContainText('Старое описание');
  await expect(page.locator('#layoutPhotoSummary [data-photo-open]')).toHaveCount(2);
  await page.locator('#editLayoutBtn').click();
  await expect(page.locator('#saveEditedLayoutBtn')).toBeDisabled();
  await page.locator('[data-trip-name]').fill('По озёрам');
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await page.locator('[data-trip-add]').click();
  await page.locator('[data-trip-name]').fill('Лесные выходные');
  await page.locator('#layoutEditNotes').fill('Ночёвка в лесу');
  await page.locator('[data-layout-video]').fill('https://youtu.be/forest');
  await page.locator('[data-layout-trips-editor] select').selectOption('0');
  await expect(page.locator('#layoutEditNotes')).toHaveValue('Старое описание');
  await expect(page.locator('[data-layout-photo-caption]')).toHaveCount(2);
  await page.locator('[data-layout-trips-editor] select').selectOption('1');
  await expect(page.locator('#layoutEditNotes')).toHaveValue('Ночёвка в лесу');
  await expect(page.locator('[data-layout-photo-caption]')).toHaveCount(0);
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await page.locator('#saveEditedLayoutBtn').click();
  await expect(page.locator('#layoutEditDialog')).toBeHidden();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Общая укладка (2 поездки)');
  await expect(page.locator('[data-layout-trip-navigation] option:checked')).toHaveText('По озёрам');
  await page.locator('[data-trip-next]').click();
  await expect(page.locator('[data-layout-trip-navigation] option:checked')).toHaveText('Лесные выходные');
  await expect(page.locator('#layoutDescriptionSummary')).toHaveText('Ночёвка в лесу');
  await expect(page.locator('#layoutPhotoSummary [data-photo-open]')).toHaveCount(0);
  await expect(page.locator('#layoutPhotoSummary a')).toHaveAttribute('href','https://youtu.be/forest');
  expect(await page.locator('#layoutIntroduction').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.locator('#layoutIntroduction').screenshot({path:`test-results/v1616-trips-${isMobile?'mobile':'desktop'}.png`});
  await page.locator('#editLayoutBtn').click();
  await expect(page.locator('[data-trip-name]')).toHaveValue('Лесные выходные');
  await page.locator('#layoutEditNotes').fill('Отменить правку');
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await page.locator('#layoutEditDialog header button').click();
  await page.locator('#confirmCancelBtn').click();
  await page.reload(); await waitForApp(page); await page.locator('#layoutSelect').selectOption(layoutId);
  await page.locator('[data-trip-next]').click();
  await expect(page.locator('#layoutDescriptionSummary')).toHaveText('Ночёвка в лесу');
  await page.locator('#editLayoutBtn').click();
  await page.locator('[data-trip-remove]').click();
  await expect(page.locator('#confirmOkBtn')).toHaveText('Удалить поездку');
  await page.locator('#confirmOkBtn').click();
  await expect(page.locator('[data-layout-trips-editor] option')).toHaveCount(1);
  await page.locator('#saveEditedLayoutBtn').click();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Общая укладка (1 поездка)');
  await expect(page.locator('#layoutPhotoSummary [data-photo-open]')).toHaveCount(2);
  const saved=await page.evaluate(id=>JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1')).layouts[id],layoutId);
  expect(saved.arrangement).toEqual(original);
  expect(saved.photos.every(photo=>photo.tripId===saved.trips[0].id)).toBe(true);
  await page.locator('#newLayoutBtn').click();
  await expect(page.locator('#layoutCopyFrom option:checked')).toHaveText('Общая укладка (1 поездка)');
  await page.locator('#layoutCreateMode').selectOption('copy');
  await page.locator('#layoutName').fill('Основа новой укладки');
  await page.evaluate(()=>document.activeElement?.blur());
  await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);
  await page.locator('#saveLayoutBtn').click();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Основа новой укладки (1 поездка)');
  await expect(page.locator('#layoutDescriptionSummary')).toContainText('Старое описание');
  await expect(page.locator('#layoutPhotoSummary [data-photo-open]')).toHaveCount(2);
});


test('new photos survive switching trip drafts and save, while discarded additions stay out', async ({page,browserName}) => {
  test.skip(browserName==='webkit','Windows WebKit cannot persist IndexedDB Blob files; synced galleries are covered separately.');
  await prepareIsolatedRussianGuest(page); await openApp(page); await createEmptyLayout(page,'Фотографии разных поездок');
  const id=await page.locator('#layoutSelect').inputValue();
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=64;c.height=64;const x=c.getContext('2d');x.fillStyle='#35866c';x.fillRect(0,0,64,64);return c.toDataURL().split(',')[1];}),'base64');
  await page.locator('#editLayoutBtn').click();
  for (let i=0;i<2;i++) {
    await page.locator('[data-trip-add]').click();
    await page.locator('[data-trip-name]').fill(`Поездка ${i+1}`);
    await page.locator('[data-layout-media-editor] input[type=file]').first().setInputFiles({name:`trip-${i}.png`,mimeType:'image/png',buffer:png});
    await expect(page.locator('[data-layout-photo-caption]')).toHaveCount(1);
    await expect(page.locator('[data-trip-add]')).toBeEnabled();
    await page.locator('[data-layout-photo-caption]').fill(`Фотография ${i+1}`);
  }
  await page.locator('[data-layout-trips-editor] select').selectOption('0');
  await expect(page.locator('[data-layout-photo-caption]')).toHaveValue('Фотография 1');
  await page.locator('#saveEditedLayoutBtn').click();
  await page.reload();await waitForApp(page);await page.locator('#layoutSelect').selectOption(id);
  for(let i=0;i<2;i++) {
    await expect(page.locator('#layoutPhotoSummary figcaption')).toHaveText(`Фотография ${i+1}`);
    await expect.poll(()=>page.locator('#layoutPhotoSummary img').evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.locator('#layoutPhotoSummary [data-photo-open]').click();
    await expect(page.locator('.photo-lightbox-image')).toHaveCount(1);
    await page.keyboard.press('Escape');
    if(!i) await page.locator('[data-trip-next]').click();
  }
  await page.locator('#editLayoutBtn').click();await page.locator('[data-trip-add]').click();
  await page.locator('[data-layout-media-editor] input[type=file]').first().setInputFiles({name:'discard.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('[data-trip-add]')).toBeEnabled();
  await page.locator('[data-layout-trips-editor] select').selectOption('0');
  await page.locator('#layoutEditDialog header button').click();await page.locator('#confirmCancelBtn').click();
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Фотографии разных поездок (2 поездки)');
  await page.locator('#editLayoutBtn').click();await expect(page.locator('[data-layout-trips-editor] option')).toHaveCount(2);
});


test('trip videos, separate notes and stable scrolling card', async ({page,isMobile})=>{
  test.setTimeout(90000);
  await prepareIsolatedRussianGuest(page);await openApp(page);await createEmptyLayout(page,'Поездки и заметки');
  const id=await page.locator('#layoutSelect').inputValue();
  const blur=async()=>{await page.evaluate(()=>document.activeElement?.blur());await expect(page.locator('dialog.keyboard-focus-active')).toHaveCount(0);};
  await page.locator('#editLayoutBtn').click();await page.locator('[data-trip-add]').click();
  await page.locator('[data-trip-name]').fill('Длинная поездка');
  await page.locator('#layoutEditNotes').fill(Array.from({length:40},(_,i)=>`Описание маршрута, строка ${i+1}`).join('\n'));
  await page.locator('#layoutTripNotes').fill('Личная заметка');
  await expect(page.locator('[data-trip-publish-notes]')).not.toBeChecked();
  await page.locator('[data-layout-video]').fill('https://youtu.be/first');await blur();
  await page.locator('[data-layout-add-video]').click();await page.locator('[data-layout-video]').nth(1).fill('https://youtu.be/second');await blur();
  await page.locator('[data-layout-add-video]').click();await page.locator('[data-layout-video]').nth(2).fill('javascript:alert(1)');await blur();
  await page.locator('#saveEditedLayoutBtn').click();await expect(page.locator('#layoutEditDialog')).toBeVisible();
  await page.locator('[data-layout-video]').nth(2).fill('https://youtu.be/third');await blur();
  await page.locator('[data-trip-add]').click();await page.locator('[data-trip-name]').fill('Короткая поездка');
  await page.locator('#layoutEditNotes').fill('Один день');await page.locator('#layoutTripNotes').fill('Заметка для публикации');
  await page.locator('[data-trip-publish-notes]').check();await blur();
  await page.locator('#saveEditedLayoutBtn').click();
  const card=page.locator('#layoutIntroduction');const content=page.locator('#layoutIntroductionContent');
  await expect(page.locator('#layoutPhotoSummary a')).toHaveCount(3);
  await expect(page.locator('.trip-notes-summary')).toContainText('Не публикуются');
  const geometry=()=>page.evaluate(()=>({height:document.querySelector('#layoutIntroduction').getBoundingClientRect().height,summary:document.querySelector('#summary').getBoundingClientRect().top-document.querySelector('#layoutIntroduction').getBoundingClientRect().top}));
  await page.waitForTimeout(350); // Let the editor closing transition settle before measuring.
  const first=await geometry();
  expect(await content.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await content.evaluate(el=>{el.scrollTop=el.scrollHeight;});
  expect(await content.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.locator('[data-trip-next]').click();
  await expect(page.locator('.trip-notes-summary')).toContainText('Видны в публикации');
  for(const [key,value] of Object.entries(await geometry())) expect(value).toBeCloseTo(first[key],0);
  expect(await content.evaluate(el=>el.scrollTop)).toBe(0);
  await page.locator('[data-trip-prev]').click();for(const [key,value] of Object.entries(await geometry())) expect(value).toBeCloseTo(first[key],0);
  await card.screenshot({path:`test-results/v1617-trip-card-${isMobile?'mobile':'desktop'}.png`});
  await page.reload();await waitForApp(page);await page.locator('#layoutSelect').selectOption(id);
  await expect(page.locator('#layoutPhotoSummary a')).toHaveCount(3);
  await page.locator('#editLayoutBtn').click();
  await expect(page.locator('#layoutTripNotes')).toHaveValue('Личная заметка');
  await expect(page.locator('[data-trip-publish-notes]')).not.toBeChecked();
  await page.locator('[data-layout-remove-video]').nth(1).click();
  await expect(page.locator('[data-layout-video]').nth(1)).toHaveValue('https://youtu.be/third');
  await page.locator('[data-trip-publish-notes]').check();await blur();await page.locator('#saveEditedLayoutBtn').click();
  await expect(page.locator('#layoutPhotoSummary a')).toHaveCount(2);
  await expect(page.locator('.trip-notes-summary')).toContainText('Видны в публикации');
  const record=await page.evaluate(id=>JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1')).layouts[id],id);
  expect(record.trips[0].videoUrls).toEqual(['https://youtu.be/first','https://youtu.be/third']);
  expect(record.trips[0].privateNotes).toBe('Личная заметка');
  expect(record.trips[0].publishNotes).toBe(true);
});


test('trip video thumbnails open a lazy player below photos with compact navigation', async ({page,isMobile}) => {
  await prepareIsolatedRussianGuest(page);
  await page.route('https://i.ytimg.com/**', route=>route.fulfill({status:404,body:''}));
  await page.route('https://www.youtube-nocookie.com/embed/**', route=>route.fulfill({contentType:'text/html',body:'<p>Test player</p>'}));
  await openApp(page);await createEmptyLayout(page,'Видео поездки');
  const id=await page.locator('#layoutSelect').inputValue();
  await page.evaluate(id=>{
    const key='bike-packing-prototype-state-v1';const state=JSON.parse(localStorage.getItem(key));
    state.layouts[id].trips=[{id:'video-trip',name:'Очень длинное название поездки с велосипедом и сумками',notes:'Описание после видео',videoUrls:['https://youtu.be/M7lc1UVf-VE?t=1m2s','https://www.youtube.com/shorts/abcdefghijk','https://example.com/video'],photos:[]}];
    localStorage.setItem(key,JSON.stringify(state));
  },id);
  await page.reload();await waitForApp(page);await page.locator('#layoutSelect').selectOption(id);
  const card=page.locator('#layoutIntroduction');
  const videos=card.locator('.layout-summary-videos');
  await expect(videos.locator('.layout-video-card')).toHaveCount(3);
  await expect(videos.locator('img').first()).toHaveAttribute('src','https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg');
  await expect(videos.locator('img').first()).toBeHidden();
  await expect(page.locator('.trip-video-dialog')).toHaveCount(0);
  const dimensions=await card.evaluate(card=>({header:card.querySelector('.layout-introduction-header').getBoundingClientRect().height,overflow:card.scrollWidth>card.clientWidth+1,videos:card.querySelector('.layout-summary-videos').getBoundingClientRect().bottom,description:card.querySelector('#layoutDescriptionSummary').getBoundingClientRect().top}));
  expect(dimensions.header).toBeLessThanOrEqual(66);expect(dimensions.overflow).toBe(false);expect(dimensions.description).toBeGreaterThan(dimensions.videos);
  if(isMobile) expect(await videos.locator('.layout-video-summary-list').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await videos.locator('.layout-video-card').first().click();
  const player=page.locator('.trip-video-dialog');
  await expect(player).toBeVisible();
  await expect(player.locator('iframe')).toHaveAttribute('src',/youtube-nocookie.com\/embed\/M7lc1UVf-VE.*start=62/);
  await expect(player.locator('.trip-video-external')).toHaveAttribute('href','https://youtu.be/M7lc1UVf-VE?t=1m2s');
  await player.getByRole('button',{name:'Закрыть видео'}).click();
  await expect(player).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveClass(/modal-scroll-locked/);
  await videos.locator('.layout-video-card').nth(1).click();await page.keyboard.press('Escape');
  await expect(player).toHaveCount(0);
  await expect(videos.locator('.layout-video-card').nth(2)).toHaveAttribute('href','https://example.com/video');
  await card.screenshot({path:`test-results/v1621-trip-videos-${isMobile?'mobile':'desktop'}.png`});
});
