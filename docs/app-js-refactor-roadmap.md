# App JS refactor roadmap

Цель: превратить `app.js` в тонкий сценарный entrypoint: старт приложения, связывание UI, текущий экран, вызовы модулей и сохранение. Бизнес-правила, нормализация, выбор источников, форматирование, sync/storage и публичные шаблоны должны жить в `src/...`.

Документ нужен как рабочая карта: что уже вынесено, что будет выноситься дальше, как проверять прогресс и где быть особенно осторожным.

## Текущее состояние

На 2026-05-24 `app.js` после серии безопасных срезов: около `17853` строк.

Уже вынесены или расширены домены:

- `src/storage`: active choice, UI settings, UI language, sync device, sync meta, auth/scope helpers.
- `src/state`: catalog filters/search/sort/usage, record meta, record-derived, layout selectors/ops/manage/delete/normalize/collapse, diagnostics, repair, metrics.
- `src/sync`: admin API compatibility warnings, remote list record selector, conflict meta fields, API client, entity sync, photos, service worker, serialize, history.
- `src/ui`: sync visual state, conflict/date formatting, layout load status, item display/format, dialogs, print, search highlight, packing 3D.
- `src/public`: shared layouts, demo layout choice, template copy, public-to-private copy, admin shared layout operations.

Важно: размер production bundle может временно не уменьшаться, потому что это исходная модульность, а не code splitting. Главная метрика сейчас: меньше бизнес-логики в `app.js`, яснее границы ответственности, проще искать баги.

## Правила каждого среза

- Один срез = один смысловой слой, который можно быстро проверить и откатить.
- В `app.js` оставлять wrapper/orchestration: взять зависимости из state/UI, вызвать модуль, показать статус, сохранить.
- В `src/state` не передавать DOM/fetch/localStorage.
- В `src/ui` не решать API-контракты и не чинить state-структуру.
- В `src/sync` держать сеть, payload, serialize, conflict/sync helpers, но не рендер.
- В `src/public` держать shared/demo/template identity, copy/delete/publish-adjacent правила.
- Любой новый `src/...` файл добавлять в `npm.cmd run check`.
- Если изменен runtime/frontend-visible код: bump `APP_VERSION`, `index.html`, `sw.js`, затем `npm.cmd run check` и `npm.cmd run build`.
- Если затронут `CRITICAL:` или flow из `docs/critical-flows.md`: дополнительно `npm.cmd run test:critical`.
- Коммитить небольшими именованными checkpoint-ами; после пачки успешных коммитов пушить `main`.

## Карта ответственности

Идеальная конечная роль `app.js`:

- инициализация refs/controllers;
- маршрут/режим экрана;
- связывание DOM событий;
- получение текущего state/scope/user;
- вызов профильных модулей;
- save/render/toast/status;
- минимальные compatibility wrappers для постепенного перехода.

Модули:

- `src/config`: версии, ключи, endpoints, feature flags.
- `src/storage`: localStorage/session/storage scope и persisted UI/sync settings.
- `src/state`: чистые операции над состоянием, layout arrangement, catalog, dictionaries, delete/normalize/repair/metrics.
- `src/sync`: API, upload/copy photos, entity sync, merge/conflicts, remote records, serialize, payload diagnostics.
- `src/public`: shared/demo/public/template-copy contracts.
- `src/ui`: standalone render/format/dialog/controllers, без API-контрактов.
- `src/backup`: backup archive/restore analysis/import helpers.
- `src/utils`: маленькие generic helpers.

## Roadmap

### Phase 1. Закрепить уже начатые безопасные зоны

Цель: быстро добрать рядом лежащие чистые helpers, чтобы не оставлять половинчатые домены.

- [x] Storage: UI settings/language, sync device/meta.
- [x] Catalog: usage, sort, filters, field search.
- [x] Sync visual UI: help text, state resolver, DOM apply helper.
- [x] Conflict formatting: version stamp, changed fields, arrangement summary.
- [x] Sync list records: choose richer remote record.
- [ ] Conflict formatting: `formatConflictFieldValue`, `formatConflictCountValue`, `conflictValueSummary`.
- [ ] Conflict merge pure helpers: `changedComparableKeys`, `comparableValueForMerge`, scalar merge helpers.
- [ ] Catalog wrappers cleanup: reduce remaining tiny wrappers once call sites are clear.

Suggested target modules:

- `src/ui/conflict-format.js`
- `src/sync/conflict-merge.js`
- `src/state/catalog-selectors.js` if catalog wrappers grow beyond filters/search/sort.

### Phase 2. Sync merge and remote state

Цель: отделить merge/sync contracts от UI and app lifecycle.

Candidate functions from `app.js`:

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

Planned modules:

- `src/sync/state-merge.js`: pure three-way merge and conflict choice application.
- `src/sync/conflict-format.js` or keep UI text in `src/ui/conflict-format.js` and pure conflict data in `src/sync/conflict-merge.js`.
- `src/sync/save-body.js`: remote/list save request body building.

Checks:

- `npm.cmd run check`
- `npm.cmd run build`
- `npm.cmd run test:critical` if sync-save behavior changes.

### Phase 3. Photos and upload scope

Цель: убрать из `app.js` правила выбора фото для upload/copy/reupload.

Candidate functions:

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

Planned module:

- расширить `src/sync/photos.js` или добавить `src/sync/photo-upload-scope.js`.

Risk:

- Offline photos are critical. If behavior changes, run `npm.cmd run test:critical`.

### Phase 4. Public/shared/template copy zone

Цель: `app.js` должен только запускать пользовательский сценарий copy/delete/publish, а identity/source/dedup/restore должны быть в модулях.

Candidate functions:

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

Planned modules:

- продолжить `src/public/shared-virtual-state.js`
- `src/public/template-copy-source.js`
- `src/public/shared-template-delete.js`

Checks:

- `npm.cmd run check`
- `npm.cmd run build`
- для template copy/delete: свериться с `docs/critical-flows.md`; при изменении контрактов запускать `npm.cmd run test:critical`.
- Если API затронут: отдельно backend check/commit/push.

### Phase 5. Layout/item/container operations

Цель: операции создания, копирования, удаления и перемещения должны жить в state modules; `app.js` оставляет confirm/toast/render/save.

Candidate functions:

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

Planned modules:

- `src/state/item-ops.js`
- `src/state/container-ops.js`
- possibly extend `src/state/layout-ops.js` and `src/state/layout-delete.js`.

Risk:

- Touch/drag timing is critical, but pure layout operations are safer than pointer handlers.
- Keep DOM drag/drop code out of this phase.

### Phase 6. Backup/import flow

Цель: backup import orchestration in `app.js`, analysis/summary/photo preparation in modules.

Candidate functions:

- `buildCurrentBackupManifest`
- `backupLayoutRows`
- `summarizeSelectedBackupLayouts`
- `resolveExistingBackupPhotos`
- `prepareBackupPhotosForState`
- `restoreSelectedBackupLayouts`
- `restoreFullBackup`

Planned modules:

- extend `src/backup/archive.js`
- extend `src/backup/restore.js`
- maybe `src/sync/backup-photos.js` for server photo resolve.

Checks:

- `npm.cmd run check`
- `npm.cmd run build`
- manual backup import/export smoke if UI behavior changes.

### Phase 7. UI rendering islands

Цель: переносить крупные render blocks только после state/sync/public helpers, потому что UI has sticky dependencies.

Candidate islands:

- summary rendering;
- items list rendering;
- bags/settings/layout editor;
- dictionary editor;
- item/root container dialogs;
- backup dialog orchestration;
- shared mode banners and shared packing.

Planned modules:

- `src/ui/summary.js`
- `src/ui/items-view.js`
- `src/ui/root-containers-editor.js`
- `src/ui/dictionaries-editor.js`
- `src/ui/item-dialog.js`
- `src/ui/root-container-dialog.js`

Rule:

- UI modules receive prepared data and callbacks.
- UI modules should not normalize backend payloads or decide sync contracts.

### Phase 8. Drag/drop and pointer interactions last

Цель: оставить самую хрупкую область на конец, когда state operations are already clean.

Candidate functions:

- pointer drag binding;
- root column drag;
- board/fixed scrollbar;
- nested group hover/open timings;
- drop target calculation.

Risk:

- `touch-click-timing` is critical.
- Do not change timing constants without direct regression reason.
- After touching: `npm.cmd run test:critical`, `npm.cmd run check`, `npm.cmd run build`, plus manual mobile/touch smoke.

## Progress tracking

Update this table after each meaningful push.

| Date | App size | Completed slice | Last pushed commit |
| --- | ---: | --- | --- |
| 2026-05-24 | ~17853 | storage, catalog helpers, sync visual, conflict helpers, admin API warning, remote list selector | `d2d436b` |

Suggested per-slice note format:

```text
YYYY-MM-DD | app.js N lines | moved X to src/domain/file.js | check/build ok | commit abc123
```

## Definition of done

Short-term done:

- `app.js` drops below 15000 lines.
- New business logic no longer lands directly in `app.js`.
- Existing modules cover storage, catalog, sync merge, photos, template copy, backup.

Medium-term done:

- `app.js` drops below 10000 lines.
- Most state/sync/public flows are testable without DOM.
- UI render islands are separated by screen/dialog.

Final target:

- `app.js` is mostly boot, routing/mode, event binding, controller wiring, save/render orchestration.
- Critical contracts are documented and backed by tests.
- New bugs can be searched by domain folder instead of scrolling a giant file.
