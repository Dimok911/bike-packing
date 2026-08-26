# Карта общих API и распределение тестов

Эта карта отличает действительно общий серверный контракт от похожих функций
разных приложений. API считается общим, если один и тот же endpoint и формат
данных используются минимум двумя проектами. Совпадение названия функции без
совпадения endpoint, сессии, прав и payload недостаточно.

## Единые теги

| Тег | Что означает | Подтверждённые потребители |
| --- | --- | --- |
| `shared-api:auth` | Общий magic-link, сессия, `/auth/me` и logout VNIIPO | Bike Packing, OVIK, VDOC/Letters viewer |
| `shared-api:personal-tags` | Персональные теги с изоляцией по общей сессии | Letters и VDOC viewer |
| `shared-api:vdoc-build-snapshot` | Артефакт данных редактора для статической сборки viewer | VDOC Base Edit и VDOC Initial |
| `shared-ui:photo-gallery` | Общий браузерный runtime галереи; это не DB/API фотографий | Bike Packing и OVIK |
| `shared-ui:photo-cache` | Общий offline photo cache engine; это не хранилище фото | Bike Packing и OVIK |
| `app-api:bike-packing` | Собственные списки, сущности, история, шаблоны и фото Bike Packing | Только Bike Packing и его admin-инструменты |
| `app-api:ovik` | Проекты, требования, документы и фото OVIK | Только OVIK |
| `app-api:vdoc-admin` | CRUD, аудит и локальная admin-сессия редактора VDOC | VDOC Base Edit |

Тег указывается в названии integration/E2E-теста или рядом с набором тестов в
матрице. Он позволяет найти все проверки одного контракта обычным поиском, но не
означает, что один и тот же полный DB-тест нужно копировать во все проекты.

## Где должна жить проверка

| Контракт | Полная owner-проверка | Bike Packing | OVIK | VDOC Base Edit / Initial |
| --- | --- | --- | --- | --- |
| `shared-api:auth` | У владельца shared Auth: одноразовая БД, magic-link single-use, cookie/session, expiry, logout, роли и изоляция приложений | Consumer E2E: гость создаёт данные, входит, данные переходят в личную MySQL, открываются в чистом браузере; logout отзывает сессию, `/me` становится гостевым, приватный API возвращает `401` | Consumer E2E: вход, `/me`, allowlist/роль, `401/403`, logout | Viewer: вход и personal scope; Base Edit отдельно проверяет handoff общей сессии в локальную admin-сессию |
| `shared-api:personal-tags` | У владельца personal-tags: CRUD, scope, конфликт и изоляция пользователей | Не используется | Не используется | Consumer contract и пользовательский E2E без повторения DB suite |
| `shared-api:vdoc-build-snapshot` | В VDOC Base Edit: временная MariaDB, relations/order/default и схема snapshot | Не используется | Не используется | Base Edit формирует; Initial валидирует контракт, собирается на fixture и открывает артефакт в E2E |
| `shared-ui:photo-gallery` | В репозитории `vniipo-photo-gallery`: contractVersion/capabilities, сборка, hash и browser gestures | Проверка версии/capabilities, fallback и пользовательской галереи | Та же consumer-проверка на данных OVIK | Только если runtime будет подключён фактически |
| `shared-ui:photo-cache` | В `vniipo-photo-cache-engine`: storage/network unit и isolation | Adapter, namespace, offline/online E2E | Adapter, namespace, offline/online E2E | Не используется |
| `app-api:bike-packing` | В `bikepacking-api`: MySQL, permissions, revision, history, templates и временное photo storage | API contracts и Browser + API + MySQL: upload/read/reload/delete фото, оригинал/thumb, MySQL soft-delete и сохранность файла для 30-дневной истории | Не копировать | Не копировать, кроме явно используемого admin consumer-контракта |
| `app-api:ovik` | В `ovik-project-management`: одноразовая MySQL и временное файловое хранилище | Не копировать | API contracts и Chromium E2E | Не копировать |
| `app-api:vdoc-admin` | В VDOC Base Edit: MariaDB CRUD/audit/auth integration | Не копировать | Не копировать | Base Edit E2E; Initial получает только versioned build snapshot |

## Как подтверждаем, что API общий

Для каждого кандидата фиксируются четыре доказательства:

1. одинаковый production base URL и семейство endpoint;
2. одинаковая схема запроса и ответа;
3. общий способ авторизации, cookie/token и модель ролей;
4. минимум два реальных consumer-вызова в разных проектах.

Если хотя бы контракт данных или права различаются, сервисы не объединяются.
Именно поэтому фото Bike Packing и фото OVIK остаются разными `app-api`, хотя оба
интерфейса используют общие `shared-ui` галерею и offline cache.

## Текущее состояние

- Bike Packing уже помечает реальный гостевой login/import/logout сценарий тегом
  `[shared-api:auth]`; он проверяет Chromium, настоящий API, одноразовую MySQL,
  отзыв сессии, гостевой `/me` и отказ приватного API старому token. Фото в этом же job помечены
  `[app-api:bike-packing]`: общий слой галереи и offline cache остаётся
  `shared-ui`, но серверные photo endpoint принадлежат конкретному приложению.
- В рабочих задачах OVIK, VDOC Base Edit и VDOC Initial уже составлены карты
  owner/consumer-границ. Им передаётся этот набор канонических тегов, чтобы карты
  можно было свести поиском без переименования самих сервисов.
- Следующий общий owner-suite — shared Auth. Его нельзя считать полностью
  консолидированным, пока физически не определён один канонический каталог
  runtime, migrations и release workflow вместо нескольких deployment-копий.
