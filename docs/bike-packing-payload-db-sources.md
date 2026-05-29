# Источники данных для пользовательского payload

Этот документ описывает, из каких таблиц backend собирает текущий payload списка
bike-packing для пользователя. Под payload здесь понимается state, который фронт
получает как `payload` / `state` / `record.payload` для конкретного списка.

Ключевой принцип: текущий payload является assembled state. Сырой
`bike_packing_lists.payload` больше не считается полной серверной правдой сам по
себе.

## Каноническая сборка

Текущая сборка живет в API в `loadAssembledListState(...)`:

1. Берется строка списка из `bike_packing_lists` - это корневая запись списка
   в БД: владелец, название, видимость, текущая ревизия и старый общий payload.
2. Из `bike_packing_lists.payload` берется base/legacy snapshot (базовый
   устаревший снимок состояния). Сейчас это не главная правда, а стартовый слой
   для сборки и fallback (резервный вариант для совместимости).
3. Для текущего `state_revision` (ревизии состояния списка) читаются
   entity rows (строки отдельных сущностей):
   - `bike_packing_items`;
   - `bike_packing_containers`;
   - `bike_packing_layouts`.
4. Backend (серверная часть) накладывает entity rows (строки сущностей) поверх
   base snapshot (базового снимка): отдельные вещи, сумки и укладки имеют
   приоритет над старым общим payload.
5. Удаленные entity rows (строки сущностей) с `deleted_at IS NOT NULL`
   считаются tombstone (меткой удаления) и удаляют соответствующую сущность из
   результата.
6. Layout placement (размещение в укладке: в какой сумке/группе лежит вещь и
   порядок элементов) применяется к items/containers (вещам/сумкам), чтобы
   итоговый state (состояние) был согласован с текущей укладкой.

Итоговый объект возвращается клиенту как current state. Для hash/meta backend
строит:

- `payloadHash` - hash всего assembled payload;
- `entityHash` - hash доменных entity-секций `items`, `containers`, `layouts`;
- `itemCount`, `containerCount`, `layoutCount`, `payloadSize`.

## Зачем еще нужен `bike_packing_lists.payload`

В идеальной будущей схеме current state (текущее состояние) можно будет собрать
только из отдельных entity rows (строк сущностей). Сейчас `bike_packing_lists.payload`
еще нужен как base layer (базовый слой) по нескольким причинам:

1. Entity rows сейчас покрывают не весь state, а только основные сущности:
   `items` (вещи), `containers` (сумки/контейнеры), `layouts` (укладки).
2. В payload остаются top-level fields (поля верхнего уровня), которые пока не
   имеют своей таблицы или отдельной физической entity row:
   - `categories` / `locations` - справочники категорий и мест хранения. Они
     вынесены в отдельный dictionary sync (синхронизацию справочников) как
     запись `dictionary-state` и физически хранятся в `bike_packing_dictionaries`.
     Старое значение внутри `bike_packing_lists.payload` остается только как
     migration/fallback слой;
   - старые/служебные поля, которые нужны для миграции, fallback и совместимости;
   - возможные будущие поля state, которые фронт еще может ожидать на верхнем
     уровне.
3. Payload используется как migration source (источник миграции): если для старого
   списка еще нет строк в `bike_packing_items`, `bike_packing_containers` или
   `bike_packing_layouts`, backend может поднять их из старого общего payload.
4. Payload используется как fallback (резервный вариант): если entity-таблицы
   отсутствуют на старом API/БД или временно недоступны, backend все еще может
   вернуть совместимый state.
5. Entity rows накладываются поверх payload, поэтому актуальная версия вещи/сумки/
   укладки берется из entity row. Старые `items` / `containers` / `layouts` внутри
   payload не должны побеждать отдельные entity rows.

То есть `bike_packing_lists.payload` сейчас не главный источник правды для вещей,
сумок и укладок. Он нужен как базовый слой и страховка для данных, которые еще не
полностью вынесены в отдельные сущности.

## Инвентаризация top-level полей state

Top-level fields (поля верхнего уровня) - это поля, которые лежат прямо в корне
`state`, а не внутри конкретной вещи, сумки или укладки.

Текущий sync payload формируется через `cloneStateForSyncPayload(..., { forSync:
true })`. Перед отправкой он удаляет локальные UI-поля и переносит часть runtime
state в layout entity.

| Поле | Сейчас в sync payload | Физическое хранение | Решение |
| --- | --- | --- | --- |
| `items` | Да, но покрыто entity sync | `bike_packing_items` | Уже вынесено. В `bike_packing_lists.payload` может оставаться только legacy/base версия для миграции и fallback. |
| `containers` | Да, но покрыто entity sync | `bike_packing_containers` | Уже вынесено. Placement-поля при sync очищаются, размещение приходит из layout arrangement. |
| `layouts` | Да, но покрыто entity sync | `bike_packing_layouts` | Уже вынесено. Layout является источником размещения и packed state. |
| `categories` | Да, через dictionary sync | `bike_packing_dictionaries` | Вынесено в отдельную физическую таблицу. Старое значение в `bike_packing_lists.payload` остается только как migration/fallback слой. |
| `locations` | Да, через dictionary sync | `bike_packing_dictionaries` | Вынесено вместе с `categories` одной записью `dictionary-state`. |
| `packedItems` | Нет как top-level поле | `layouts[*].arrangement.packedItems` | Новая таблица не нужна. Перед sync top-level `packedItems` зеркалится в активный layout arrangement и удаляется из корня. |
| `activeLayoutId` | Нет | Локальное runtime/localStorage состояние | На сервере не нужно. Это указатель открытой укладки на конкретном устройстве, а не данные списка. |
| `collapsedContainers` | Нет | Локальное UI-состояние | На сервер не отправлять. |
| `itemDisplayMode` | Нет | Локальное UI-состояние | На сервер не отправлять. |
| `showItemMeta` | Нет | Локальное UI-состояние | На сервер не отправлять. |
| `showFilterContext` | Нет | Локальное UI-состояние | На сервер не отправлять. |
| `collectionMode` | Нет | Локальное UI-состояние | На сервер не отправлять. Packed state при этом синхронизируется через layout arrangement. |
| `showOnlyUnpacked` | Нет | Локальное UI-состояние | На сервер не отправлять. |
| `collapseDefaultsVersion` | Да, legacy/top-level | Пока `bike_packing_lists.payload` | Низкий приоритет. Это служебная версия дефолтов сворачивания; можно оставить legacy-only или позже исключить из sync, если не нужна между устройствами. |
| неизвестные/custom поля | Если попали в state, могут попасть в legacy diff | Пока `bike_packing_lists.payload` | Не создавать таблицу вслепую. Сначала диагностировать конкретное поле и решить: отдельная entity, layout, list metadata или локальное UI-состояние. |

Практический вывод: активные справочники вынесены в `bike_packing_dictionaries`.
Остальные обычные пользовательские действия уже закрыты entity sync:

- изменения вещей -> `bike_packing_items`;
- изменения сумок -> `bike_packing_containers`;
- изменения укладок, размещения и packed state -> `bike_packing_layouts`;
- изменения справочников -> `bike_packing_dictionaries`.

## Таблицы

### `bike_packing_lists`

Используется всегда как корневая строка списка.

Поля, которые участвуют в формировании ответа списка:

- `id` - id списка;
- `owner_id` - владелец;
- `title`, `description` - metadata списка;
- `visibility`, `source_type`, `language` - режим/тип/язык, особенно для public/demo/shared;
- `author_name`, `tags`, `region`, `trip_type`, `duration_days`, `season`,
  `total_weight_grams`, `cover_photo_id` - metadata каталога/публикации;
- `state_revision` - текущая ревизия entity rows;
- `is_default` - основной список пользователя;
- `created_at`, `updated_at` - время списка и freshness-сигнал;
- `payload` - base/legacy snapshot.

`bike_packing_lists.payload` сейчас содержит:

- legacy/base состояние для миграции и fallback;
- top-level поля, которые еще не вынесены в отдельные entity;
- возможные старые `categories` / `locations` из legacy payload, которые
  используются только как migration/fallback слой, если строки в
  `bike_packing_dictionaries` еще нет;
- возможные старые `items` / `containers` / `layouts`, которые используются
  только как base layer, пока их не перекрыли entity rows.

Важно: raw `bike_packing_lists.payload` нельзя отдавать как current state. Для
current-state ответов API должен отдавать assembled payload.

### `bike_packing_items`

Источник актуальных вещей списка.

Ключевые поля:

- `list_id`, `item_id` - принадлежность и id вещи;
- `state_revision` - ревизия, к которой относится row;
- `payload` - payload одной вещи;
- `payload_hash` - hash payload вещи;
- `client_updated_at`, `source_device_id`, `source_device_name` - данные
  конфликта/источника изменения;
- `deleted_at` - tombstone удаления;
- `created_at`, `updated_at` - серверные времена.

При сборке:

- row с `deleted_at IS NULL` добавляет/перезаписывает вещь в `state.items`;
- row с `deleted_at IS NOT NULL` удаляет вещь из `state.items`;
- placement-поля вещи очищаются, потому что размещение считается частью layout
  arrangement, а не item entity.

### `bike_packing_containers`

Источник актуальных сумок/контейнеров.

Ключевые поля аналогичны items:

- `list_id`, `container_id`;
- `state_revision`;
- `payload`;
- `payload_hash`;
- `client_updated_at`, `source_device_id`, `source_device_name`;
- `deleted_at`;
- `created_at`, `updated_at`.

При сборке:

- активная row перезаписывает контейнер в `state.containers`;
- tombstone удаляет контейнер;
- placement-поля контейнера очищаются, потому что размещение хранится в layout.

### `bike_packing_layouts`

Источник актуальных укладок.

Ключевые поля:

- `list_id`, `layout_id`;
- `state_revision`;
- `payload`;
- `payload_hash`;
- `client_updated_at`, `source_device_id`, `source_device_name`;
- `deleted_at`;
- `created_at`, `updated_at`.

При сборке:

- активная row перезаписывает layout в `state.layouts`;
- tombstone удаляет layout;
- layout arrangement является источником размещения вещей и вложенности сумок;
- `packedItems` хранится через layout arrangement, а не как top-level sync
  поле.

### `bike_packing_dictionaries`

Источник актуальных справочников списка.

Ключевые поля:

- `list_id`, `dictionary_id` - принадлежность и id справочника. Сейчас
  используется одна запись `dictionary-state`;
- `state_revision` - ревизия списка, к которой относится row;
- `payload` - payload справочников:
  - `categories`;
  - `locations`;
- `payload_hash` - hash payload справочников;
- `client_updated_at`, `source_device_id`, `source_device_name` - данные
  источника изменения;
- `deleted_at` - tombstone удаления, на практике для `dictionary-state` обычно
  не используется;
- `created_at`, `updated_at` - серверные времена.

При сборке:

- активная row `dictionary-state` перезаписывает `state.categories` и
  `state.locations`;
- если row еще нет, backend использует `categories` / `locations` из
  `bike_packing_lists.payload` как fallback и может лениво создать row из старого
  payload.

### `bike_packing_list_history`

Не участвует в обычной сборке current payload.

Используется для:

- истории изменений списка;
- restore из выбранного snapshot;
- сравнения/диагностики истории.

`payload` в этой таблице является историческим snapshot. Его можно показывать как
историю или использовать для restore, но нельзя считать текущим state без
операции восстановления.

### `bike_packing_list_shares`

Не участвует в содержимом payload.

Используется для access-control:

- кто может читать список;
- кто может редактировать список;
- роль `viewer` / `editor`;
- приглашения и revoke.

Таблица влияет на доступ к payload, но не добавляет поля внутрь самого state.

### `bike_packing_user_data` и legacy history

Это legacy-слой старого `/bike-packing-data.json` пути.

Обычная работа личных списков должна идти через `bike_packing_lists` и entity
tables. Legacy user-data может использоваться для совместимости, старых данных,
import/recovery и отдельных public/shared fallback-сценариев, но не должен быть
обычным источником current state для нового list API.

## Порядок приоритета

Для одной и той же сущности приоритет такой:

1. Entity row текущей `state_revision` из `bike_packing_items`,
   `bike_packing_containers` или `bike_packing_layouts`.
2. Tombstone entity row удаляет сущность даже если она есть в base payload.
3. Если entity row нет, используется версия из `bike_packing_lists.payload`.
4. Если сущность относится к service/generated публичным ссылкам, backend может
   скрыть ее из результата через фильтр видимости reference tree.

## Что записывается при разных операциях

### Entity sync

Обычные изменения вещей, сумок и укладок пишутся в entity tables:

- `/items/sync` -> `bike_packing_items`;
- `/containers/sync` -> `bike_packing_containers`;
- `/layouts/sync` -> `bike_packing_layouts`.

После успешной записи backend обновляет `bike_packing_lists.updated_at`, чтобы
freshness увидел изменение. Raw `bike_packing_lists.payload` при этом не обязан
обновляться.

### Dictionary sync

Справочники синхронизируются одной записью `dictionary-state` и физически
хранятся в `bike_packing_dictionaries`:

- `categories`;
- `locations`.

При чтении assembled state backend сначала берет `dictionary-state` из
`bike_packing_dictionaries`. Если строки еще нет, значения поднимаются из
`bike_packing_lists.payload` и лениво мигрируются в новую таблицу.

### Full payload write

Полная запись payload через `persistListPayload(...)` допустима для явных
сценариев:

- создание списка;
- import;
- restore/history restore;
- force overwrite;
- conflict merge, когда результатом становится новая каноническая версия;
- миграция или repair.

При full write backend обновляет `bike_packing_lists.payload`, синхронизирует из
него entity tables и пишет history snapshot.

## Контракт защиты

В API добавлен guard `scripts/check-bike-packing-payload-contract.mjs`.

Он должен падать на `npm.cmd run check`, если в код случайно вернутся опасные
паттерны:

- `serverPayload: normalizePayload(row.payload)`;
- `mapListRow(..., true/false)`;
- прямой `list: mapListRow(...)` для current-state ответа;
- raw `payload: normalizePayload(row.payload)` вне явно разрешенных
  history/public-legacy snapshot-мапперов.

Смысл guard: raw list payload может быть legacy/base snapshot, но не должен снова
стать current server state в пользовательских ответах.
