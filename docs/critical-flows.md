# Критические сценарии

Эти сценарии считаются контрактами приложения. Если правка затрагивает маркер
`CRITICAL:` или один из связанных файлов, нужно запускать `npm.cmd run
test:critical` дополнительно к `npm.cmd run check`.

## CRITICAL: offline-start

- Кэшированный app shell должен открываться без интернета на iOS/PWA.
- `sw.js` в онлайне должен обновлять navigation HTML из сети, а в офлайне
  возвращать кэшированный `index.html`.
- Обновление service worker должно активировать waiting worker через
  `SKIP_WAITING`, иначе iOS может продолжать держать старый offline-cache.
- Версии браузерных ассетов должны обновляться синхронно:
  - `src/config/constants.js` -> `APP_VERSION`
  - `index.html` -> `styles.css?v=...` и `app.js?v=...`
  - `sw.js` -> `CACHE_NAME` и `ASSETS`

## CRITICAL: offline-auth-scope

- Если пользователь явно не вышел из аккаунта, offline-start должен открыть тот
  же локальный приватный storage scope, который использовался онлайн.
- Приоритет поиска remembered scope:
  - точный сохраненный auth storage scope
  - прямой `id:<user-id>` / `email:<email>` scope
  - legacy scope, совпавший по `syncMeta.accountEmail`
  - единственный приватный scope на устройстве, если он ровно один
- Явный sign-out должен отключать приватный offline-доступ.
- Подтверждённая сервером authorization сохраняется только вместе с точным
  приватным storage scope. В remembered admin-сессии она может открыть
  закэшированный каталог шаблонов только для чтения, но не может разрешить
  публикацию, удаление или любое другое изменение без живой `/auth/me`-сессии.
- Если публичный шаблон уже присутствует в локальном кэше, guest, user и admin
  могут открыть его офлайн только для чтения. Офлайн-блокировка сетевых и
  изменяющих операций не должна блокировать сам переход в закэшированный шаблон.
- Каталог и payload публичных demo/shared-шаблонов хранятся в общем read-only
  offline-кэше, независимом от приватных storage scope гостя, пользователя и
  админа. Личные укладки и локальные admin-draft в этот кэш не попадают.

## CRITICAL: guest-magic-link-import

- Magic-link сохраняет оба совместимых пути: обычный GET-переход из письма и
  POST-подтверждение вставленной ссылки/одноразового кода в уже открытой форме.
  POST должен установить ту же HttpOnly session cookie, не возвращая её token в
  JSON, после чего применяется обычный guest-login import и auth-scope flow.

- Pending email от запроса magic-link не подтверждает сессию и не разрешает
  переключение из `guest` в пустой `email:*` storage scope. Приватный scope
  активируется только после успешного `/auth/me`.
- После полной перезагрузки страницы оперативный guest-кандидат может
  отсутствовать. После загрузки серверного профиля импорт обязан повторно
  прочитать изменённую локальную demo-копию из сохранённого `guest` scope.
- Существующий серверный профиль и совпадающее имя укладки не блокируют импорт:
  гостевая укладка добавляется отдельной записью с уникальным именем вместе с
  сумками, вещами, размещением и справочниками.
- Контракт одинаков для обычных и admin-аккаунтов. Guest storage очищается
  только после сохранения и повторного чтения импортированной укладки с сервера.
- Recovery snapshots не участвуют в автоматическом входе или импорте и не могут
  использоваться как источник отсутствующего guest-кандидата.

## CRITICAL: offline-photos

- Явный дубль вещи или сумки должен получать собственные ID фотографий, записи в базе, оригиналы файлов и миниатюры. Удаление фото у одной из копий не должно ломать другую. Общая ссылка на фото допустима только тогда, когда одна и та же каталожная вещь или сумка добавляется в другую личную укладку без создания дубля.

- В офлайне или forced-offline фото с локальным `id/localId` должны
  предпочитать IndexedDB object URL вместо удаленного `thumbUrl/url`.
- Remote-only фото могут появиться офлайн только если уже есть в браузерном
  кэше или были скопированы в IndexedDB.
- При размещении существующей вещи/сумки в другой пользовательской укладке фото
  не копируются физически: целевая укладка получает ссылку на тот же `id` из
  общего каталога, а фото остаются ссылками на те же файлы в том же приватном
  list. Если пользователь явно создает дубль специальной кнопкой на карточке,
  тогда появляется новая запись каталога.
- Вложенный пакет/список внутри сумки является layout-scoped структурой. При
  переносе в другую пользовательскую укладку он получает новую вложенную
  структуру в целевой укладке, но remote-фото в том же приватном namespace
  остаются `synced` ссылками на существующие `url/thumbUrl`; `_copyToCurrentList`
  для них ставить нельзя.
- Физическое копирование фото и маркер `_copyToCurrentList` допустимы только
  при пересечении границы шаблона: пользовательская укладка -> шаблон,
  шаблон -> пользовательская укладка или шаблон -> другой шаблон. Подробный
  контракт лежит в `docs/copy-mechanics.md`.

## CRITICAL: touch-click-timing

- Touch/click/drag задержки хрупкие на iPhone и подбирались вручную.
- Не менять timeout-константы и literal delays вокруг tap, double-click,
  hold-to-drag, открытия/закрытия вложенных контейнеров, drag start или touch
  cancel без точной причины регрессии.
- Чувствительные значения:
  - `TOUCH_DRAG_DELAY_MS`
  - `TOUCH_DRAG_CANCEL_DISTANCE`
  - `TOUCH_SCROLL_CANCEL_DISTANCE`
  - `NESTED_GROUP_HOVER_DELAY_MS`
  - `180ms` single-click delay для desktop double-click редактирования
    заголовка вложенной сумки
- Если мобильный tap ощущается поздним, сначала делать ветвление по input type
  (`touch/coarse pointer`), а не менять общий desktop timing.
- После правок в этой зоне проверить минимум: tap по заголовку вложенной сумки,
  tap по стрелке вложенной сумки, double-click/desktop rename, hold-to-drag,
  scroll cancel на iPhone.

## CRITICAL: sync-save

- Локальные изменения, сделанные офлайн, должны оставаться dirty и не должны
  перетираться remote state до проверки auth и server freshness.
- Подозрительно пустые локальные состояния нельзя загружать поверх осмысленных
  серверных данных.
- Background freshness polling не должен забирать полный payload списка. Сначала
  использовать легкий metadata endpoint, а `/state` грузить только после
  изменения `updatedAt`/`stateRevision` или если легкая проверка недоступна.
- Прямые remote save должны выполняться последовательно. Параллельные сохранения
  одного list легко дают ложный `/items/sync 409`, когда второй запрос уходит со
  старым `baseStateRevision`.
- `forceOverwrite` не должен отправлять entity-sync. Это полный save поверх
  сервера после уже принятого решения о конфликте.

## CRITICAL: template-copy-delete

- Shared/demo copy и delete flows затрагивают frontend и `bikepacking-api`.
- Если меняется API-поведение, одновременно поднимать backend compatibility и
  frontend required version/capabilities.
- Модель данных каталога единая для всех пользовательских укладок:
  - `state.items` - общий каталог вещей пользователя.
  - `state.containers` - общий каталог сумок, мест и групп.
  - категории, места хранения и настройки - общие справочники, а не копии на
    каждую укладку.
- Пользовательские укладки одного пользователя находятся в одном приватном
  namespace: общий каталог, общие справочники и общий набор файлов фото.
- Каждый отдельный шаблон, включая RU/EN варианты, находится в собственном
  template namespace. У него свой каталог вещей, каталог сумок, справочники
  категорий/мест, placement/arrangement и свои файлы фото.
- Локальный админский draft технически может находиться в одном browser state с
  приватными данными, но записи его каталога обязаны иметь ownership
  `publicCatalogLayoutId`. Это локальное представление отдельного namespace, а
  не разрешение связывать template-запись с приватной укладкой по тому же `id`.
- UI-предпочтения устройства (`itemDisplayMode`, `showItemMeta`, сворачивание,
  фильтры, visual style) не являются настройками каталога/namespace и не должны
  переноситься вместе с шаблоном. Настройки предметной области шаблона — его
  категории, места и layout-поля — входят в template namespace.
- Укладка хранит только сценарий размещения:
  - `state.layouts[layoutId].arrangement.rootContainerIds`
  - `state.layouts[layoutId].arrangement.containers`
  - `state.layouts[layoutId].arrangement.items`
  - `state.layouts[layoutId].arrangement.packedItems`
- Одна и та же вещь или сумка может легально участвовать в нескольких укладках
  под тем же `id`, если эти укладки находятся в одном namespace. Это не
  linked-delete bug, а нормальная ссылка на общий каталог.
- Копирование через границу namespace, например пользовательская укладка ->
  шаблон, шаблон -> пользовательская укладка или RU-шаблон -> EN-шаблон,
  должно создавать записи в целевом namespace и отдельно обрабатывать фото.
- Link-by-ID допустим только между пользовательскими укладками одного private
  namespace. Если хотя бы одна сторона является demo/shared template, нужна
  изолированная запись целевого namespace, даже если локальный admin draft
  временно лежит в том же `state.items/state.containers`.
- Кнопка копирования/переноса в другую пользовательскую укладку не создает
  дубль каталожной записи. Она добавляет в целевую укладку ссылку на тот же
  `id` вещи или сумки.
- Дубль вещи/сумки, который должен появиться во вкладках "Вещи" или "Сумки",
  создается только специальной кнопкой дублирования на карточке. Такое действие
  намеренно создает новую запись в `state.items` или `state.containers`.
- Нельзя автоматически клонировать вещи/сумки только потому, что они встречаются
  в нескольких укладках. Автоматическое клонирование раздувает вкладки "Вещи" и
  "Сумки", ломает смысл общего каталога и резко замедляет рендер.
- Удаление пользовательской укладки или удаление элемента из конкретной
  пользовательской укладки должно удалять только запись укладки и/или
  layout-only placement/arrangement. Это снятие ссылки с укладки, а не
  физическое удаление вещи или сумки из общего каталога.
- В пользовательском namespace физически удалять запись из `state.items` или
  `state.containers` можно только по явному действию пользователя "Удалить
  навсегда". Отсутствие ссылок из укладок само по себе не является разрешением
  на автоматическое удаление каталожной записи.
- Удаление целого template namespace, например опубликованного RU/EN шаблона или
  его disposable draft, может удалить принадлежащие только этому namespace
  записи каталога и фото. Это не то же самое, что убрать вещь/сумку из одной
  пользовательской укладки.
- Вкладки "Вещи", "Сумки" и "Настройки" не должны показывать отдельную копию
  одной и той же реальной вещи/сумки для каждой укладки. Пользовательские
  осознанные дубли допустимы, но технические `*-isolated-*` копии от старого
  ремонта должны схлопываться обратно в исходные `id`, если исходная запись
  существует.
# Recovery snapshots

- Recovery snapshots are diagnostic/safety copies only. Application startup and authentication must never merge or replace working state from them automatically.
- An old recovery snapshot may contain intentionally deleted layouts, templates, bags, or items, so absence from current state is not evidence of accidental data loss.
- Restoring any recovery/history/backup payload must require an explicit user action. Normal server-state replacement may preserve managed public drafts from the current working state, but must not resurrect them from an older recovery snapshot.
- Canonical history stores the state left behind by a successful change; it must not add the new current state as a restorable no-op snapshot. Legacy records equal to the current state are not restore targets.
- Restoring a demo/shared history snapshot must replace the matching active admin draft and its public payload cache immediately, without requiring a page reload.
- History details form an action chain: each stored pre-action snapshot is compared forward with the current state or the immediately newer snapshot. The displayed added/removed/changed rows describe what that one action originally did, not the inverse restore effect.
- Opening the history timeline must fetch lightweight summary pages only (25 records per stream by default), without snapshot payloads. More summaries are loaded lazily. A full snapshot and its immediately newer comparison payload are fetched only for the selected Details view or for a demo/shared undo; private undo restores by history id on the server and must not download the snapshot first.
- Demo, shared-template, and private history use the same undo-action language. Undoing a deep action restores its full snapshot and must explicitly warn that all later actions shown above in the same history stream will also be undone. Only the latest safe single-layout action may use layout-scoped restore.
- The undo journal keeps the newest 100 grouped user actions regardless of their age. Older depth is represented by one final daily checkpoint for each of the previous 30 days; a daily checkpoint is hidden while detailed actions for that day are still present.
- Changes limited to service metadata such as timestamps, device ids, payload hashes, or state revisions are not user actions: they must neither consume the 100-action buffer nor appear as empty restore points.
- Changes limited to template/copy provenance markers are also technical metadata: they must not create a user action or appear as raw internal field names in history details.
- A history record may be restored independently only when its trusted metadata marks exactly one affected layout and no shared item/container data changed. Global and multi-layout records must restore the full canonical state.
- Deleting a photo is a 30-day soft delete. Historical asset URLs remain readable during retention, and restoring a snapshot that references the photo must clear its trash marker in the same transaction.
