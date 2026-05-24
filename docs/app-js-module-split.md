# Разбиение app.js на модули

`app.js` постепенно разбивается на обычные ES-модули. Цель - сделать ошибки в данных и сценариях проще для поиска, при этом оставить runtime-код понятным и предсказуемым.

Подробная дорожная карта и чеклист прогресса лежат в `docs/app-js-refactor-roadmap.md`.

## Направление

- `src/config` - константы приложения, версии, ключи storage/API, feature flags.
- `src/data` - статические словари, demo/shared seed data и простые helpers для угадывания категории/локации.
- `src/utils` - маленькие общие helpers для времени, JSON, HTML escaping, языка, storage, веса и размера payload.
- `src/state` - чистая работа с состоянием: форма state, layout arrangement, normalize/repair/delete/selectors, метрики вещей/контейнеров, derived-поля, диагностика, catalog helpers.
- `src/sync` - API client, history, payload report, фото, serialize, entity sync, merge/conflict helpers, remote list records.
- `src/public` - shared/demo/public/template-copy логика, read-only scope, public-to-private copy, shared layout admin operations.
- `src/ui` - DOM refs, standalone UI formatting/render helpers, dialogs, print, search highlight, visual state controllers.
- `src/storage` - localStorage/session/storage scope, persisted UI/sync settings.
- `src/backup` - backup archive, restore analysis, import/export helpers.

## Рабочее правило

Каждый шаг должен быть маленьким, behavior-preserving и простым для отката.

- Core state helpers не должны знать про DOM, fetch и localStorage.
- Sync code не должен рендерить UI.
- UI code должен получать подготовленные данные и callbacks, а не чинить структуру state.
- `app.js` должен оставаться orchestration layer: взять текущие зависимости, вызвать модуль, показать status/toast, сохранить и перерисовать.

## Следующие срезы

Ближайшие полезные срезы:

- добрать оставшиеся conflict formatting и conflict merge helpers;
- вынести photo upload/copy scope;
- отделить sync save body и merge contracts;
- продолжить public/shared/template-copy source/delete logic;
- вынести layout/item/container operations;
- только потом переходить к крупным render blocks и drag/drop.

UI rendering и drag/drop лучше оставлять ближе к концу: там самые липкие зависимости и критичные touch/click timing контракты.
