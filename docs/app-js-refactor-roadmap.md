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
- [x] Conflict formatting: `formatConflictFieldValue`, `formatConflictCountValue`, `conflictValueSummary`.
- [x] Conflict merge pure helpers: `changedComparableKeys`, `comparableValueForMerge`, placement-only delete guard.
- [x] Conflict merge scalar helpers: `mergeStringList`, `mergeScalarField`.
- [x] Conflict merge record helper: `mergeRecordMap`.
- [x] Conflict resolution apply helper: `applyConflictChoices`.
- [x] Conflict merge state helper: `mergeStateFromBase`.
- [x] Photo upload/copy scope helpers: uploadable/unsynced traversal, copy markers, remote photo source parsing.
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
- `isOwnLayoutEchoConflict`

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

Готово в текущем локальном срезе:

- `templateCopyRootSnapshots`, `templateCopySourceScore`, `loadPublishedTemplateCopySource`, template-copy record builders, source/layout resolvers and server confirmation guard moved to `src/public/template-copy.js`.
- shared virtual state creation moved to `src/public/shared-virtual-state.js`.
- template delete guard moved to `src/public/public-template-delete-guard.js`.
- live container tree snapshot/score shared by template copy and draft solidify moved to `src/state/container-tree-snapshot.js`.
- existing container tree link core moved to `src/public/copy-public-layout-target.js`; layout duplicate summary helper moved to `src/public/copy-duplicates.js`.

Планируемые модули:

- продолжить `src/public/shared-virtual-state.js`
- продолжить `src/public/template-copy.js`
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

- `buildCurrentBackupManifest` - moved to `src/backup/archive.js`.
- `backupLayoutRows` - already in `src/backup/restore.js`.
- `summarizeSelectedBackupLayouts` - wrapper over `src/backup/restore.js`.
- `resolveExistingBackupPhotos`
- `prepareBackupPhotosForState`
- `restoreSelectedBackupLayouts` state merge core moved to `src/backup/restore.js`.
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
| 2026-05-27 | 14993 | restored top-of-container move glue required by `src/ui/packing-drag.js`; cache bumped to `v887`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 14979 | packing drag/events, settings drag, horizontal touch scroll, help limits dialog, and published container copy moved to `src/ui/...`/`src/public/...`; cache bumped to `v886`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 16545 | admin/demo/template draft pruning for sync moved to `src/sync/save-body.js`; cache bumped to `v885`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 16643 | built-in default user/demo state moved to `src/data/default-user-state.js`; cache bumped to `v884`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 16981 | unreachable shared render branches and now-unused shared render helpers removed after UI module split; cache bumped to `v883`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 14656 | shared/template virtual layout event binding moved to `src/ui/shared-virtual-events.js`; cache bumped to `v904`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 14771 | published/demo export, admin shared merge, admin demo layout import/repair, dictionary/settings bindings, packing scroll, and layout arrangement apply moved to `src/public/...`, `src/ui/...`, and `src/state/layout-arrangement.js`; cache bumped to `v903`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17117 | items tab and packing board HTML helpers moved to `src/ui/items-view-render.js` and `src/ui/packing-board-render.js`; cache bumped to `v882`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17255 | settings/root-container/dictionary and shared-layout render helpers moved to `src/ui/settings-render.js` and `src/ui/shared-layout-render.js`; cache bumped to `v881`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17450 | photo gallery hydration/lightbox/binding moved to `src/ui/photo-gallery.js`; cache bumped to `v880`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17628 | photo gallery rendering/status helpers moved to `src/ui/photo-gallery.js`; cache bumped to `v879`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17703 | history record article/comparison rendering moved to `src/ui/history-diff.js`; cache bumped to `v878`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17742 | history diff building and diff HTML sections moved to `src/ui/history-diff.js`; cache bumped to `v877`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17927 | conflict formatter wrapper functions collapsed to direct module calls/imports in `app.js`; cache bumped to `v876`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17955 | unreachable conflict placement label branch removed from `app.js`; cache bumped to `v875`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 17999 | unused scope/dictionary/admin demo wrapper functions collapsed in `app.js`; cache bumped to `v874`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18049 | unused public record save helper removed from `app.js`; cache bumped to `v873`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18077 | unused read-only demo load and remote list id refresh helpers removed from `app.js`; cache bumped to `v872`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18119 | unused admin demo/shared entry points and an unreachable startup refresh branch removed from `app.js`; cache bumped to `v871`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18192 | unused sync/container/photo-preview helper wrappers removed from `app.js`; cache bumped to `v870`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18222 | orphan layout copy dialog handler, markup, refs and title helper removed after the live create-layout copy flow stayed on `layoutCopyFrom`; cache bumped to `v869`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18276 | dead shared publish converters and obsolete layout copy/delete wrappers removed from `app.js`; orphan `layoutCopyTargetId` state removed; cache bumped to `v868`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18361 | catalog usage count wrappers moved into `src/state/catalog-lists.js`; cache bumped to `v867`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18364 | catalog list assembly for items/root containers moved to `src/state/catalog-lists.js`; cache bumped to `v866`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18358 | unused demo/shared/drag/readonly helper functions removed from `app.js`; cache bumped to `v865`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18475 | unused catalog/layout helper wrappers removed from `app.js`; cache bumped to `v864`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18505 | visible item layout placement labels moved to `src/state/layout-selectors.js`; cache bumped to `v863`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18517 | unused `placeExistingContainerInLayout`/`detachItemFromContainer` app wrappers removed after their state logic moved to `src/state/layout-ops.js`; cache bumped to `v862`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18547 | delete confirm configs moved to `src/ui/copy-confirm-dialog.js`; dead container wrapper functions removed from `app.js`; cache bumped to `v861`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18563 | item copy state operation moved to `src/state/item-ops.js`; root container duplicate/delete state operations moved to `src/state/container-ops.js`; cache bumped to `v860`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18581 | active layout item/container placement and removal state operations moved to `src/state/layout-ops.js`; project map added in `docs/project-map.md`; cache bumped to `v859`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18654 | item delete state cleanup moved to `src/state/item-ops.js`; root column move and group-from-items state operation moved to `src/state/layout-ops.js`; cache bumped to `v858`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18698 | container delete/cleanup helpers and deep item traversal moved to `src/state/container-ops.js`; layout item-reference touch helper moved to `src/state/layout-ops.js`; cache bumped to `v855`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18732 | item duplicate record builder moved to `src/state/item-ops.js`; recursive container snapshot duplicate records moved to `src/state/container-ops.js`; cache bumped to `v851`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18844 | backup photo restore helpers moved to `src/sync/backup-photos.js`; empty root container duplicate builder moved to `src/state/container-ops.js`; cache bumped to `v849`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18844 | layout-create/edit selectors and builders moved to `src/ui/layout-manage-dialog.js`/`src/state/layout-manage.js`; backup manifest and selected restore state merge moved to `src/backup/archive.js`/`src/backup/restore.js`; backup confirm configs moved to `src/ui/backup-dialog.js`; cache bumped to `v848`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 18900 | template copy/source helpers, template record builders/resolvers, server confirmation guard, container tree snapshot/link helpers moved to `src/public/template-copy.js`, `src/state/container-tree-snapshot.js`, `src/public/copy-public-layout-target.js`, `src/public/copy-duplicates.js`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 19197 | photo upload/copy scope helpers в `src/sync/photo-upload-scope.js` и `src/sync/photos.js`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 19023 | shared virtual state creation moved to `src/public/shared-virtual-state.js`; template delete guard helper in `src/public/public-template-delete-guard.js`; `check`/`build`/`test:critical` ok | local, not pushed |
| 2026-05-27 | 19310 | conflict value formatting в `src/ui/conflict-format.js`, comparable/echo helpers в `src/sync/conflict-merge.js`, state merge helpers в `src/sync/state-merge.js`, save body helpers в `src/sync/save-body.js`; `check`/`build`/`test:critical` ok | local, not pushed |
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
