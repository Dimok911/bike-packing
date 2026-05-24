# Дорожная карта рефакторинга app.js

Цель: превратить `app.js` в тонкую сценарную точку входа. В нем должны остаться старт приложения, связывание UI, текущий экран, вызовы модулей, сохранение и перерисовка. Бизнес-правила, нормализация, выбор источников, форматирование, sync/storage и публичные шаблоны должны жить в `src/...`.

Этот документ - рабочая карта: что уже вынесено, что выносить дальше, как проверять прогресс и где быть особенно осторожным.

## Текущее состояние

На 2026-05-24 `app.js` после серии безопасных срезов: около `17853` строк.

Уже вынесены или расширены домены:

- `src/storage`: active choice, UI settings, UI language, sync device, sync meta, auth/scope helpers.
- `src/state`: catalog filters/search/sort/usage, record meta, record-derived, layout selectors/ops/manage/delete/normalize/collapse, diagnostics, repair, metrics.
- `src/sync`: admin API compatibility warnings, remote list record selector, conflict meta fields, API client, entity sync, photos, service worker, serialize, history.
- `src/ui`: sync visual state, conflict/date formatting, layout load status, item display/format, dialogs, print, search highlight, packing 3D.
- `src/public`: shared layouts, demo layout choice, template copy, public-to-private copy, admin shared layout operations.

Важно: размер production bundle может временно не уменьшаться, потому что сейчас задача - исходная модульность, а не code splitting. Главная метрика на этом этапе: меньше бизнес-логики в `app.js`, яснее границы ответственности, проще искать баги.

## Примерная оценка уменьшения app.js

Оценки ниже показывают только чистое уменьшение `app.js`. Общий объем кода в репозитории может не уменьшиться: часть строк переедет в `src/...`, появятся imports, wrappers и проверки. Поэтому цифры нужны как ориентир по прогрессу, а не как обещание точного результата.

Текущая база для оценки: около `17853` строк.

| Срез | Примерное уменьшение `app.js` | Почему такой диапазон |
| --- | ---: | --- |
| Добрать conflict formatting и conflict merge helpers | 300-700 строк | Часть форматирования уедет полностью, но останутся UI wrappers и callbacks. |
| Вынести sync merge и remote state | 800-1400 строк | Merge-функции крупные и в основном чистые; часть останется вокруг dialogs/status. |
| Вынести photo upload/copy scope | 400-800 строк | Много правил выбора фото, но upload orchestration и статусы останутся в `app.js`. |
| Вынести public/shared/template copy zone | 900-1700 строк | Крупная зона с identity/source/delete/copy правилами; часть сценариев останется glue-кодом. |
| Вынести layout/item/container operations | 900-1600 строк | Много state-операций можно перенести, но confirm/toast/render/save останутся рядом с UI. |
| Вынести backup/import flow | 400-900 строк | Analysis/summary/photo preparation уедут, orchestration диалога останется. |
| Разделить UI render islands | 2500-4500 строк | Самый большой потенциальный выигрыш: summary/items/bags/settings/dialog render blocks. |
| Drag/drop и pointer interactions | 1200-2500 строк | Крупная область, но самая рискованная; переносить только после очистки state operations. |

Ориентир после всех фаз: `app.js` может прийти примерно к `6000-10000` строкам. Реалистичная промежуточная цель - сначала пройти ниже `15000`, затем ниже `10000`.

Ближайшие операции с ожидаемым эффектом:

| Ближайшая операция | Ожидаемое уменьшение `app.js` |
| --- | ---: |
| `formatConflictFieldValue` + `formatConflictCountValue` в `src/ui/conflict-format.js` | 80-180 строк |
| `conflictValueSummary` + `conflictDifferenceSummary` в `src/ui/conflict-format.js` | 120-260 строк |
| `changedComparableKeys` + `comparableValueForMerge` в `src/sync/conflict-merge.js` | 120-280 строк |
| `mergeStringList` + `mergeScalarField` в `src/sync/state-merge.js` | 120-260 строк |
| `mergeRecordMap` + `mergeStateFromBase` в `src/sync/state-merge.js` | 350-700 строк |
| Photo upload scope helpers в `src/sync/photo-upload-scope.js` | 250-500 строк |
| Template copy source helpers в `src/public/template-copy-source.js` | 300-700 строк |
| Item/container copy/delete pure operations в `src/state/item-ops.js` и `src/state/container-ops.js` | 500-1000 строк |

## Правила каждого среза

- Один срез = один смысловой слой, который можно быстро проверить и откатить.
- В `app.js` оставлять wrapper/orchestration: взять зависимости из state/UI, вызвать модуль, показать статус, сохранить.
- В `src/state` не передавать DOM, fetch и localStorage.
- В `src/ui` не решать API-контракты и не чинить структуру state.
- В `src/sync` держать сеть, payload, serialize, conflict/sync helpers, но не рендер.
- В `src/public` держать shared/demo/template identity, copy/delete/publish-adjacent правила.
- Любой новый файл в `src/...` добавлять в `npm.cmd run check`.
- Если изменен runtime или видимый браузеру код: bump `APP_VERSION`, `index.html`, `sw.js`, затем `npm.cmd run check` и `npm.cmd run build`.
- Если затронут `CRITICAL:` или flow из `docs/critical-flows.md`: дополнительно `npm.cmd run test:critical`.
- Коммитить маленькими именованными checkpoint-ами. После пачки успешных коммитов пушить `main`.

## Карта ответственности

Идеальная конечная роль `app.js`:

- инициализация refs/controllers;
- маршрут и режим экрана;
- связывание DOM событий;
- получение текущего state/scope/user;
- вызов профильных модулей;
- save/render/toast/status;
- минимальные compatibility wrappers для постепенного перехода.

Роли модулей:

- `src/config` - версии, ключи, endpoints, feature flags.
- `src/storage` - localStorage/session/storage scope и persisted UI/sync settings.
- `src/state` - чистые операции над состоянием, layout arrangement, catalog, dictionaries, delete/normalize/repair/metrics.
- `src/sync` - API, upload/copy photos, entity sync, merge/conflicts, remote records, serialize, payload diagnostics.
- `src/public` - shared/demo/public/template-copy contracts.
- `src/ui` - standalone render/format/dialog/controllers, без API-контрактов.
- `src/backup` - backup archive/restore analysis/import helpers.
- `src/utils` - маленькие generic helpers.

## План работ

### Фаза 1. Закрепить уже начатые безопасные зоны

Цель: быстро добрать рядом лежащие чистые helpers, чтобы не оставлять половинчатые домены.

- [x] Storage: UI settings/language, sync device/meta.
- [x] Catalog: usage, sort, filters, field search.
- [x] Sync visual UI: help text, state resolver, DOM apply helper.
- [x] Conflict formatting: version stamp, changed fields, arrangement summary.
- [x] Sync list records: choose richer remote record.
- [ ] Conflict formatting: `formatConflictFieldValue`, `formatConflictCountValue`, `conflictValueSummary`.
- [ ] Conflict merge pure helpers: `changedComparableKeys`, `comparableValueForMerge`, scalar merge helpers.
- [ ] Catalog wrappers cleanup: reduce remaining tiny wrappers once call sites are clear.

Целевые модули:

- `src/ui/conflict-format.js`
- `src/sync/conflict-merge.js`
- `src/state/catalog-selectors.js`, если catalog wrappers перерастут filters/search/sort.

### Фаза 2. Sync merge и remote state

Цель: отделить merge/sync contracts от UI и lifecycle приложения.

Кандидаты из `app.js`:

- `mergeStateFromBase`
- `mergeStringList`
- `mergeRecordMap`
- `mergeScalarField`
- `applyConflictChoices`
- `conflictTargetMap`
- `isPlacementOnlyLocalChangeAgainstDeletedRemote`
- `legacyComparableStateForSync`
- `buildRemoteSaveBody`
- `buildListSaveBody`
- `rememberConflictRemoteMeta`

Планируемые модули:

- `src/sync/state-merge.js` - чистый three-way merge и применение выбранных решений конфликтов.
- `src/sync/conflict-merge.js` - чистые conflict data helpers.
- `src/ui/conflict-format.js` - текст и форматирование для UI конфликтов.
- `src/sync/save-body.js` - построение remote/list save request body.

Проверки:

- `npm.cmd run check`
- `npm.cmd run build`
- `npm.cmd run test:critical`, если меняется поведение sync-save.

### Фаза 3. Photos и upload scope

Цель: убрать из `app.js` правила выбора фото для upload/copy/reupload.

Кандидаты:

- `getPhotoUploadScope`
- `isEntityInPhotoUploadScope`
- `keepRemoteOnlyPhotoReference`
- `getUploadablePhotoEntries`
- `photoShouldBeCopiedToCurrentList`
- `markRecordPhotosForCurrentListCopy`
- `markLayoutPhotosForCurrentListCopy`
- `getUnsyncedPhotoEntries`
- `isPhotoUsableFromServer`
- `remotePhotoSourceFromRecord`
- `remotePhotoSourceFromUrl`

Планируемый модуль:

- расширить `src/sync/photos.js` или добавить `src/sync/photo-upload-scope.js`.

Риск:

- Offline photos - критичный сценарий. Если меняется поведение, запускать `npm.cmd run test:critical`.

### Фаза 4. Public/shared/template copy

Цель: `app.js` должен только запускать пользовательский сценарий copy/delete/publish. Identity/source/dedup/restore должны быть в модулях.

Кандидаты:

- `createSharedVirtualState`
- `createSharedVirtualStateFromPublishedState`
- `sharedLayoutStatePayload`
- `publicVirtualLayoutMarkers`
- `templateCopyRootSnapshots`
- `templateCopySourceScore`
- `loadPublishedTemplateCopySource`
- `createTemplateCopyFromSource`
- `deletePublishedSharedTemplate`
- `deleteManagedPublicLayout`
- `shouldDeletePublishedSharedTemplateForLayout`

Планируемые модули:

- продолжить `src/public/shared-virtual-state.js`
- `src/public/template-copy-source.js`
- `src/public/shared-template-delete.js`

Проверки:

- `npm.cmd run check`
- `npm.cmd run build`
- для template copy/delete: свериться с `docs/critical-flows.md`; при изменении контрактов запускать `npm.cmd run test:critical`.
- Если API затронут: отдельно backend check/commit/push.

### Фаза 5. Layout/item/container operations

Цель: операции создания, копирования, удаления и перемещения должны жить в state modules. `app.js` оставляет confirm/toast/render/save.

Кандидаты:

- `copyItem`
- `copyRootContainer`
- `duplicateRootContainer`
- `deleteItemForever`
- `removeItemFromActiveLayout`
- `deleteRootContainer`
- `removeRootContainerFromActiveLayout`
- `clearRootContainerContents`
- `removeContainerTree`
- `placeExistingItemInLayout`
- `placeExistingContainerInLayout`
- `moveItem`
- `moveContainer`
- `createGroupFromItems`

Планируемые модули:

- `src/state/item-ops.js`
- `src/state/container-ops.js`
- возможно расширить `src/state/layout-ops.js` и `src/state/layout-delete.js`.

Риск:

- Touch/drag timing критичен, но чистые layout operations безопаснее pointer handlers.
- DOM drag/drop код в эту фазу не трогать.

### Фаза 6. Backup/import flow

Цель: backup import orchestration оставить в `app.js`, а analysis/summary/photo preparation вынести в модули.

Кандидаты:

- `buildCurrentBackupManifest`
- `backupLayoutRows`
- `summarizeSelectedBackupLayouts`
- `resolveExistingBackupPhotos`
- `prepareBackupPhotosForState`
- `restoreSelectedBackupLayouts`
- `restoreFullBackup`

Планируемые модули:

- расширить `src/backup/archive.js`
- расширить `src/backup/restore.js`
- возможно добавить `src/sync/backup-photos.js` для server photo resolve.

Проверки:

- `npm.cmd run check`
- `npm.cmd run build`
- manual backup import/export smoke, если меняется UI-поведение.

### Фаза 7. UI render islands

Цель: переносить крупные render blocks только после state/sync/public helpers, потому что у UI самые липкие зависимости.

Кандидаты:

- summary rendering;
- items list rendering;
- bags/settings/layout editor;
- dictionary editor;
- item/root container dialogs;
- backup dialog orchestration;
- shared mode banners and shared packing.

Планируемые модули:

- `src/ui/summary.js`
- `src/ui/items-view.js`
- `src/ui/root-containers-editor.js`
- `src/ui/dictionaries-editor.js`
- `src/ui/item-dialog.js`
- `src/ui/root-container-dialog.js`

Правило:

- UI modules получают подготовленные данные и callbacks.
- UI modules не должны normalize backend payloads и не должны решать sync contracts.

### Фаза 8. Drag/drop и pointer interactions - в конце

Цель: оставить самую хрупкую область на конец, когда state operations уже чистые.

Кандидаты:

- pointer drag binding;
- root column drag;
- board/fixed scrollbar;
- nested group hover/open timings;
- drop target calculation.

Риск:

- `touch-click-timing` - критичный сценарий.
- Не менять timing constants без прямой причины.
- После изменений: `npm.cmd run test:critical`, `npm.cmd run check`, `npm.cmd run build`, плюс manual mobile/touch smoke.

## Отслеживание прогресса

Обновлять таблицу после каждого значимого push.

| Дата | Размер app.js | Завершенный срез | Последний push |
| --- | ---: | --- | --- |
| 2026-05-24 | ~17853 | storage, catalog helpers, sync visual, conflict helpers, admin API warning, remote list selector | `d2d436b` |

Формат заметки по срезу:

```text
YYYY-MM-DD | app.js N строк | вынесено X в src/domain/file.js | check/build ok | commit abc123
```

## Критерии готовности

Короткий горизонт:

- `app.js` меньше 15000 строк.
- Новая бизнес-логика больше не попадает напрямую в `app.js`.
- Модули покрывают storage, catalog, sync merge, photos, template copy, backup.

Средний горизонт:

- `app.js` меньше 10000 строк.
- Большинство state/sync/public flows тестируются без DOM.
- UI render islands разделены по экранам и диалогам.

Финальная цель:

- `app.js` в основном отвечает за boot, routing/mode, event binding, controller wiring, save/render orchestration.
- Критичные контракты документированы и защищены тестами.
- Новые баги ищутся по доменным папкам, а не прокруткой гигантского файла.
