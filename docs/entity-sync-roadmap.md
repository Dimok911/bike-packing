# Entity Sync Roadmap

## Startup freshness gate

При открытии страницы клиент больше не должен сразу грузить полный `/state`, если локальная копия уже есть и серверная freshness-мета не изменилась.

Нормальный startup-путь:

1. `/auth/me`;
2. показать cached state из localStorage;
3. `/bike-packing/lists/:id/freshness`;
4. если `stateRevision` / `payloadHash` / `entityHash` / `updatedAt` совпадают с `syncMeta`, полный payload не грузится;
5. если freshness отличается или endpoint недоступен, клиент идет в обычный full load path.

Полный payload при старте всё еще нужен, если нет локального state, нет сохраненной sync-меты, есть `syncMeta.dirty`, поменялся аккаунт/list id, freshness отличается, старый API не умеет `/freshness`, либо нужен conflict/recovery flow.

Рабочий документ для постепенного уменьшения случаев, когда bike-packing отправляет полный payload вместо мелкой синхронизации сущностей.

## Термины

`fallback/recovery path` - запасной путь сохранения через полный payload текущего bike-packing state. Он нужен, когда мелкий entity sync не смог покрыть все изменения, когда нужно принудительно заменить серверную версию после конфликта/восстановления, или когда система должна безопасно восстановиться из спорного состояния. Это не основной путь для обычных частых действий, а страховка.

`legacy path` - самый старый путь синхронизации через `/bike-packing-data.json`. Он остался для совместимости со старым API/старыми клиентами и как последний запасной вариант, если новый list API недоступен. В идеале обычная работа приложения не должна доходить до этого пути.

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
- legacy path: старый `/bike-packing-data.json`, если list API недоступен.

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
- recovery/compat data: может оставаться в полном payload как страховка.

## Кандидаты на вынос в entity sync

### 1. Dictionaries

Поля:

- `categories`;
- `locations`;
- layout-specific custom dictionaries, если они реально должны быть серверной правдой.

Возможные модели:

- одна entity `dictionary-state` на список;
- две entity `categories` и `locations`;
- отдельная entity на каждое значение справочника.

Решение для первого шага: одна record-level entity для справочников. Справочники небольшие, поэтому отдельные записи на каждое значение сейчас добавят больше конфликтной и миграционной сложности, чем пользы.

### 2. Packed State

Поля:

- `packedItems`;
- `layout.arrangement.packedItems`.

Нужно решить, где canonical source:

- внутри конкретной укладки;
- отдельной entity по layout id;
- локально на устройстве, если это не должно быть общей серверной правдой.

Решение: packed state должен быть общим между устройствами. Canonical source для entity sync - `layout.arrangement.packedItems`; верхнеуровневый `packedItems` остается runtime/UI mirror текущей укладки и не должен уходить в server payload.

### 3. Active Layout Choice

Поля:

- `activeLayoutId`;
- связанные persisted choice keys.

Решение: active layout choice не нужен на сервере. Это runtime-указатель текущей рабочей укладки и per-device память выбора, а не доменная серверная истина. В server sync должны уходить сами `layouts` и их содержимое, но не выбор открытой укладки.

### 4. User Preferences

Примеры:

- `collapsedContainers`;
- `itemDisplayMode`;
- `showItemMeta`;
- `showFilterContext`;
- `collectionMode`;
- `showOnlyUnpacked`;
- язык интерфейса;
- сортировка вещей/сумок;
- режим/стиль packing view, включая 3D-view state;
- локальные настройки карточек.

Большинство таких полей не должны попадать в общий server payload. Если понадобится серверная синхронизация, лучше делать отдельную `preferences` entity с мягкими конфликтами или last-write-wins.

Смысл вопроса про UI-настройки: нужно проверить, не попадают ли локальные предпочтения в `serializeState({ forSync: true })` случайно. "Случайно попадают" здесь означает: пользователь поменял только вид экрана на одном устройстве, а это поле оказалось в server payload и начало менять состояние на других устройствах. Сейчас `collapsedContainers`, `itemDisplayMode`, `showItemMeta`, `showFilterContext`, `collectionMode`, `showOnlyUnpacked`, `activeLayoutId`, сортировки, язык и 3D-view settings в общий server sync не уходят.

## Уже сделано

- Справочники: добавлена одна entity `dictionary-state` для `categories`/`locations`, backend endpoint `/dictionaries/sync`, frontend entity sync и contract test.
- Packed state: top-level `packedItems` перед sync зеркалится в `layout.arrangement.packedItems`, а server payload хранит его через layout entity.
- UI-настройки: `collectionMode` / `showOnlyUnpacked` и остальные явные UI-поля не попадают в server sync payload.
- `activeLayoutId` остается runtime/per-device указателем и не уходит на сервер.
- Legacy-compare diagnostic: `legacyComparableTopLevelDiffKeys(...)` показывает неожиданные top-level поля, которые остались после успешного entity sync; при fallback на full payload sync status и console теперь показывают эти поля.
- Частые действия покрыты contract test harness: категория вещи, категория сумки, место хранения, packed toggle, перемещение вещи и порядок корневых сумок проходят через entity sync без full payload fallback.
- Background polling: watcher больше не использует полный `/state` как fallback-проверку; сначала нужен валидный `/freshness` сигнал (`updatedAt`, `stateRevision`, `payloadHash` или `entityHash`), и только изменившаяся свежесть разрешает загрузить full state.

## Следующие шаги

1. Добить ручную проверку на реальном UI/устройстве для тех же частых действий, потому что в текущем Codex окружении нет in-app browser.
2. Сузить оставшиеся причины full payload до явных recovery/fallback сценариев.
3. Оставить full payload как recovery/fallback, а не как обычный путь.

## Что считать успехом

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
- при старом/недоступном API (когда сервер не поддерживает нужные entity-sync endpoints или временно не отвечает);
- при recovery/history restore (восстановлении состояния из истории, резервной копии или аварийного fallback);
- при миграции данных (переводе старого формата хранения в новый);
- для legacy compatibility (совместимости со старым API, старыми клиентами и прежним full-payload форматом).

## Закрытые решения и оставшийся аудит

- Сейчас full payload после entity sync не должен включаться из-за `categories`, `locations` или `packedItems`, если соответствующие entity sync endpoints доступны.
- Справочники синхронизируем одной записью на список.
- Packed state должен быть общим между устройствами.
- Active layout choice на сервере хранить не нужно.
- UI-аудит: текущие явные UI-поля (`collapsedContainers`, `itemDisplayMode`, `showItemMeta`, `showFilterContext`, `collectionMode`, `showOnlyUnpacked`, `activeLayoutId`) из sync payload вычищаются.
