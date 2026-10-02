import { expect, test } from "@playwright/test";
import { prepareIsolatedRussianGuest, openApp, createEmptyLayout, createRootContainer, waitForApp } from "./guest-test-helpers.js";

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
  await editor.locator("[data-layout-caption-edit]").nth(0).click();
  await editor.locator("[data-layout-photo-caption]").nth(0).fill("Велосипед целиком");
  await editor.locator("[data-layout-caption-edit]").nth(1).click();
  await editor.locator("[data-layout-photo-caption]").nth(1).fill("Упакованные сумки");
  await editor.locator("[data-layout-photo-caption]").nth(1).press("Enter");
  await editor.locator("[data-layout-photo-drag]").nth(1).press("ArrowLeft");
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
  await page.locator("#confirmOkBtn").click();
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
  await expect(list.locator("figure:visible")).toHaveCount(15);
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
  await expect(page.locator('#layoutSelect option:checked')).toHaveText('Основа новой укладки');
  await expect(page.locator('#layoutDescriptionSummary')).toBeHidden();
  await expect(page.locator('#layoutPhotoSummary [data-photo-open]')).toHaveCount(0);
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
    await page.locator('[data-layout-caption-edit]').click();
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


test("trip upload batches retain first photo, decoded previews and progress without reload", async ({page,browserName}) => {
  test.skip(browserName==='webkit','Windows WebKit cannot store Blob values in IndexedDB');
  test.setTimeout(60000);
  const {readFile}=await import('node:fs/promises');const {resolve}=await import('node:path');
  await prepareIsolatedRussianGuest(page);await openApp(page);
  await page.route('**/__testsrc/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/__testsrc/')[1];if(!relative.startsWith('src/')||relative.includes('..'))return route.abort();await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(relative),'utf8')});});
  await page.evaluate(async()=>{
    const {createLayoutTripsEditor}=await import('/__testsrc/src/ui/layout-trips-editor.js');
    const {createLayoutPhotoSummary}=await import('/__testsrc/src/ui/layout-photo-summary.js');
    const {applyLayoutTrips,layoutTripsSnapshot}=await import('/__testsrc/src/state/layout-trips.js');
    const {normalizeItemPhotos}=await import('/__testsrc/src/state/item-photos.js');
    const {createItemPhotoFromFile,getCachedPhoto,putCachedPhoto,deleteCachedPhoto}=await import('/__testsrc/src/sync/photos.js');
    const {createPhotoObjectUrlRegistry}=await import('/__testsrc/src/ui/photo-object-url-registry.js');
    const {renderPhotoGalleryHtml,bindPhotoGalleries,createDemandDrivenPhotoPreviewLoader}=await import('/__testsrc/src/ui/photo-gallery.js');
    const {uploadPhotoToPath}=await import('/__testsrc/src/sync/photo-upload-flow.js');
    const dialog=document.querySelector('#layoutEditDialog').cloneNode(true);
    const section=document.createElement('section');section.className='layout-introduction';section.innerHTML='<div id="fixture-summary" class="layout-photo-summary"></div><div id="layoutDescriptionSummary"></div>';
    document.body.replaceChildren(dialog,section);section.style.height='auto';
    const registry=createPhotoObjectUrlRegistry();registry.activateScope('guest');
    const loader=createDemandDrivenPhotoPreviewLoader({photoObjectUrls:registry,getScopeKey:()=> 'guest'});
    const bind=root=>bindPhotoGalleries(root,{photoObjectUrls:registry,photoPreviewLoader:loader});
    const editor=createLayoutTripsEditor({dialog,createPhoto:createItemPhotoFromFile,deleteCachedPhoto,renderGallery:renderPhotoGalleryHtml,bindGalleries:bind,onChange(){},getLimit:()=>100,localText:(en,ru)=>ru,showToast:message=>{throw Error(message);}});
    const layout={id:'batch-layout',trips:[{id:'trip',name:'Batch'}],photos:[]};editor.open(layout);dialog.showModal();
    const summary=createLayoutPhotoSummary({host:section.firstElementChild,renderGallery:renderPhotoGalleryHtml,bindGalleries:bind,localText:(en,ru)=>ru});
    const render=()=>summary.render({...layoutTripsSnapshot(layout)[0],id:layout.id},true);
    window.batchFixture={async save(){applyLayoutTrips(layout,editor.snapshot());editor.close(layout);dialog.close();await render();},async upload(){
      const initialImages=[...section.querySelectorAll('[data-photo-open] img')];let sawProgress=false;
      for(const photo of [...layout.photos]) {
        await uploadPhotoToPath({path:'/test/photos',listId:'fixture',entity:layout,entityType:'layout',photo,apiFetch:async()=>({}),getCachedPhoto,putCachedPhoto,registerCachedPhotoRecord:(task,record)=>registry.setRecord(task,record),
          apiUploadFormData:async(path,options)=>{for(const progress of [7,45,100]){options.onUploadProgress(progress);await render();sawProgress ||= [...section.querySelectorAll('.photo-upload-progress span')].some(el=>el.textContent==='45');normalizeItemPhotos(layout);await new Promise(requestAnimationFrame);}return {photo:{id:photo.id,url:`https://example.test/${photo.id}/file`,thumbUrl:`https://example.test/${photo.id}/thumb`}};},
          scheduleProgressRender:()=>render()});await render();
      }
      return {count:layout.photos.length,synced:layout.photos.filter(p=>p.status==='synced').length,sawProgress,sameImages:initialImages.every((img,i)=>img===section.querySelectorAll('[data-photo-open] img')[i]),cached:(await Promise.all(layout.photos.map(p=>getCachedPhoto(p.localId||p.id)))).every(r=>r?.blob?.size>0)};
    }};
  });
  const editor=page.locator('[data-layout-media-editor]');
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').fillRect(0,0,320,180);return c.toDataURL().split(',')[1];}),'base64');
  const file=n=>({name:`photo-${n}.png`,mimeType:'image/png',buffer:png});
  await editor.locator('input[type=file]').first().setInputFiles(file(0));
  await expect(editor.locator('[data-layout-photo-caption]')).toHaveCount(1);
  await editor.locator('input[type=file]').first().setInputFiles(Array.from({length:15},(_,i)=>file(i+1)));
  await expect(editor.locator('[data-layout-photo-caption]')).toHaveCount(16);
  await page.evaluate(()=>window.batchFixture.save());
  const images=page.locator('#fixture-summary [data-photo-open] img');await expect(images).toHaveCount(16);
  for(let i=0;i<4;i++){await images.nth(i).scrollIntoViewIfNeeded();await expect.poll(()=>images.nth(i).evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);}
  const result=await page.evaluate(()=>window.batchFixture.upload());
  expect(result).toEqual({count:16,synced:16,sawProgress:true,sameImages:true,cached:true});
  expect(await images.evaluateAll(imgs=>imgs.slice(0,4).every(img=>img.complete&&img.naturalWidth>0))).toBe(true);
});


for (const kind of ['item','container']) test(`${kind} photos added in separate batches survive save and reload`, async({page,browserName})=>{
  test.skip(browserName==='webkit','Windows WebKit cannot store Blob values in IndexedDB');
  await prepareIsolatedRussianGuest(page);await openApp(page);await createEmptyLayout(page,'Фото вещей и сумок');
  if(kind==='item') {
    const container=await createRootContainer(page,'Сумка');await container.locator('[data-add-to-container]').click();await page.locator('#createItemForContainerBtn').click();await page.locator('#itemName').fill('Фото вещи');
  } else {await page.locator('[data-add-packing-root]').click();await page.locator('#createRootForLayoutBtn').click();await page.locator('#rootContainerName').fill('Фото сумки');}
  const prefix=kind==='item'?'item':'rootContainer';
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=60;c.height=60;c.getContext('2d').fillRect(0,0,60,60);return c.toDataURL().split(',')[1];}),'base64');
  const file=n=>({name:`${kind}-${n}.png`,mimeType:'image/png',buffer:png});
  await page.locator(`#${prefix}PhotoInput`).setInputFiles(file(0));await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(1);
  await page.locator(`#${prefix}PhotoInput`).setInputFiles([file(1),file(2)]);await expect(page.locator(`#${prefix}PhotoPreview img`)).toHaveCount(3);
  await page.locator(kind==='item'?'#saveItemBtn':'#saveRootContainerBtn').click();
  await page.reload();await waitForApp(page);
  const result=await page.evaluate(kind=>{const state=JSON.parse(localStorage.getItem('bike-packing-prototype-state-v1'));return Object.values(state[kind==='item'?'items':'containers']).find(r=>r.name===(kind==='item'?'Фото вещи':'Фото сумки'))?.photos;},kind);
  expect(result).toHaveLength(3);expect(new Set(result.map(p=>p.id)).size).toBe(3);
});

test('trip thumbnail strip accepts a native horizontal touch gesture over images',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Native touch injection uses Chromium; other layout tests cover WebKit');
  const {readFile}=await import('node:fs/promises');const {resolve}=await import('node:path');
  await prepareIsolatedRussianGuest(page);await openApp(page);await page.setViewportSize({width:390,height:844});
  await page.route('**/__testsrc/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/__testsrc/')[1];if(!relative.startsWith('src/')||relative.includes('..'))return route.abort();await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(relative),'utf8')});});
  await page.evaluate(async()=>{
    const {renderPhotoGalleryHtml,bindPhotoGalleries}=await import('/__testsrc/src/ui/photo-gallery.js');
    document.body.innerHTML='<div class="layout-photo-summary" data-photo-view="grid"><div class="layout-photo-summary-list"></div></div>';
    const host=document.querySelector('.layout-photo-summary-list');host.innerHTML=(await Promise.all(Array.from({length:16},async(_,i)=>`<figure>${await renderPhotoGalleryHtml([{id:`photo-${i}`,status:'pending',localId:`photo-${i}`}],{className:'layout-summary-thumbnail'})}</figure>`))).join('');
    bindPhotoGalleries(document);
  });
  const strip=page.locator('.layout-photo-summary-list');
  const box=await strip.boundingBox();
  const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
  const point=x=>({x,y:box.y+30,id:1,radiusX:1,radiusY:1});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(box.x+285)]});
  for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(box.x+285-i*18)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(100);
  await expect(page.locator('.photo-lightbox[open]')).toHaveCount(0);
  await cdp.detach();
});


test('trip photos start uploading in the open editor and finish after save across picker batches',async({page,browserName})=>{
  test.skip(browserName==='webkit','Persistent WebKit storage is verified separately');
  const {readFile}=await import('node:fs/promises');const {resolve}=await import('node:path');
  await prepareIsolatedRussianGuest(page);await openApp(page);
  await page.route('**/__testsrc/**',async route=>{const relative=new URL(route.request().url()).pathname.split('/__testsrc/')[1];if(!relative.startsWith('src/')||relative.includes('..'))return route.abort();await route.fulfill({contentType:'text/javascript',body:await readFile(resolve(relative),'utf8')});});
  await page.evaluate(async()=>{
    const {createLayoutTripsEditor}=await import('/__testsrc/src/ui/layout-trips-editor.js');
    const {applyLayoutTrips}=await import('/__testsrc/src/state/layout-trips.js');
    const {createItemPhotoFromFile,getCachedPhoto,putCachedPhoto,deleteCachedPhoto}=await import('/__testsrc/src/sync/photos.js');
    const {renderPhotoGalleryHtml,bindPhotoGalleries,createDemandDrivenPhotoPreviewLoader}=await import('/__testsrc/src/ui/photo-gallery.js');
    const {createPhotoObjectUrlRegistry}=await import('/__testsrc/src/ui/photo-object-url-registry.js');
    const {uploadPhotoToPath}=await import('/__testsrc/src/sync/photo-upload-flow.js');
    const dialog=document.querySelector('#layoutEditDialog').cloneNode(true);document.body.replaceChildren(dialog);
    const registry=createPhotoObjectUrlRegistry();registry.activateScope('guest');
    const loader=createDemandDrivenPhotoPreviewLoader({photoObjectUrls:registry,getScopeKey:()=> 'guest'});
    const layout={id:'draft-upload-layout',trips:[{id:'trip',name:'Trip'}],photos:[]};
    let release;const gate=new Promise(resolve=>{release=resolve;});const uploads=[];const started=[];const bodySizes=[];
    const editor=createLayoutTripsEditor({dialog,createPhoto:createItemPhotoFromFile,deleteCachedPhoto,renderGallery:renderPhotoGalleryHtml,
      bindGalleries:root=>bindPhotoGalleries(root,{photoObjectUrls:registry,photoPreviewLoader:loader}),getSavedLayout:()=>layout,getUploadScope:()=> 'guest',
      uploadPhotos:options=>{
        const photo=options.photos[0];
        const pending=uploadPhotoToPath({path:'/test/photos',listId:'fixture',entity:options.entity,entityType:'layout',photo,getCachedPhoto,putCachedPhoto,
          apiFetch:async()=>({}),onPhotoProgress:options.onPhotoProgress,
          apiUploadFormData:async(path,request)=>{started.push(photo.id);bodySizes.push(request.body.get('file').size);request.onUploadProgress(24);await gate;return {photo:{id:photo.id,url:`https://example.test/${photo.id}/file`,thumbUrl:`https://example.test/${photo.id}/thumb`}};}
        }).finally(options.onAfterUpload);uploads.push(pending);return pending;
      },onChange(){},getLimit:()=>100,localText:(en,ru)=>ru,showToast:message=>{throw Error(message);}});
    editor.open(layout);dialog.showModal();
    window.immediateFixture={started,bodySizes,layout,save(){applyLayoutTrips(layout,editor.snapshot());editor.close(layout);dialog.close();},async finish(){release();await Promise.all(uploads);return layout.photos;}};
  });
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').fillRect(0,0,320,180);return c.toDataURL().split(',')[1];}),'base64');
  // A valid image with a large trailing payload checks that original bytes are
  // materialized but only the prepared image is sent to the upload transport.
  const large=Buffer.concat([png,Buffer.alloc(7_300_000)]);
  const input=page.locator('[data-layout-media-editor] input[type=file]').first();
  await input.setInputFiles({name:'large-original.png',mimeType:'image/png',buffer:large});
  await expect.poll(()=>page.evaluate(()=>window.immediateFixture.started.length)).toBe(1);
  await expect(page.locator('#layoutEditDialog')).toBeVisible();
  await expect(page.locator('.photo-upload-progress span')).toContainText(['24']);
  expect(await page.evaluate(()=>window.immediateFixture.bodySizes[0])).toBeLessThan(900*1024);
  await input.setInputFiles({name:'next.png',mimeType:'image/png',buffer:png});
  await expect.poll(()=>page.evaluate(()=>window.immediateFixture.started.length)).toBe(2);
  await expect(page.locator('[data-layout-photo-caption]')).toHaveCount(2);
  await page.locator('[data-layout-caption-edit]').first().click();
  await page.locator('[data-layout-photo-caption]').first().fill('First caption');
  expect(await page.evaluate(()=>window.immediateFixture.layout.photos.length)).toBe(0);
  await page.evaluate(()=>window.immediateFixture.save());
  const photos=await page.evaluate(()=>window.immediateFixture.finish());
  expect(photos).toHaveLength(2);expect(photos.every(photo=>photo.status==='synced'&&photo.url)).toBe(true);
  expect(photos[0].caption).toBe('First caption');expect(photos[0].tripId).toBe('trip');
});

test("saved trip item and bag galleries keep every recent upload badge", async ({ page }) => {
  const {readFile}=await import("node:fs/promises"); const {resolve}=await import("node:path");
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await page.route("**/__testsrc/**",async route=>{
    const relative=new URL(route.request().url()).pathname.split("/__testsrc/")[1];
    if(!relative.startsWith("src/")||relative.includes(".."))return route.abort();
    await route.fulfill({contentType:"text/javascript",body:await readFile(resolve(relative),"utf8")});
  });
  await page.evaluate(async()=>{
    const {markPhotoUploadBatch,createPhotoDraftFromRecord,syncPhotoRecordFromUpload}=await import("/__testsrc/src/state/item-photos.js");
    const {applyLayoutTrips,layoutTripsSnapshot}=await import("/__testsrc/src/state/layout-trips.js");
    const {renderItemPhotoHtml,renderPhotoGalleryHtml,updatePhotoGalleryUploadProgress}=await import("/__testsrc/src/ui/photo-gallery.js");
    const {createLayoutPhotoSummary}=await import("/__testsrc/src/ui/layout-photo-summary.js");
    document.body.innerHTML='<section id="trip"><div class="layout-introduction"><div class="layout-photo-summary"></div></div></section><section id="item"></section><section id="container"></section>';
    const photos=Array.from({length:10},(_,i)=>({id:String(i),localId:String(i),status:i<5?"synced":"pending",...(i<5?{url:"/photo-"+i}:{})}));
    markPhotoUploadBatch(photos.slice(0,5),{batchId:"first"}); markPhotoUploadBatch(photos.slice(5),{batchId:"second"});
    const layout={id:"layout",trips:[]};
    applyLayoutTrips(layout,[{id:"trip",photos}]);
    const item={photos:createPhotoDraftFromRecord({photos}).photos};
    const container={photos:createPhotoDraftFromRecord({photos}).photos};
    const summary=createLayoutPhotoSummary({host:document.querySelector(".layout-photo-summary"),renderGallery:renderPhotoGalleryHtml,bindGalleries:()=>({destroy(){},refresh(){}}),localText:(en,ru)=>ru});
    async function render(){
      await summary.render({...layoutTripsSnapshot(layout)[0],id:layout.id},true);
      document.querySelector("#item").innerHTML=renderItemPhotoHtml(item);
      document.querySelector("#container").innerHTML=renderItemPhotoHtml(container);
    }
    await render();
    window.badgeFixture={async finish(){
      for(const photo of photos.slice(5)){
        Object.assign(photo,{status:"synced",url:"/photo-"+photo.id});
        for(const record of [layout,item,container])syncPhotoRecordFromUpload(record,photo);
      }
      await summary.render({...layoutTripsSnapshot(layout)[0],id:layout.id},true);
      updatePhotoGalleryUploadProgress(document.querySelector("#item"),item.photos);
      updatePhotoGalleryUploadProgress(document.querySelector("#container"),container.photos);
    },render};
  });
  for(const id of ["trip","item","container"]){
    await expect(page.locator("#"+id+" .photo-upload-complete")).toHaveCount(5);
    await expect(page.locator("#"+id+" .photo-upload-progress")).toHaveCount(5);
  }
  await page.evaluate(()=>window.badgeFixture.finish());
  for(const id of ["trip","item","container"])await expect(page.locator("#"+id+" .photo-upload-complete")).toHaveCount(10);
  await page.evaluate(()=>window.badgeFixture.render());
  for(const id of ["trip","item","container"]){
    await expect(page.locator("#"+id+" .photo-upload-complete")).toHaveCount(10);
    await expect(page.locator("#"+id+" .photo-upload-progress")).toHaveCount(0);
  }
});

test("layout choice aligns colored trip counts and supports selection and keyboard", async ({ page }) => {
  await prepareIsolatedRussianGuest(page); await openApp(page);
  for (const name of ["Короткая", "Очень длинное название укладки для проверки столбца", "Без поездок"]) await createEmptyLayout(page, name);
  await page.evaluate(() => {
    const key="bike-packing-prototype-state-v1";
    const state=JSON.parse(localStorage.getItem(key));
    for (const layout of Object.values(state.layouts)) {
      if (layout.name==="Короткая") layout.trips=[{id:"a"},{id:"b"}];
      if (layout.name.startsWith("Очень длинное")) layout.trips=[{id:"a"}];
    }
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload(); await waitForApp(page);
  const trigger=page.locator(".layout-choice-trigger");
  await trigger.click();
  const list=page.locator(".layout-choice-list");
  const short=list.getByRole("option").filter({hasText:"Короткая"});
  const long=list.getByRole("option").filter({hasText:"Очень длинное"});
  await expect(short.locator(".has-trips")).toHaveText("2");
  await expect(long.locator(".has-trips")).toHaveText("1");
  const a=await short.locator(".has-trips").boundingBox();
  const b=await long.locator(".has-trips").boundingBox();
  expect(a.x).toBeCloseTo(b.x,0);
  await short.click();
  await expect(list).toBeHidden();
  await expect(trigger.locator(".layout-choice-name")).toHaveText("Короткая");
  await expect(page.locator("#layoutSelect option:checked")).toContainText("Короткая");
  await trigger.press("ArrowDown");
  await expect(list).toBeVisible();
  await trigger.press("End");
  await trigger.press("Enter");
  await expect(list).toBeHidden();
  await expect(trigger.locator(".layout-choice-name")).toHaveText("Без поездок");
  await expect(trigger.locator(".has-trips")).toHaveCount(0);
  await trigger.click();
  await trigger.press("Escape");
  await expect(list).toBeHidden();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await trigger.click();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  await page.screenshot({path:"ftp-upload/v1627/layout-choices-"+test.info().project.name+".png"});
});

test("copying a layout preserves gear but starts without trips or their media", async ({ page }) => {
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await createEmptyLayout(page,"Исходная укладка");
  const sourceId=await page.locator("#layoutSelect").inputValue();
  await page.evaluate(id=>{
    const key="bike-packing-prototype-state-v1";
    const state=JSON.parse(localStorage.getItem(key));
    const layout=state.layouts[id];
    layout.trips=[{id:"trip",name:"Прошлая поездка",notes:"Описание",privateNotes:"Личные заметки",videoUrls:["https://youtu.be/example"]}];
    layout.photos=[{id:"trip-photo",tripId:"trip",status:"synced",url:"https://example.test/trip.jpg"}];
    const bag=state.containers["copy-bag"]={id:"copy-bag",name:"Сумка для копии",weight:100,parentId:null};
    const item=state.items["copy-item"]={id:"copy-item",name:"Вещь для копии",weight:50,quantity:1,stockQuantity:3,containerId:bag.id};
    layout.rootContainerIds=[bag.id];
    layout.arrangement={rootContainerIds:[bag.id],containers:{[bag.id]:{parentId:null}},items:{[item.id]:{containerId:bag.id,quantity:3}}};
    item.note="Заметка вещи"; item.photos=[{id:"item-photo",status:"synced",url:"https://example.test/item.jpg"}];
    bag.note="Заметка сумки"; bag.photos=[{id:"bag-photo",status:"synced",url:"https://example.test/bag.jpg"}];
    localStorage.setItem(key,JSON.stringify(state));
  },sourceId);
  await page.reload(); await waitForApp(page);
  await page.locator("#newLayoutBtn").click();
  await page.locator("#layoutCreateMode").selectOption("copy");
  await page.locator("#layoutCopyFrom").selectOption(sourceId);
  await page.locator("#layoutName").fill("Новая копия");
  await page.locator("#saveLayoutBtn").click();
  await expect(page.locator("#layoutDialog")).not.toBeVisible();
  await expect(page.locator(".layout-choice-trigger .layout-choice-name")).toHaveText("Новая копия");
  const result=await page.evaluate(id=>{
    const state=JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1"));
    return {source:state.layouts[id],copy:Object.values(state.layouts).find(layout=>layout.name==="Новая копия"),items:Object.values(state.items),bags:Object.values(state.containers)};
  },sourceId);
  expect(result.copy.trips).toBeUndefined();expect(result.copy.photos).toBeUndefined();
  expect(result.copy.arrangement).toEqual(result.source.arrangement);
  expect(result.source.trips).toHaveLength(1);expect(result.source.photos).toHaveLength(1);
  expect(result.items.find(item=>item.name==="Вещь для копии").photos).toHaveLength(1);
  expect(result.bags.find(bag=>bag.name==="Сумка для копии").photos).toHaveLength(1);
  expect(result.items.find(item=>item.name==="Вещь для копии").note).toBe("Заметка вещи");
  await expect(page.locator(".layout-choice-trigger .has-trips")).toHaveCount(0);
});


test("GPX route: load, reject malformed replacement, persist, map dialog, discard and remove", async ({ page }) => {
  await page.route("https://api-maps.yandex.ru/**", route=>route.abort());
  await prepareIsolatedRussianGuest(page);
  await openApp(page);
  await createEmptyLayout(page, "Поездка с треком");
  await page.locator("#editLayoutBtn").click();
  await page.locator("[data-trip-add]").click();
  const input = page.locator("[data-trip-gpx-file]");
  const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><metadata><time>2026-10-02T12:00:00Z</time></metadata><trk><name>Лесной маршрут</name><trkseg><trkpt lat="55.7" lon="37.4"><time>2026-09-21T08:00:00Z</time></trkpt><trkpt lat="55.71" lon="37.42"/><trkpt lat="55.72" lon="37.41"/></trkseg><trkseg><trkpt lat="55.73" lon="37.4"/><trkpt lat="55.74" lon="37.42"/></trkseg></trk></gpx>`;
  const upload = value => input.setInputFiles({name:"route.gpx",mimeType:"application/gpx+xml",buffer:Buffer.from(value)});
  await upload(gpx);
  await expect(page.locator("[data-trip-gpx-status]")).toContainText("Лесной маршрут");
  for (const invalid of ["<gpx><trk>", '<!DOCTYPE gpx [<!ENTITY x "bad">]><gpx/>', '<gpx><trk><trkseg><trkpt lat="95" lon="37"/><trkpt lat="55" lon="38"/></trkseg></trk></gpx>', '<gpx><wpt lat="55" lon="37"/></gpx>']) {
    await upload(invalid);
    await expect(page.locator("[data-trip-gpx-status]")).toContainText("Не удалось прочитать");
  }
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeHidden();
  await page.reload(); await waitForApp(page);
  await page.locator("#layoutSelect").selectOption({label:"Поездка с треком (1 поездка)"});
  await expect(page.locator(".trip-track-name")).toHaveText("Лесной маршрут");
  await expect(page.locator(".layout-summary-map svg polyline")).toHaveCount(2);
  const saved = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("bike-packing-prototype-state-v1")).layouts).find(layout=>layout.name === "Поездка с треком").trips[0].track);
  expect(saved.startedAt).toBe("2026-09-21T08:00:00.000Z");
  await expect(page.locator('.trip-track-open time')).toHaveText("21.09.2026");
  const mapSize = await page.locator('[data-trip-track-canvas]').boundingBox();
  expect(Math.abs(mapSize.width - mapSize.height)).toBeLessThan(1);
  expect(saved.segments).toHaveLength(2);
  expect(saved.segments[0][0]).toEqual([55.7,37.4]);
  await page.locator("[data-trip-track-open]").click();
  await expect(page.locator(".trip-track-dialog")).toBeVisible();
  await expect(page.locator(".trip-track-dialog svg polyline")).toHaveCount(2);
  await page.getByRole("button",{name:"Закрыть карту",exact:true}).click();
  await expect(page.locator(".trip-track-dialog")).toHaveCount(0);
  await page.locator("#editLayoutBtn").click();
  await page.locator("[data-trip-gpx-remove]").click();
  await page.locator("#layoutEditDialog header button").click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmCancelBtn").click();
  await expect(page.locator("#layoutEditDialog")).toBeHidden();
  await expect(page.locator(".trip-track-name")).toHaveText("Лесной маршрут");
  await page.locator("#editLayoutBtn").click();
  await page.locator("[data-trip-add]").click();
  await expect(page.locator("[data-trip-gpx-status]")).toHaveText("Трек пока не добавлен");
  await page.locator("[data-layout-trips-editor] select").selectOption("0");
  await expect(page.locator("[data-trip-gpx-status]")).toContainText("Лесной маршрут");
  await page.locator("[data-trip-gpx-remove]").click();
  await page.locator("#saveEditedLayoutBtn").click();
  await expect(page.locator(".layout-summary-map")).toHaveCount(0);
});

test("compact horizontal media rows keep all photos and video navigation in their full viewers", async ({page}, testInfo) => {
  await prepareIsolatedRussianGuest(page);
  await page.route("https://www.youtube-nocookie.com/**", route=>route.fulfill({contentType:"text/html",body:"<p>Video test player</p>"}));
  await openApp(page);
  await createEmptyLayout(page,"Плитки поездки");
  const thumbnail=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement("canvas");canvas.width=240;canvas.height=240;const ctx=canvas.getContext("2d");ctx.fillStyle="#93bd9e";ctx.fillRect(0,0,240,240);return canvas.toDataURL().split(",")[1];}),"base64");
  await page.route("https://example.test/tile-*.png**", route=>route.fulfill({contentType:"image/png",headers:{"Access-Control-Allow-Origin":"http://bike-packing.localhost:4173","Access-Control-Allow-Credentials":"true"},body:thumbnail}));
  await page.route("https://i.ytimg.com/**", route=>route.fulfill({contentType:"image/png",body:thumbnail}));
  await page.evaluate(()=>{
    const key="bike-packing-prototype-state-v1", state=JSON.parse(localStorage.getItem(key));
    const layout=Object.values(state.layouts).find(record=>record.name==="Плитки поездки");
    const canvas=document.createElement("canvas"); canvas.width=240; canvas.height=240;
    const context=canvas.getContext("2d"); context.fillStyle="#93bd9e"; context.fillRect(0,0,240,240);
    const image=canvas.toDataURL();
    layout.trips=[{id:"tiles-trip",name:"Тестовая поездка",videoUrls:Array.from({length:6},(_,i)=>`https://youtu.be/abcdefghij${i}`),track:{name:"Лесной маршрут",fileName:"route.gpx",segments:[[[55.7,37.4],[55.72,37.43],[55.74,37.42]]]}}];
    layout.photos=Array.from({length:7},(_,i)=>({id:`photo-${i}`,tripId:"tiles-trip",url:`https://example.test/tile-${i}.png`,thumbUrl:`https://example.test/tile-${i}.png`,status:"synced",caption:`Фото ${i+1}`}));
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload(); await waitForApp(page);
  await page.locator("#layoutSelect").selectOption({label:"Плитки поездки (1 поездка)"});
  await expect(page.locator(".layout-summary-photos [data-photo-open]:visible")).toHaveCount(7);
  await expect(page.locator(".trip-media-more")).toHaveCount(0);
  await expect(page.locator(".layout-video-card:visible")).toHaveCount(6);
  await page.setViewportSize({width:390,height:844});
  for (const selector of [".layout-photo-summary-list", ".layout-video-summary-list"]) {
    const dimensions=await page.locator(selector).evaluate(list=>({gap:getComputedStyle(list).gap,overflow:list.scrollWidth>list.clientWidth,rows:new Set([...list.children].map(child=>Math.round(child.getBoundingClientRect().top))).size}));
    expect(dimensions).toEqual({gap:"4px",overflow:true,rows:1});
    const row = page.locator(selector).locator("..");
    const previous = row.locator('[data-trip-media-scroll="previous"]');
    const next = row.locator('[data-trip-media-scroll="next"]');
    await expect(previous).toBeVisible();
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();
    expect(await page.locator(selector).evaluate(list=>getComputedStyle(list).scrollbarWidth)).toBe("none");
    await next.click();
    await expect.poll(()=>page.locator(selector).evaluate(list=>list.scrollLeft)).toBeGreaterThan(100);
    await expect(previous).toBeEnabled();
    await previous.click();
    await expect.poll(()=>page.locator(selector).evaluate(list=>list.scrollLeft)).toBeLessThan(2);
    await page.locator(selector).evaluate(list=>{list.scrollLeft=list.scrollWidth;});
    await expect(next).toBeDisabled();
    await page.locator(selector).evaluate(list=>{list.scrollLeft=0;});
  }
  await page.setViewportSize({width:1600,height:1000});
  await expect(page.locator('.trip-media-scroll-button:visible')).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('.trip-media-scroll-button:visible')).toHaveCount(4);
  expect(await page.locator(".layout-summary-videos").evaluate(videos=>videos.getBoundingClientRect().top > document.querySelector(".layout-summary-photos").getBoundingClientRect().bottom)).toBe(true);
  await expect.poll(()=>page.locator(".layout-summary-photos img").first().evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("trip-media-rows.png")});
  await page.locator(".layout-summary-photos [data-photo-open]").nth(3).click();
  await expect(page.locator(".photo-lightbox[open]")).toBeVisible();
  await expect(page.locator("[data-photo-lightbox-dot]")).toHaveCount(7);
  await expect(page.locator('[data-photo-lightbox-dot="3"]')).toHaveAttribute("aria-current","true");
  await page.locator('[data-photo-lightbox-dot="6"]').click();
  await expect(page.locator('[data-photo-lightbox-dot="6"]')).toHaveAttribute("aria-current","true");
  await page.keyboard.press("Escape");
  await page.locator("[data-trip-video-play]").nth(3).click();
  await expect(page.locator(".trip-video-dialog")).toBeVisible();
  await expect(page.locator(".trip-video-navigation span")).toHaveText("4 / 6");
  await page.locator("[data-video-next]").click();
  await expect(page.locator(".trip-video-dialog iframe")).toHaveAttribute("src",/abcdefghij4/);
  await page.locator("[data-video-next]").click();
  await expect(page.locator("[data-video-next]")).toBeDisabled();
  await page.getByRole("button",{name:"Закрыть видео",exact:true}).click();
  await expect(page.locator(".trip-video-dialog iframe")).toHaveCount(0);
});


test("Yandex adapter fits each GPX segment, opens a large map and releases both map instances", async ({page}) => {
  const {readFile}=await import("node:fs/promises");
  const {resolve}=await import("node:path");
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await page.route("**/__testsrc/**", async route=>{
    const relative=new URL(route.request().url()).pathname.split("/__testsrc/")[1];
    if (!relative.startsWith("src/") || relative.includes("..")) return route.abort();
    const body=relative==="src/config/trip-map.js" ? 'export const YANDEX_MAPS_API_KEY="test-only-key";' : await readFile(resolve(relative),"utf8");
    await route.fulfill({contentType:"text/javascript",body});
  });
  await page.route("https://api-maps.yandex.ru/**", route=>route.fulfill({contentType:"text/javascript",body:`
    window.mapCalls=[];
    window.ymaps={ready:callback=>callback(),Polyline:class{constructor(points){this.points=points;}},Map:class{
      constructor(canvas,state){this.record={state,segments:[],destroyed:false};window.mapCalls.push(this.record);canvas.textContent="Test map";this.geoObjects={add:line=>this.record.segments.push(line.points),getBounds:()=>[[55,37],[56,38]]};this.events={add:()=>{}};}
      setBounds(bounds,options){this.record.bounds=bounds;this.record.fitOptions=options;return Promise.resolve();}
      getZoom(){return 10;} destroy(){this.record.destroyed=true;}
    }};
  `}));
  await page.evaluate(async()=>{
    const {renderTripTrackMap,bindTripTrackMap}=await import("/__testsrc/src/ui/trip-track-map.js");
    const track={name:"Test track",segments:[[[55,37],[55.1,37.1]],[[55.9,37.9],[56,38]]]};
    const host=document.createElement("div");host.id="map-fixture";host.style.width="340px";
    host.innerHTML=renderTripTrackMap(track,(en,ru)=>ru);document.body.prepend(host);
    window.mapBinding=bindTripTrackMap(host,track,(en,ru)=>ru);
  });
  await expect.poll(()=>page.evaluate(()=>window.mapCalls?.length)).toBe(1);
  expect(await page.evaluate(()=>window.mapCalls[0].segments)).toEqual([[[55,37],[55.1,37.1]],[[55.9,37.9],[56,38]]]);
  await expect(page.locator("#map-fixture [data-trip-map-status]")).toHaveText("");
  await page.locator("#map-fixture [data-trip-track-open]").click();
  await expect.poll(()=>page.evaluate(()=>window.mapCalls.length)).toBe(2);
  expect(await page.evaluate(()=>window.mapCalls[1].state.behaviors)).toContain("drag");
  expect(await page.evaluate(()=>window.mapCalls[1].state.controls)).toContain("zoomControl");
  await page.getByRole("button",{name:"Закрыть карту",exact:true}).click();
  expect(await page.evaluate(()=>window.mapCalls[1].destroyed)).toBe(true);
  await page.evaluate(()=>window.mapBinding.destroy());
  expect(await page.evaluate(()=>window.mapCalls[0].destroyed)).toBe(true);
});


test("compact photo editor supports inline captions, pointer reorder, cancellation and confirmed removal", async ({page,browserName}, testInfo) => {
  test.setTimeout(60000);
  await prepareIsolatedRussianGuest(page); await openApp(page);
  await createEmptyLayout(page,"Компактный редактор");
  const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement("canvas");c.width=160;c.height=100;c.getContext("2d").fillRect(0,0,160,100);return c.toDataURL().split(",")[1];}),"base64");
  await page.route("https://example.test/compact-*.png**",route=>route.fulfill({contentType:"image/png",headers:{"Access-Control-Allow-Origin":"http://bike-packing.localhost:4173","Access-Control-Allow-Credentials":"true"},body:png}));
  await page.evaluate(()=>{
    const key="bike-packing-prototype-state-v1",state=JSON.parse(localStorage.getItem(key));
    const layout=Object.values(state.layouts).find(layout=>layout.name==="Компактный редактор");
    layout.trips=[{id:"compact",name:"Поездка"}];
    layout.photos=Array.from({length:6},(_,i)=>({id:`compact-${i}`,tripId:"compact",url:`https://example.test/compact-${i}.png`,thumbUrl:`https://example.test/compact-${i}.png`,status:"synced",caption:`Кадр ${i+1}`}));
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();await waitForApp(page);await page.locator("#layoutSelect").selectOption({label:"Компактный редактор (1 поездка)"});await page.locator("#editLayoutBtn").click();
  const list=page.locator("[data-layout-media-list]");
  await list.locator("[data-layout-caption-edit]").first().scrollIntoViewIfNeeded();
  await expect.poll(()=>list.locator(".layout-media-preview img").first().evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
  await expect(list.locator("[data-layout-photo-caption]:visible")).toHaveCount(0);
  await list.locator("[data-layout-caption-edit]").first().click();
  await list.locator("[data-layout-photo-caption]").first().fill("Новая подпись");
  await list.locator("[data-layout-photo-caption]").first().press("Enter");
  await expect(list.locator("[data-layout-caption-edit]").first()).toHaveText("Новая подпись");
  await list.locator("[data-layout-photo-drag]").first().press("ArrowRight");
  await expect(list.locator("[data-layout-caption-edit]").nth(1)).toHaveText("Новая подпись");
  await list.locator("[data-layout-photo-drag]").first().scrollIntoViewIfNeeded();
  const from=await list.locator("[data-layout-photo-drag]").first().boundingBox();
  const to=await list.locator("[data-layout-photo-index]").nth(2).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(to.x+to.width*.8,to.y+40,{steps:12});
  await expect(list.locator(".layout-media-drop-placeholder")).toHaveCount(1);
  await page.screenshot({path:testInfo.outputPath("compact-editor-drag.png")});
  await page.mouse.up();
  await expect(list.locator("[data-layout-caption-edit]").nth(2)).toHaveText("Кадр 2");
  await expect(page.locator(".photo-lightbox[open]")).toHaveCount(0);
  // Canceling a drag restores the original order and keeps the editor open.
  const original=await list.locator("[data-layout-caption-edit]").allTextContents();
  const handle=await list.locator("[data-layout-photo-drag]").first().boundingBox();
  await page.mouse.move(handle.x+12,handle.y+12);await page.mouse.down();
  await page.mouse.move(handle.x+65,handle.y+55,{steps:5});
  await page.keyboard.press("Escape");await page.mouse.up();
  await expect(list.locator(".layout-media-drop-placeholder")).toHaveCount(0);
  await expect(list.locator("[data-layout-caption-edit]")).toHaveText(original);
  if(browserName==="chromium") {
    const client=await page.context().newCDPSession(page);
    const a=await list.locator("[data-layout-photo-drag]").first().boundingBox();
    const b=await list.locator("[data-layout-photo-index]").nth(1).boundingBox();
    await client.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:a.x+14,y:a.y+14}]});
    await client.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:b.x+b.width*.8,y:b.y+40}]});
    await expect(list.locator(".layout-media-drop-placeholder")).toHaveCount(1);
    await client.send("Input.dispatchTouchEvent",{type:"touchCancel",touchPoints:[]});
    await expect(list.locator(".layout-media-drop-placeholder")).toHaveCount(0);
    await expect(list.locator("[data-layout-caption-edit]")).toHaveText(original);
    await client.detach();
  }
  await list.locator("[data-layout-photo-remove]").last().click();
  await expect(page.locator("#confirmDialog")).toBeVisible();
  await page.locator("#confirmCancelBtn").click();
  await expect(list.locator("[data-layout-photo-index]")).toHaveCount(6);
  await list.locator("[data-layout-photo-remove]").last().click();
  await page.locator("#confirmOkBtn").click();
  await expect(list.locator("[data-layout-photo-index]")).toHaveCount(5);
  await page.screenshot({path:testInfo.outputPath("compact-editor.png")});
  await page.locator("#saveEditedLayoutBtn").click();
  await page.reload();await waitForApp(page);await page.locator("#layoutSelect").selectOption({label:"Компактный редактор (1 поездка)"});await page.locator("#editLayoutBtn").click();
  await expect(list.locator("[data-layout-caption-edit]")).toHaveText(["Новая подпись","Кадр 3","Кадр 2","Кадр 4","Кадр 5"]);
});
