import { expect, test } from "@playwright/test";
import { prepareIsolatedRussianGuest, openApp, createEmptyLayout, waitForApp } from "./guest-test-helpers.js";

test("layout photos: captions, reorder, fullscreen, persistence, discard and video validation", async ({ page, browserName }) => {
  test.setTimeout(60000);
  const navigatePhoto = async (direction) => {
    if (browserName !== 'webkit') return page.locator(direction > 0 ? '.photo-lightbox-next' : '.photo-lightbox-prev').click();
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
    await page.locator('#layoutSelect').selectOption({label:'Фото поездки'});
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
  await page.locator("#layoutSelect").selectOption({ label: "Фото поездки" });
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
  await expect(page.locator('#layoutIntroductionTitle')).toHaveText('Об укладке');
  await expect(description).toContainText('Заметки сохраняются');
  expect(await description.evaluate(el => el.previousElementSibling.id)).toBe('layoutPhotoSummary');
  await page.evaluate(() => {
    localStorage.setItem('bike-packing-layout-photo-view-v1','hidden');
    localStorage.setItem('bike-packing-layout-description-position-v1','above');
  });
  await page.reload(); await waitForApp(page);
  await page.locator('#layoutSelect').selectOption({label:'Фото поездки'});
  await expect(summary).toHaveAttribute('data-photo-view','grid');
  await expect(summary).toBeVisible();
  expect(await description.evaluate(el => el.previousElementSibling.id)).toBe('layoutPhotoSummary');
  await createEmptyLayout(page,'Без фотографий');
  await expect(summary).toBeHidden();
  await page.locator('#layoutSelect').selectOption({label:'Фото поездки'});
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
    root.innerHTML='<div data-options></div><div data-intro><section class="layout-photo-summary" data-photos></section><section id="layoutDescriptionSummary">Описание поездки</section></div>';
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
  for (const variant of ['strip','hero','grid']) {
    await root.locator(`[data-layout-photo-view="${variant}"]`).click();
    await expect(photos).toHaveAttribute('data-photo-view',variant);
  }
  const list=photos.locator('.layout-photo-summary-list');
  expect(await list.evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  expect(await list.evaluate(el=>{el.scrollLeft=el.scrollWidth;return el.scrollLeft>0;})).toBe(true);
  expect(await photos.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await root.locator('[data-layout-description-position="above"]').click();
  expect(await root.locator('[data-intro]').evaluate(el=>el.firstElementChild.id)).toBe('layoutDescriptionSummary');
  await root.locator('[data-layout-photo-view="hidden"]').click();
  await expect(photos).toBeHidden();
  await expect(root.locator('#layoutDescriptionSummary')).toBeVisible();
  await page.evaluate(()=>window.introFixture.guest());
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
