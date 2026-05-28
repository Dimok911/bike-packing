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
  const limitText = Number.isFinite(photoLimit) ? String(photoLimit) : (en ? "unlimited" : "без ограничений");
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
      <h3>Online and offline</h3>
      <p>Online mode checks the server, saves local changes to your account, downloads updates from other devices, and uploads pending photos.</p>
      <p>Work offline keeps the current local copy open. Changes stay on this device and sync later after you go online and the account is confirmed.</p>
      <p>If the server is unavailable, the app shows the cached/local layout when it can. Manual offline mode does not replace sign-in: sync and admin actions wait for a real server session.</p>
    </section>
    <section class="help-limits-section">
      <h3>Photo Viewer</h3>
      <p>Swipe to switch photos. On desktop, dots below the photo show the current slide. Click a photo to open it fullscreen; drag to pan, use the mouse wheel or pinch to zoom, and click the photo again to close.</p>
    </section>
  ` : `
    <section class="help-limits-section">
      <h3>Фото</h3>
      <p>${isAdmin ? "Можно добавить до 50 фото на одну вещь или сумку." : "Можно добавить до 3 фото на одну вещь или сумку."}</p>
      <p>Текущий лимит: ${limitText} фото.</p>
    </section>
    <section class="help-limits-section">
      <h3>Каталог</h3>
      ${isAdmin ? `
        <p>Для вашего каталога лимиты не ограничены.</p>
      ` : `
        <ul>
          <li>Вещи: до 500 шт.</li>
          <li>Сумки и места хранения: до 50 шт.</li>
          <li>Категории: до 50 шт.</li>
          <li>Места хранения: до 10 шт.</li>
        </ul>
      `}
    </section>
    <section class="help-limits-section">
      <h3>Онлайн и офлайн</h3>
      <p>В онлайн-режиме приложение проверяет сервер, сохраняет локальные изменения в аккаунт, загружает правки с других устройств и отправляет ожидающие фото.</p>
      <p>Режим «Работать офлайн» оставляет открытой текущую локальную копию. Изменения сохраняются на этом устройстве и синхронизируются позже, когда вы вернётесь онлайн и аккаунт подтвердится сервером.</p>
      <p>Если сервер недоступен, приложение показывает кэшированную или локальную укладку, когда это возможно. Ручной офлайн не заменяет вход: синхронизация и админ-действия ждут настоящую серверную сессию.</p>
    </section>
    <section class="help-limits-section">
      <h3>Просмотр фото</h3>
      <p>Фото можно листать свайпом. На десктопе точки под фото показывают текущий слайд. Клик по фото открывает полноэкранный просмотр; фото можно двигать, масштаб менять колесом мыши или pinch-жестом, следующий клик по фото закрывает просмотр.</p>
    </section>
  `;
  openModalDialog(dialog);
}
