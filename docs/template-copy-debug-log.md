# Журнал отладки копирования сумок между шаблонами

## Симптомы

1. При копировании сумки с вещами из одного шаблона в другой сумка появляется, но после перехода по другим укладкам и возврата в целевой шаблон внутри остается только сумка. Вещи снова появляются после полного обновления страницы.

2. При повторном копировании той же сумки с вещами из шаблона в шаблон не находится дубликат. При этом похожие сценарии обычная укладка -> обычная укладка и шаблон -> обычная укладка дубликаты находят.

## Текущий статус

- Глюк 2 подтвержденно устранен: при повторной попытке копирования из шаблона в шаблон дубликаты вещей отображаются.
- Глюк 1 подтвержденно устранен: после переходов между укладками/шаблонами вещи в скопированной сумке остаются видимыми без refresh.
- Новый найденный регресс v607: кнопка "Скопировать" в админском редактировании шаблона создавала обычную пустую укладку вместо шаблона с тем же наполнением.
- Исправление v608: копирование шаблона в админке идет отдельным путем, создает новый public-draft шаблона и клонирует корневые сумки/вещи в новые записи. Пользовательские сценарии копирования шаблонов в личные укладки не менялись.
- Уточнение v609: копия шаблона должна получать новый public id и отдельный пункт `template-draft:*` в админском селекте. Иначе копия схлопывается под исходным `shared:*`/`demo:*` и визуально "не появляется".
- Уточнение v610: у legacy-копий из старого flow селект мог показывать имя исходного shared-шаблона, пока окно редактирования показывало имя локального draft. Для активного admin-draft подпись селекта теперь берется из локальной редактируемой записи.
- Уточнение v611: для обычных admin shared draft язык в селекте берется от исходного shared-шаблона, а не от локального draft/UI-языка. Это убирает прыжки RU/EN и дубль двух строк как RU при переключении.
- Уточнение v612: правила admin-template identity вынесены в `src/state/layout-manage.js`: `template-draft:*`, выбор public value, язык shared draft и сохранение имени. Ручное переименование admin-шаблона сохраняет введенное имя без принудительного суффикса `2`.
- Уточнение v613: при смене языка в не-админском public-view выбранный shared-шаблон заменяется на шаблон той же семьи в новом языке. Админский режим правки этим правилом не затрагивается.
- Уточнение v614: для новой копии shared-шаблона публикация сначала создает state-запись на API, потом копирует/загружает фото в уже существующий public target, затем публикует state повторно с независимыми photo URLs.
- Уточнение v615: priming state для новой копии shared-шаблона отправляется без photo references. После создания target используется API-механизм `/photos/copy`, а финальный state публикуется уже с независимыми URL фото.
- Уточнение v616: для admin public uploads выбор photo-copy endpoint вынесен в `src/sync/photos.js`; shared/demo шаблоны используют `/admin/.../photos/copy`, обычные списки продолжают использовать `/lists/.../photos/copy`.
- Уточнение v617: новые admin shared-шаблоны теперь добавляются в публичный индекс `sharedLayoutsIndex`, который сохраняется внутри публично читаемого demo-state payload. Безлогиновые и обычные пользовательские сессии загружают этот индекс при старте и получают не только название шаблона, но и его published payload, поэтому новый шаблон может отображаться без локальной runtime-памяти админской вкладки.
- Уточнение v618: `adminTemplateCopy` больше не считается одноразовым materialized shared draft. Такие копии сохраняются как локальный admin public слой при `replaceState()` после загрузки личного state и не удаляются startup-чисткой `removePublicLayoutDrafts()`. Это защищает скопированный, но еще не переоткрытый из публичного индекса шаблон от исчезновения из селекта.
- Уточнение v619: добавлено мягкое восстановление `adminTemplateCopy` из локальных recovery-снимков перед загрузкой личного state. Если копия шаблона уже успела исчезнуть из-за старой чистки/replaceState, админская сессия может поднять ее из последнего `before-replace` snapshot и снова показать в селекте.
- Уточнение v620: API не имеет `/admin/.../photos/copy` для demo/shared templates, только multipart `/admin/.../photos`. Для admin public uploads server-side copy отключен, фото копируем как независимые файлы через скачивание существующего remote photo blob и повторную загрузку multipart. Новые `adminTemplateCopy` дополнительно помечают фото как требующие копирования в свой public target.
- Уточнение v621: начата унификация удаления. Базовая операция удаления дерева укладки вынесена в `src/state/layout-delete.js`, операции удаления published shared template и public-index записи вынесены в `src/public/shared-layout-admin.js`; удаление admin-копии shared-шаблона теперь отдельно убирает локальную редактируемую вкладку, runtime shared template и запись из публичного индекса шаблонов. Важно: после удаления такой копии нельзя автоматически переключаться обратно на тот же `shared:<id>`, иначе визуально кажется, что удаление не сработало.
- API-проверка v621: `DELETE /bike-packing/admin/shared-layouts/:id/state` возвращает `405 Method Not Allowed`, `DELETE /bike-packing/admin/shared-layouts/:id` возвращает `404`. Поэтому фронт не должен дергать DELETE для шаблонов: это дает красные ошибки в консоли и не удаляет запись. Рабочее удаление на текущем API — снять шаблон с публичного индекса и убрать из runtime списка.
- Уточнение v622: после обновления `bikepacking-api` фронт снова подключен к реальным admin endpoints: удаление shared-шаблона вызывает `DELETE /bike-packing/admin/shared-layouts/:id`, а копирование фото для admin demo/shared targets снова использует `/photos/copy`.
- Уточнение v623: при копировании whole template в админке нашли две новые проблемы: после refresh/переходов в селекте появлялись две строки с одинаковым названием, а фото в опубликованной копии оставались пустыми. Попробовали:
  - скрывать локальный `adminTemplateCopy` из селекта, если для его `adminSharedSourceId` уже есть runtime/published `shared:*`;
  - считать фото "лежащим в целевом list" только по URL `/lists/<target>/...`, а не только по совпавшему `photo.listId`;
  - для admin `/photos/copy` синтезировать target URL `/bike-packing/lists/<target>/photos/<photoId>/file|thumb`, если API вернул короткий ответ без `url/thumbUrl`.
  Риск: преждевременное переключение активной копии с локального `template-draft:*` на `shared:*` может открыть пустой/не загруженный published payload, если API/index не успел ответить.
- Уточнение v624: при удалении старых битых shared-копий API отдавал `400 Bad Request` на сохранении demo-state индекса: `Public bike-packing payload references photos that were not uploaded to this public list`. Причина: `sharedLayoutsIndex` внутри demo-state содержал полные `statePayload` shared-шаблонов с photo URL их собственных public-list. Попробовали очистку `photos` только в payload, который кладется в `sharedLayoutsIndex`; настоящий shared endpoint при этом должен оставаться источником полного шаблона с фото.
- Новый регресс после v623/v624: при копировании шаблона новая укладка сначала появляется, фото пустые и статус пишет про копирование картинок, затем шаблон становится пустым. В консоли видны `ERR_CONNECTION_TIMED_OUT` на `GET /bike-packing/lists/public-demo-state/state` и `public-demo-state-en/state`. В шапке скриншота клиент всё еще показывает `v622`, то есть проверка могла идти на старом service worker/bundle; но сам сценарий также указывает на архитектурный риск: нельзя подменять локальный редактируемый draft опубликованным `shared:*`, пока published state не подтвержден и не загружен.
- Уточнение v625: удаление полусозданных/битых shared-копий падало на `DELETE /bike-packing/admin/shared-layouts/:id` с `404 Public bike-packing list has not been created yet`. Для удаления такой ответ должен считаться idempotent-success: серверной public-list записи уже нет или она не успела создаться, но фронт все равно обязан убрать локальный draft, runtime shared entry и запись из публичного индекса. Клиент теперь глотает только этот узкий класс `404 already absent`, остальные ошибки удаления остаются ошибками.
- Важно не пытаться снова чинить оба поведения одним широким патчем. Раньше несколько итераций шли по кругу: исправлялся один глюк, но появлялся или возвращался другой.
- Дальше любые изменения должны сохранять уже подтвержденное поведение по дубликатам. После каждого изменения проверять повторное копирование шаблон -> шаблон как регрессионный тест.

## Рабочее понимание

- Данные, скорее всего, сохраняются в published payload, потому что после refresh вещи появляются.
- Проблема похожа на рассинхрон между live-состоянием `state.containers/state.items` и сохраненным `layout.arrangement`.
- Для шаблонов есть особый admin/public путь: материализованные шаблоны используют `admin-demo-*`, `admin-shared-*`, `publicCatalogLayoutId`, `sharedSourceId` и `_publicCopySourceId`.
- При переключении укладок `applyLayoutArrangement` очищает live-связи и восстанавливает их из `layout.arrangement`. Если arrangement неполный или перезаписан неполным снимком, вещи визуально пропадают до refresh.
- Для whole-template copy теперь есть еще одна зона риска: локальный `adminTemplateCopy` является рабочей редактируемой правдой до тех пор, пока published shared state не сохранен и не прочитан обратно. Если UI/restore/select начинает считать опубликованный `shared:*` более авторитетным слишком рано, при сетевом timeout или урезанном `sharedLayoutsIndex` можно получить пустой экран, хотя локальный draft еще содержит дерево.
- API delete для shared-template должен быть идемпотентным. Идеальный контракт: `DELETE /admin/shared-layouts/:id` удаляет/помечает удаленными public-list, фото и index entry в одной серверной операции и возвращает success даже если часть записей уже отсутствует. Текущий клиентский fallback нужен только для полусозданных записей.

## Уже испытано

### 1. Явная запись дерева в arrangement после копирования

Файлы:
- `app.js`

Что сделали:
- Подключили `writeContainerTreeToLayoutArrangement`.
- После `linkExistingContainerTreeToLayout` и `duplicateContainerSnapshotToLayout` стали явно вызывать:
  - `writeContainerTreeToLayoutArrangement(state, targetLayoutId, rootId)`
  - `normalizeLayoutArrangement(targetLayout, state)`

Ожидание:
- Целевая укладка сразу получит arrangement с контейнерами и вещами.

Результат:
- По проверке пользователя оба глюка остались.

Вывод:
- Простая дозапись arrangement в конце старого flow недостаточна. Вероятно, старый flow затем переснимает/перезаписывает arrangement через временное переключение активной укладки.

### 2. Нормализация source id для `admin-demo-*`

Файлы:
- `src/public/copy-duplicates.js`

Что сделали:
- В `sourceIdVariants` добавили снятие временных префиксов:
  - `admin-demo-container-\d+-`
  - `admin-demo-item-\d+-`

Ожидание:
- Повторное копирование из demo-шаблона должно узнавать тот же исходный контейнер/вещь несмотря на новый stamp.

Результат:
- После следующих изменений по чтению duplicate summary из `targetLayout.arrangement` поведение подтверждено пользователем: дубликаты вещей при повторном копировании из шаблона в шаблон отображаются.

Вывод:
- Проблема была не только в сравнении `admin-demo-*` id. Важной частью оказалось то, откуда duplicate summary читает целевую укладку: прямое чтение `targetLayout.arrangement` оказалось надежнее временного применения layout через `withLayoutArrangementApplied`.

## Текущая гипотеза

Главная ненадежность в том, что копирование дерева выполняется внутри `withLayoutArrangementApplied(targetLayoutId, ...)`.

Этот helper:
1. Сохраняет текущую активную укладку.
2. Временно делает активной целевую.
3. Вызывает `applyLayoutArrangement(targetLayoutId)`.
4. Выполняет копирование.
5. В `finally` вызывает `captureActiveLayoutArrangement()`.
6. Возвращает старую активную укладку и снова вызывает `applyLayoutArrangement`.

Для обычных укладок это может работать, но для шаблон -> шаблон такой flow слишком хрупкий: копирование, проверка дубликатов и сохранение public draft зависят от того, какой layout в этот момент активен и какой live-state успел быть очищен/восстановлен.

Дополнительная найденная причина для глюка 1:

- `repairAdminDemoLayout` при повторном открытии уже материализованного demo-шаблона пересобирал `layout.arrangement` через `createLayoutArrangementFromCurrentState(state, rootContainerIds)`.
- Если перед этим пользователь был в другой укладке/шаблоне, live-поля `container.itemIds`, `container.childIds`, `item.containerId` уже могли быть очищены и применены под другую укладку.
- В таком состоянии repair мог записать поверх правильного arrangement неполную версию: контейнеры/сумки есть, а вещи внутри не попали.
- Аналогичный риск был в sync/merge коде shared-шаблонов, где arrangement тоже пересобирался из live-state для неактивного public draft.

## Направление надежного решения

Сделать копирование дерева layout-native:

- Не переключать активную укладку ради копирования в целевой layout.
- Сначала построить snapshot источника.
- Создать новые `containers/items`.
- Одновременно напрямую записать в `targetLayout.arrangement`:
  - placement каждого нового контейнера,
  - `arrangement.items[itemId] = containerId` для каждой вещи,
  - вставку корня в `arrangement.rootContainerIds` или в placement родителя.
- Только если целевая укладка уже активна, вызвать `applyLayoutArrangement(targetLayoutId)`.
- Проверку дубликатов тоже читать напрямую из `targetLayout.arrangement`, без временного `withLayoutArrangementApplied`.

## Изменения в работе сейчас

Сделано в текущем подходе:

- `publicCopyDuplicateSummaryForSnapshot` переведен на прямое чтение `targetLayout.arrangement`, без временного `withLayoutArrangementApplied`.
- `layoutDuplicateSummaryForContainerTree` переведен на прямое чтение `targetLayout.arrangement`.
- `duplicateContainerSnapshotToLayout` переписан так, чтобы он напрямую строил target arrangement:
  - создает новые `containers/items`;
  - собирает placements новых контейнеров;
  - записывает `arrangement.items[newItemId] = newContainerId`;
  - вставляет корень копии либо в `arrangement.rootContainerIds`, либо в placement выбранного родителя;
  - вызывает `applyLayoutArrangement(targetLayoutId)` только если целевая укладка уже активна.
- `isLayoutMeaningful` теперь сначала смотрит `layout.arrangement`, чтобы не считать неактивный шаблон пустым из-за очищенного live-state.
- `repairAdminDemoLayout` больше не пересобирает весь arrangement из live-state и не вызывает `saveState` внутри repair. Он нормализует существующий arrangement и сохраняет уже записанные placements.
- При переключении между admin public layouts `activateAdminPublishedLayout` сначала снимает arrangement текущей активной укладки, если уходим с нее.
- `mergePublishedSharedStateIntoAdminLayout` и `mergeBuiltInSharedEntriesIntoAdminLayout` больше не пересобирают весь arrangement shared draft из live-state; новые roots/items добавляются точечно.

Проверки:

- `npm.cmd run check` прошел.
- `npm.cmd run build` прошел.

Что еще нужно проверить вручную:

- Шаблон А -> шаблон Б: сумка с вещами остается полной после перехода в другие укладки и возврата.
- Шаблон А -> шаблон Б: повторное копирование той же сумки показывает предупреждение о дубликатах. Подтверждено для дубликатов вещей; держать как регрессионную проверку.
- Копирование сумки в корень шаблона.
- Копирование сумки внутрь другой сумки шаблона.

## Регрессионные правила

- Перед правками по глюку 1 не менять заново duplicate fingerprint/source-id логику без отдельной причины.
- После любой правки по arrangement обязательно проверить, что глюк 2 не вернулся: повторное копирование той же сумки из шаблона в шаблон должно показывать найденные дубликаты вещей.
- Если правка глюка 1 требует менять общий flow копирования, сначала проверить путь дубликатов на текущем коде и зафиксировать, какие ids/source markers видны в `targetLayout.arrangement`.
- После правок whole-template copy проверять отдельно:
  - сразу после копирования активна локальная редактируемая копия `template-draft:*`, а не read-only/remote `shared:*`;
  - если demo/shared index не грузится из-за timeout, локальный draft не исчезает и не становится пустым;
  - published shared entry может появиться в селекте, но не должен вытеснять локальный draft до успешного сохранения/загрузки published state;
  - `sharedLayoutsIndex` не должен содержать photo references чужих public-list.

## Что не повторять без новой причины

- Не ограничиваться еще одним вызовом `writeContainerTreeToLayoutArrangement` после старого flow.
- Не чинить только `sourceIdVariants`, пока не доказано, что target duplicate summary видит правильные copied records.
- Не полагаться на live `container.itemIds/item.containerId` как на источник правды после переключения шаблонов; для этого сценария источником правды должен быть `layout.arrangement`.
- Не скрывать локальный `adminTemplateCopy` только потому, что runtime `findSharedLayout(adminSharedSourceId)` уже что-то нашел: runtime entry может быть создан локально раньше, чем серверная published запись стала надежной.
- Не хранить полный published shared payload с фото внутри demo-state индекса. Индекс может быть каталогом/preview, но не должен становиться источником истины для картинок shared-шаблона.

## v626: удаление и фото после регресса

- Убрана преждевременная подмена локальной копии шаблона опубликованным `shared:*`: `template-draft:*` снова остается отдельным вариантом в селекте. Иначе локальная редактируемая копия могла выглядеть пустой или удаление уходило не в тот объект.
- Удаление shared-шаблона больше не ждет браузерного пересохранения `sharedLayoutsIndex` через `POST /admin/demo-states/:lang/state`. Этот путь ломался на старых поврежденных payload с фото и давал ошибку `Public bike-packing payload references photos that were not uploaded to this public list`.
- Источником удаления записи из публичного индекса теперь должен быть API `DELETE /bike-packing/admin/shared-layouts/:sharedId`, где уже сделана идемпотентная чистка индексов. Фронт после успешного/идемпотентного DELETE только убирает runtime-запись локально.
- Для старых зависших записей добавлен локальный tombstone `bike-packing-deleted-shared-layouts-v1`: если DELETE вернул success или допустимый `already absent`, этот `sharedId` больше не подмешивается обратно в селект из поврежденного индекса после перезагрузки текущего браузера. Это страховка для админки, но серверная чистка все равно должна оставаться в API.
- Для копирования фото при публикации shared-шаблона источник фото теперь берется сначала из URL `/lists/:sourceListId/photos/:sourcePhotoId/...`, а только потом из `photo.listId`. Это важно для старых испорченных копий, где `listId` мог указывать на битый target, а реальный source оставался в URL.
- Добавлено предупреждение в консоль, если серверное `/photos/copy` не сработало и фронт уходит в fallback download/upload. Если фото снова пустые, в консоли надо смотреть именно это предупреждение: `copyPath`, `source`, `targetListId`, `entityType`, `entityId`.

## Нерешено после v626

Фактический результат на проверке пользователя:

- Новые copied shared-шаблоны снова начинают копироваться и карточки/контейнеры появляются.
- Картинки в новых скопированных шаблонах все равно не отображаются. Значит правки `isPhotoStoredForList`, fallback URL для admin photo copy и выбор `sourceListId` из URL не закрыли проблему полностью.
- Новые скопированные шаблоны, похоже, удаляются.
- Один старый поломанный шаблон все еще висит и не удаляется. Локальный tombstone не считается достаточным решением, потому что пользователь видит зависшую запись; надо разбираться с серверным индексом/записью до конца.

Что уже пробовали сегодня:

- Снова подключили фронт к реальному API удалений/копирования фото после обновления backend endpoints:
  - `DELETE /bike-packing/admin/shared-layouts/:id`
  - `POST /bike-packing/admin/shared-layouts/:id/photos/copy`
  - `POST /bike-packing/admin/demo-states/:demoId/photos/copy`
- На API сделан и запушен коммит `ebddcf5 Make shared layout delete idempotent`:
  - DELETE shared-шаблона должен быть идемпотентным;
  - если public-list уже отсутствует, API должен все равно чистить `sharedLayoutsIndex`;
  - API должен удалять shared entry из demo indexes на сервере, а не заставлять фронт пересохранять весь demo-state.
- Во фронте пробовали считать фото "уже лежащим в target list" строже: если в URL есть `/lists/...`, доверять URL, а не `photo.listId`.
- Во фронте пробовали нормализовать ответ admin `/photos/copy`: если API возвращает короткий объект без `url/thumbUrl`, синтезировать target URL `/bike-packing/lists/<targetListId>/photos/<photoId>/file|thumb`.
- Пробовали предварительную публикацию shared-шаблона без фото через `withoutPhotoReferences`, чтобы создать public shared list до копирования фото.
- Пробовали чистить `photos` в payload, который кладется в `sharedLayoutsIndex`, чтобы demo-state index не ссылался на фото из чужого public-list.
- Пробовали не скрывать локальный `template-draft:*` после появления runtime `shared:*`, потому что это ломало копирование сильнее: локальная копия превращалась в пустой/непрочитанный published shared.
- Пробовали перестать ждать фронтовый `removePublicIndexEntry` при удалении, потому что он делал `POST /admin/demo-states/:lang/state` и падал на поврежденных photo references.
- Добавили локальный tombstone для удаленных shared IDs, но он не является полноценной починкой старого зависшего шаблона.
- Подняли версию и кэш до `v626`, проверяли, что `v625/v622` не остались в `index.html`, `sw.js`, `src/config/constants.js` и собранном `www/.../index.html`.

Почему картинки все еще могут не отображаться:

- `/photos/copy` может возвращать success, но фактический файл/thumb не доступен по синтезированному URL.
- `/photos/copy` может падать, а fallback download/upload тоже не срабатывает из-за CORS/auth/timeout, но раньше это было тихо. После v626 в консоли должно быть предупреждение `Failed to copy remote photo through API; falling back to download/upload`.
- `sourcePhotoId` может не совпадать с реальным `photo_id` в таблице `bike_packing_photos`: фронт берет его из URL или `photo.id`, но у старых payload это могли быть разные значения.
- `sourceListId` может быть правильным в URL, но у API может не быть read access или записи в `bike_packing_photos` для этого list/photo.
- API может быть закоммичен и запушен, но не развернут на `api.vniipo-help.ru`; тогда фронт работает против старого backend-контракта.
- `sharedLayoutsIndex` теперь хранит payload без `photos`, поэтому если UI открывает shared-шаблон только из index preview, а полный `/shared-layouts/:id/state` не подтягивается или таймаутится, фото не появятся. Полный shared endpoint должен быть источником истины для фото.

Что нужно проверить дальше досконально:

- В DevTools Network при копировании шаблона:
  - сколько запросов уходит на `/photos/copy`;
  - какие у них status/response;
  - какие `sourceListId`, `sourcePhotoId`, `photoId`, `entityType`, `entityId`;
  - появляются ли после них реальные GET на `/lists/<targetListId>/photos/<photoId>/file|thumb`;
  - какие status у этих GET.
- В API логах/БД для конкретной копии:
  - есть ли public list `public-shared-layout-<sharedId>`;
  - есть ли rows в `bike_packing_photos` с `list_id = public-shared-layout-<sharedId>`;
  - совпадают ли `photo_id` с тем, что записан в payload items/containers;
  - есть ли файлы на диске по `file_path` и `thumb_path`.
- Для старого зависшего шаблона:
  - выписать его точный `sharedId` из dropdown/runtime/index;
  - вручную проверить `DELETE /bike-packing/admin/shared-layouts/<sharedId>` на текущем API;
  - проверить, удаляет ли API entry из всех `public-demo-state*` records;
  - если API возвращает success, но запись снова появляется, значит она приходит из другого источника: linked shared list, built-in shared data, localStorage runtime draft или другой language index.
- Проверить, развернут ли API-коммит `ebddcf5` на боевом `api.vniipo-help.ru`, а не только запушен в GitHub.

Важно для следующего подхода:

- Не считать проблему фото закрытой, пока в безлогине/readonly shared-шаблоне не видны реальные картинки после refresh.
- Не считать удаление закрытым, пока старый зависший шаблон не исчезает после refresh и не возвращается из dropdown.
- Следующая правка должна начинаться с трассировки одного конкретного фото: source URL -> source list/photo id -> `/photos/copy` request -> DB row target -> target URL -> browser GET image.

## v651: первый радикальный шов без удаления старого fallback

- Добавлен optional API-путь `copyPhotoReferences` для `POST /bike-packing/admin/shared-layouts/:id/state`: при сохранении shared-шаблона сервер сам проходит по photo references в payload, находит source list/photo из URL/metadata, копирует файл и thumb в target public-list и переписывает photo URL на target list перед validation/persist.
- Фронт использует этот путь только для `adminTemplateCopy` shared-шаблонов. Если серверный путь не сработал или еще не развернут, фронт пишет warning и возвращается к старому flow: priming без фото -> `/photos/copy`/upload -> final state.
- DELETE shared-шаблона на API теперь дополнительно удаляет legacy row из `bike_packing_user_data` для `shared-layout:<id>`, чтобы старый зависший шаблон не пересоздавался fallback-чтением после удаления из `bike_packing_lists`.
- Важно: обычное копирование сумок/вещей и duplicate-логика не менялись. Новый путь включен только на публикации whole shared template copy.
