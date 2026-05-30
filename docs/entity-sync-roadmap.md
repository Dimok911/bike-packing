# Entity Sync Roadmap

## Startup freshness gate

При открытии страницы клиент больше не должен сразу грузить полный `/state`, если локальная копия уже есть и серверная freshness-мета не изменилась.

Нормальный startup-путь:

1. `/auth/me`;
2. показать cached state из localStorage;
3. `/bike-packing/lists/:id/freshness`;
4. если `stateRevision` / `payloadHash` / `entityHash` / `updatedAt` совпадают с `syncMeta`, полный payload не грузится;
5. если freshness отличается, клиент идет в обычный full load path.

Полный payload при старте всё еще нужен, если нет локального state, нет сохраненной sync-меты, есть `syncMeta.dirty`, поменялся аккаунт/list id, freshness отличается, либо нужен conflict/recovery flow.

Рабочий документ для постепенного уменьшения случаев, когда bike-packing отправляет полный payload вместо мелкой синхронизации сущностей.

## Термины

`fallback/recovery path` - запасной путь сохранения через полный payload текущего bike-packing state. Он нужен, когда мелкий entity sync не смог покрыть все изменения, когда нужно принудительно заменить серверную версию после конфликта/восстановления, или когда система должна безопасно восстановиться из спорного состояния. Это не основной путь для обычных частых действий, а страховка.

`legacy path` - самый старый путь синхронизации через `/bike-packing-data.json`. Он выведен из автоматических frontend runtime-путей: обычная работа приложения не должна ни читать, ни писать этот endpoint. Recovery опирается на локальные backup-архивы.

## Что такое state

`state` - это главный объект данных, из которого приложение рисует личную укладку и который сохраняет между устройствами.

В упрощённом виде он выглядит так:

```js
{
  items: { ... },
  containers: { ... },
  layouts: { ... },
  categories: [...],
  locations: [...],
  activeLayoutId: "layout-main",
  packedItems: { ... },
  collapsedContainers: { ... },
  itemDisplayMode: "...",
  showItemMeta: true
}
```

Основные доменные части:

- `items` - вещи: название, вес, категория, место хранения, фото и другие свойства вещи;
- `containers` - сумки/места/пакеты: название, вес, объём, фото и свойства контейнера;
- `layouts` - укладки: какие сумки входят в укладку, где лежат вещи, порядок и вложенность;
- `categories` и `locations` - общие справочники категорий и мест хранения.

Есть и поля другого типа:

- `activeLayoutId` - id укладки, которая сейчас открыта в интерфейсе. Например, если в `layouts` есть запись `layout-main`, то `activeLayoutId: "layout-main"` означает “показываем эту укладку”;
- `packedItems` - отметки “упаковано”, если они ещё живут на верхнем уровне state;
- `collapsedContainers`, `itemDisplayMode`, `showItemMeta` - состояние интерфейса, которое скорее должно быть локальным, а не общей серверной правдой.

Поэтому `state` нельзя автоматически считать одной неделимой серверной сущностью. Внутри него смешаны доменные данные, локальная навигация, UI-настройки и совместимость со старым форматом. Задача entity sync - постепенно отделить серверные доменные данные от локального/UI-состояния.

### Когда сохраняется `activeLayoutId`

Сейчас есть два похожих, но разных сохранения.

Первое: `activeLayoutId` как поле внутри общего `state`. Оно меняется, когда приложение переключает активную укладку, например через `switchActiveLayout(layoutId)`. После этого вызывается локальное сохранение state, чтобы при перезагрузке приложение могло восстановить текущую рабочую картину.

Второе: отдельный localStorage-выбор последней открытой укладки. Он сохраняется через `rememberActiveLayoutChoice(...)` / `saveActiveLayoutChoice(...)` в ключи вроде `ACTIVE_LAYOUT_CHOICE_KEY` и `ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY`. Это скорее UI-память устройства: “что открыть в следующий раз”.

Типичные моменты, когда это происходит:

- пользователь выбирает другую укладку в интерфейсе;
- приложение восстанавливает последнюю выбранную приватную укладку после загрузки;
- создаётся или копируется новая укладка, и приложение сразу переключается на неё;
- удаляется активная укладка, и приложение выбирает следующую доступную;
- защитная логика перед сохранением переключает пустую/сломавшуюся активную укладку на более содержательную.

Именно поэтому `activeLayoutId` спорный для server sync: иногда это часть старого общего state, а по смыслу часто просто локальный выбор экрана на конкретном устройстве.

Решение: `activeLayoutId` не должен уходить в server sync payload. Серверные данные должны хранить сами укладки (`layouts`) и их содержимое, а выбор “какую укладку открыть на этом устройстве” должен жить в localStorage (`ACTIVE_LAYOUT_CHOICE_KEY` / `ACTIVE_PRIVATE_LAYOUT_CHOICE_KEY`).

В рантайме `state.activeLayoutId` пока остается как технический указатель для старого UI-кода: по нему рендер, drag/drop, редактирование и удаление понимают, с какой укладкой работает экран. Но это поле сделано runtime-only: оно читается и меняется в памяти, но не сериализуется в local snapshot/server sync payload как часть данных.

До этого `activeLayoutId` мог попасть на сервер только через full payload save: `serializeState({ forSync: true })` -> `buildListSaveBody(...)` -> `PUT /bike-packing/lists/:id`. Entity sync для `items`, `containers`, `layouts` сам по себе `activeLayoutId` не отправляет.

## Текущее состояние

Сейчас приватная синхронизация работает гибридно:

- основной путь: `entity sync` для `items`, `containers`, `layouts`;
- fallback/recovery path: полный payload через сохранение всего state;
- legacy path: старый `/bike-packing-data.json` выведен из automatic runtime paths.

Entity sync сейчас является record-level sync: если меняется одно поле вещи, на сервер отправляется вся запись этой вещи, но не весь список целиком.

## Почему иногда уходит full payload

После entity sync клиент делает дополнительную проверку.

Он берёт две версии данных:

- текущий local state;
- последний state, который мы считали успешно сохранённым на сервере. В коде это часто называется `baseState` или server baseline.

Из обеих версий временно убираются те части, которые entity sync уже успешно отправил: `items`, `containers`, `layouts`.

После этого клиент сравнивает оставшийся state. Так он отвечает на вопрос: “кроме вещей, сумок и укладок изменилось ещё что-то, что мелкая синхронизация не покрыла?”

Если остаются изменения в других top-level полях state, entity sync их не покрывает, поэтому включается full payload.

Примеры таких кандидатов:

- `categories`;
- `locations`;
- `packedItems`, только если состояние упаковки ещё не зеркалировано в `layout.arrangement.packedItems`;
- пользовательские настройки режима/представления, если они попали в sync-state;
- другие top-level поля, которые не являются локальным UI-state.

Проверка текущего кода:

- `activeLayoutId` уже вычищается из `cloneStateForSyncPayload(..., { forSync: true })`, поэтому одно только переключение активной укладки больше не должно включать full payload;
- `collapsedContainers`, `itemDisplayMode`, `showItemMeta`, `showFilterContext`, `collectionMode`, `showOnlyUnpacked` тоже вычищаются из sync payload;
- после удаления `items`, `containers`, `layouts`, `categories`, `locations` из legacy-compare не должны оставаться обычные доменные изменения; top-level `packedItems` перед sync зеркалится в `layout.arrangement.packedItems` и удаляется из server payload;
- изменение `items`/`containers`/`layouts` само по себе проходит через entity sync и не должно требовать full payload, если соответствующий endpoint доступен и подтвердил записи.

## Важное различие

Не всё, что есть в local state, должно синхронизироваться на сервер.

Нужно разделять:

- доменные данные: должны жить на сервере и иметь entity sync;
- локальный UI-state: должен оставаться локальным на устройстве;
- пользовательские настройки: могут синхронизироваться отдельно, но не должны конфликтовать с доменными данными;
- recovery data: может оставаться в полном payload как страховка.

## Принятые решения baseline

- `items`, `containers` и `layouts` синхронизируются как record-level entities.
- `categories` и `locations` синхронизируются одной entity `dictionary-state` на список. Встроенные frontend defaults для словарей удалены: значения должны приходить из БД/API, payload шаблона или реально использованных записей.
- Layout-specific custom dictionaries остаются частью соответствующего layout, когда речь идет о public/template layout, guest demo copy или пользовательской укладке с собственным словарем.
- Packed state является общей серверной правдой внутри `layout.arrangement.packedItems`. Верхнеуровневый `packedItems` остается runtime/UI mirror текущей укладки и не уходит в server payload.
- `activeLayoutId` не синхронизируется как серверная доменная истина. Это runtime-указатель текущей рабочей укладки и per-device persisted choice.
- UI preferences (`collapsedContainers`, `itemDisplayMode`, `showItemMeta`, `showFilterContext`, `collectionMode`, `showOnlyUnpacked`, сортировки, язык, 3D-view settings) не входят в общий server sync payload. Если для них понадобится серверная синхронизация, это должна быть отдельная `preferences` entity.

## Уже сделано

- Справочники: добавлена одна entity `dictionary-state` для `categories`/`locations`, backend endpoint `/dictionaries/sync`, frontend entity sync и contract test.
- Packed state: top-level `packedItems` перед sync зеркалится в `layout.arrangement.packedItems`, а server payload хранит его через layout entity.
- UI-настройки: `collectionMode` / `showOnlyUnpacked` и остальные явные UI-поля не попадают в server sync payload.
- `activeLayoutId` остается runtime/per-device указателем и не уходит на сервер.
- Legacy-compare diagnostic: `legacyComparableTopLevelDiffKeys(...)` показывает неожиданные top-level поля, которые остались после успешного entity sync; при fallback на full payload sync status и console теперь показывают эти поля.
- Частые действия покрыты contract test harness: категория вещи, категория сумки, место хранения, packed toggle, перемещение вещи и порядок корневых сумок проходят через entity sync без full payload fallback.
- Background polling: watcher больше не использует полный `/state` как fallback-проверку; сначала нужен валидный `/freshness` сигнал (`updatedAt`, `stateRevision`, `payloadHash` или `entityHash`), и только изменившаяся свежесть разрешает загрузить full state.
- Raw `bike_packing_lists.payload` зафиксирован как legacy/base snapshot, а не current state: API current-state ответы должны использовать assembled state, общий `mapListRow` больше не умеет вклеивать raw payload, а backend `check` ловит случайный `serverPayload`/`list.payload` из raw list payload.
- Ручная prod-проверка на `v969` пройдена в отдельном Chrome для списка `list-c20abef5-43fb-4747-9b35-04174f2a0a65`: переименование вещи, категории/места хранения, контейнеры, layouts, dictionaries, readonly templates, повторное переключение шаблонов и 65 секунд background refresh прошли без `POST /bike-packing-data.json`.
- Template payload cache: повторный refresh каталога шаблонов в рамках сессии переиспользует уже загруженный payload при неизменном `updatedAt`, поэтому повторные переключения шаблонов не должны заново плодить full `/state` или legacy `bike-packing-data.json`.
- Public template payload endpoint: backend capability `publicTemplatePayloadEndpoint` и endpoint `/bike-packing/public-template-payloads/:itemKey` добавлены; frontend читает demo/shared payload шаблона через него без legacy `/bike-packing-data.json` fallback.
- Startup freshness на `v974`: `syncMeta.listId` сохраняется в scoped localStorage, поэтому повторный старт залогиненного пользователя с неизменной `/freshness` не должен тянуть тяжёлый `/bike-packing/lists/:id/state`. Первый full state после обновления может быть миграционным, чтобы записать недостающую мету.
- Ручная prod-проверка на `v974`: после повторной загрузки личный `/lists/list-c20abef5-43fb-4747-9b35-04174f2a0a65/state` исчез из обычного старта; остались только небольшие demo payload-запросы через `public-template-payloads`.
- Entity pull / changes feed: backend capabilities `entityChangesFeed` и `entityChangesFeedRevisionBump`, а также endpoint `/bike-packing/lists/:id/changes?sinceRevision=N` добавлены и проверены. Frontend `v978` подключён к этому feed для startup refresh и background refresh: если `/freshness` изменилась и локальная `syncMeta.stateRevision` известна, приложение сначала применяет changed/deleted rows для `items`, `containers`, `layouts`, `dictionaries`; full `/state` остаётся fallback для слишком старой/неполной revision или неуспешного применения.
- Ручная prod-проверка на `v978`: после переименования вещи на другом устройстве background refresh идёт через `GET /freshness` -> `GET /changes?sinceRevision=...`; тяжёлый `/lists/:id/state` больше не появляется в обычном changes-feed сценарии.
- Встроенные demo/default dictionary seeds удалены из frontend runtime: новые состояния и guest/demo копии больше не получают категории/места из `demo-data.js`, `default-user-state.js`, `guess.js` или hardcoded translation defaults. Словари должны приходить из БД/API, из layout payload или из реально использованных значений.
- Full-payload audit вынесен в отдельный документ [`legacy-fallback-retirement-plan.md`](legacy-fallback-retirement-plan.md): допустимые пути подписаны как force overwrite, conflict merge, history/backup restore и migration/recovery; automatic legacy writer и reader для `/bike-packing-data.json` отключены.

## Следующие шаги

1. Поддерживать автотесты, которые фиксируют отсутствие full payload fallback для частых действий, повторного startup freshness и повторного template payload refresh.
2. Проработать dirty offline rebase поверх changes feed: если устройство было offline, локально изменило entity A, а сервер за это время получил изменение entity B, то при stale `baseStateRevision` фронт должен запросить `/changes?sinceRevision=baseStateRevision`, применить непересекающиеся remote changes к base/local diff и отправить только свои entity changes без full `/state`. Full state остаётся fallback только для пересекающихся конфликтов, слишком старой revision или непокрытых legacy-полей.
3. Оптимизировать eager template loading: на старте личной укладки не загружать оба demo payload (`demo-state`, `demo-state:en`), пока пользователь не открывает demo/template контекст или пока catalog `updatedAt` не поменялся.
4. Считать [`legacy-fallback-retirement-plan.md`](legacy-fallback-retirement-plan.md)
   закрытым guardrail-документом (охранным документом): frontend runtime
   (код приложения во время работы в браузере) больше не должен автоматически
   читать или писать `/bike-packing-data.json`.

## Что считать успехом

Статус `entity sync baseline complete`: обычные пользовательские действия на `v969` подтверждены ручным prod-прогоном и critical-тестами как работающие через entity sync без legacy full payload fallback. На `v974` дополнительно подтверждено, что повторный залогиненный startup уходит через freshness/cache без тяжёлого личного `/state`, а demo/shared payload читается через dedicated endpoint. На `v978` подтверждено, что изменившаяся `/freshness` с новой `stateRevision` уводит background refresh в `/changes?sinceRevision=...`, а не в полный `/state`. На `v981` `/bike-packing-data.json` выведен из automatic frontend runtime paths.

Обычные частые действия должны проходить без full payload:

- переименование вещи;
- изменение категории вещи;
- изменение места хранения вещи/сумки;
- перемещение вещи внутри укладки;
- добавление вещи в укладку;
- удаление вещи/сумки;
- изменение порядка сумок и вложенности.

Full payload допустим:

- при force overwrite (принудительной перезаписи серверной версии текущим локальным состоянием);
- после conflict merge (разбора и объединения конфликтующих локальных/серверных изменений), когда нужна каноническая замена (запись одной итоговой версии как новой серверной правды);
- при recovery/history restore (восстановлении состояния из истории, резервной копии или аварийного fallback);
- при миграции данных (переводе старого формата хранения в новый).

## Закрытые решения и оставшийся аудит

- Сейчас full payload после entity sync не должен включаться из-за `categories`, `locations` или `packedItems`, если соответствующие entity sync endpoints доступны.
- Справочники синхронизируем одной записью на список.
- Packed state должен быть общим между устройствами.
- Active layout choice на сервере хранить не нужно.
- UI-аудит: текущие явные UI-поля (`collapsedContainers`, `itemDisplayMode`, `showItemMeta`, `showFilterContext`, `collectionMode`, `showOnlyUnpacked`, `activeLayoutId`) из sync payload вычищаются.
