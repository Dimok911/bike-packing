export function openHelpLimitsDialogUi({
  closeText,
  dialog,
  isAdmin,
  language,
  openModalDialog,
  photoLimit,
  title,
  content
} = {}) {
  const en = language === "en";
  const limitText = Number.isFinite(photoLimit) ? String(photoLimit) : (en ? "unlimited" : "Р±РµР· РѕРіСЂР°РЅРёС‡РµРЅРёР№");
  dialog?.querySelector("h2")?.replaceChildren(document.createTextNode(title));
  dialog?.querySelector("footer button")?.replaceChildren(document.createTextNode(closeText));
  content.innerHTML = en ? `
    <section class="help-limits-section">
      <h3>Photos</h3>
      <p>${isAdmin ? "You can add up to 50 photos to one item or bag." : "You can add up to 3 photos to one item or bag."}</p>
      <p>Current limit: ${limitText} photos.</p>
    </section>
    <section class="help-limits-section">
      <h3>Catalog</h3>
      ${isAdmin ? `
        <p>Your catalog limits are unlimited.</p>
      ` : `
        <ul>
          <li>Items: up to 500.</li>
          <li>Bags and storage places: up to 50.</li>
          <li>Categories: up to 50.</li>
          <li>Storage places: up to 10.</li>
        </ul>
      `}
    </section>
    <section class="help-limits-section">
      <h3>Photo Viewer</h3>
      <p>Swipe to switch photos. On desktop, dots below the photo show the current slide. Click a photo to open it fullscreen; drag to pan, use the mouse wheel or pinch to zoom, and click the photo again to close.</p>
    </section>
  ` : `
    <section class="help-limits-section">
      <h3>Р¤РѕС‚Рѕ</h3>
      <p>${isAdmin ? "РњРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ РґРѕ 50 С„РѕС‚Рѕ РЅР° РѕРґРЅСѓ РІРµС‰СЊ РёР»Рё СЃСѓРјРєСѓ." : "РњРѕР¶РЅРѕ РґРѕР±Р°РІРёС‚СЊ РґРѕ 3 С„РѕС‚Рѕ РЅР° РѕРґРЅСѓ РІРµС‰СЊ РёР»Рё СЃСѓРјРєСѓ."}</p>
      <p>РўРµРєСѓС‰РёР№ Р»РёРјРёС‚: ${limitText} С„РѕС‚Рѕ.</p>
    </section>
    <section class="help-limits-section">
      <h3>РљР°С‚Р°Р»РѕРі</h3>
      ${isAdmin ? `
        <p>Р”Р»СЏ РІР°С€РµРіРѕ РєР°С‚Р°Р»РѕРіР° Р»РёРјРёС‚С‹ РЅРµ РѕРіСЂР°РЅРёС‡РµРЅС‹.</p>
      ` : `
        <ul>
          <li>Р’РµС‰Рё: РґРѕ 500 С€С‚.</li>
          <li>РЎСѓРјРєРё Рё РјРµСЃС‚Р° С…СЂР°РЅРµРЅРёСЏ: РґРѕ 50 С€С‚.</li>
          <li>РљР°С‚РµРіРѕСЂРёРё: РґРѕ 50 С€С‚.</li>
          <li>РњРµСЃС‚Р° С…СЂР°РЅРµРЅРёСЏ: РґРѕ 10 С€С‚.</li>
        </ul>
      `}
    </section>
    <section class="help-limits-section">
      <h3>РџСЂРѕСЃРјРѕС‚СЂ С„РѕС‚Рѕ</h3>
      <p>Р¤РѕС‚Рѕ РјРѕР¶РЅРѕ Р»РёСЃС‚Р°С‚СЊ СЃРІР°Р№РїРѕРј. РќР° РґРµСЃРєС‚РѕРїРµ С‚РѕС‡РєРё РїРѕРґ С„РѕС‚Рѕ РїРѕРєР°Р·С‹РІР°СЋС‚ С‚РµРєСѓС‰РёР№ СЃР»Р°Р№Рґ. РљР»РёРє РїРѕ С„РѕС‚Рѕ РѕС‚РєСЂС‹РІР°РµС‚ РїРѕР»РЅРѕСЌРєСЂР°РЅРЅС‹Р№ РїСЂРѕСЃРјРѕС‚СЂ; С„РѕС‚Рѕ РјРѕР¶РЅРѕ РґРІРёРіР°С‚СЊ, РјР°СЃС€С‚Р°Р± РјРµРЅСЏС‚СЊ РєРѕР»РµСЃРѕРј РјС‹С€Рё РёР»Рё pinch-Р¶РµСЃС‚РѕРј, СЃР»РµРґСѓСЋС‰РёР№ РєР»РёРє РїРѕ С„РѕС‚Рѕ Р·Р°РєСЂС‹РІР°РµС‚ РїСЂРѕСЃРјРѕС‚СЂ.</p>
    </section>
  `;
  openModalDialog(dialog);
}
