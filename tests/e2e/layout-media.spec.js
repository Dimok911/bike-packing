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
    await page.route('https://example.com/layout-test-*.png', route=>route.fulfill({contentType:'image/png',headers:{'Access-Control-Allow-Origin':'*'},body:png}));
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
  // The view switcher is admin-only; exercise its existing controls in this isolated guest fixture.
  await page.locator('#packingVisualStyleControl').evaluate(el=>el.classList.add('is-visible'));
  for (const variant of ['strip','hero','grid']) {
    await page.locator(`[data-layout-photo-view="${variant}"]`).click();
    await expect(summary).toHaveAttribute('data-photo-view',variant);
    await page.setViewportSize({width:390,height:844});
    expect(await summary.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await summary.screenshot({path:`test-results/v1613-photo-view-${variant}.png`});
  }
  await page.reload(); await waitForApp(page);
  await page.locator('#layoutSelect').selectOption({label:'Фото поездки'});
  await expect(summary).toHaveAttribute('data-photo-view','grid');
  await page.locator('[data-layout-photo-view="hidden"]').evaluate(el=>el.click());
  await expect(summary).toBeHidden();
  await page.locator('[data-layout-photo-view="strip"]').evaluate(el=>el.click());
  await expect(summary).toBeVisible();
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
