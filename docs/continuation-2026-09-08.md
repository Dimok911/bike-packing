# Продолжение очереди и подтверждений API — 2026-09-08

## Актуальная точка — после исходной передачи ниже

Эта секция имеет приоритет над историческим состоянием остального документа.

- Завершён локально item-copy-placement (API `aab9df3`): 20/20 UI, 5,3 минуты
  (`item-placement-ui-2.log`); 158/158 API/MySQL, 166,28 с, bundled Node 24.19.0
  (`item-placement-mysql-3.log`). 481 transport / 895 critical / 60 operation /
  74 source/service, source checks. Новый gate false. Полные frozen source/target,
  durable-before-view, копия с фото в корневую/вложенную сумку, pending удаления
  source/copy/target, отмена, lost ACK/restart/replay. Подробности:
  `personal-item-copy-placement.md`. Исправлена серверная проекция двух derived
  placement-полей перед точным сравнением, SQL source/revision guard сохранён.
  Все процессы API/UI/диагностической MySQL завершены.
- Следующий участок уже начат локально: пять старых personal DB callbacks в
  app.js (catalog copy, tree copy/link/missing, layout deletion, dictionary,
  placement) теперь вызывают persistStateSnapshot до изменения state; operationId
  фиксируется до подтверждения. Это ещё НЕ приёмка: адаптированные 39 unit прошли,
  нужны полный transport и реальные UI/quota/lost-ACK регрессии. Следующий этап
  не входит в коммит item-copy-placement. Продолжать без публикации.


- Завершён локально: независимая копия дерева с фото, `copyTree` внутри
  copy-batch. API `45dcd06`, frontend `7cdbc2d`.
  147/147 API/MySQL, 154,49 с, bundled Node 24.19.0; `tree-copy-mysql-6.log`.
  32/32 UI Chromium/mobile WebKit, 6,8 минуты без повторов; `tree-copy-ui-4.log`.
  469 transport / 895 critical / 59 operation / 74 source/service, source checks.
  Gates false. Подробности и диагностика первых прогонов — `personal-photo-tree-copy.md`.
  Исправлены каскад удаления вложенных копий по точному immediate receipt и
  независимость проверки copy от link/missing. Все процессы API/UI завершены.
- Завершён следующий локальный участок: `personal-layout-copy.js` подключён
  к app/outbox до первого await в saveNewLayout. 476 transport; новые unit-
  проверки настоящего adapter/durable/quota, marker cleanup. Документ
  `personal-layout-copy.md`, API `07f6502`. 151/151 API/MySQL, 159,52 с (`layout-copy-mysql-1.log`),
  без skips. UI `layout-copy-ui-1.log`: 24/24 Chromium/mobile WebKit, 4,4 минуты
  с первой попытки (16 новых + прежние link/layout-deletion). 895 critical,
  74 source/service, source checks. Все процессы завершены. Gates false, источник/цель фиксируются до ожидания,
  данные сохраняются до переключения UI. Reconciliation очищает userLayoutCopy
  и старый userContainerTree. Продолжать следующий пункт без публикации.
- Следующий открытый путь найден в `copyItemToContainerInLayout` /
  `duplicateItemToContainerInLayout`: отдельная вещь с фото в выбранную сумку.
  Старый путь выбирает источник/ID после подтверждения и вызывает legacy photo
  copy; нужен frozen personal adapter до окна подтверждения. Полезная основа —
  общий copy-batch/session и pure placement compiler, затем API/UI приёмка.

- Проверен локальный участок: link/missing дерева с подтверждёнными фото.
  FE `8c937b3`, backend `57c0516`.
  Gate `PERSONAL_PHOTO_TREE_LINK_ENABLED = false`, детали `personal-photo-tree-link.md`.
  139/139 API/MySQL за 95,35 с, 458 transport, 895 critical, 74 source/service.
  Source checks прошли. UI `photo-tree-ui-2.log`: 20/20 Chromium/mobile WebKit,
  4,5 минуты, без повторов. Все процессы завершены. Исправлен обход compacted подтверждённого
  предшественника в фото-preflight через проверенный `confirmedBoundary()`.
  Исходные фото не менялись. Временная диагностика остаётся только в test bundle.
  Следующий участок начат отдельно: `personal-photo-tree-copy-layout.js` и
  одноимённый unit-тест (3 passed), пока НЕ подключены и не добавлены в пакет.
  Не включать эти два файла в commit link/missing. Продолжать независимые копии.

- Проверен локально новый участок: удаление до ACK массовой копии.
  FE `8e373a4`, backend `d39d61c`.
  `photoResults.version: 2` хранит полный список владельцев исходного batch,
  включая копии без фото; используются прежние цепочки и серверный resolver.
  Новый gate `PERSONAL_PENDING_PHOTO_COPY_BATCH_DELETION_ENABLED = false`,
  API gate `BIKE_PACKING_CAUSAL_PHOTO_COPY_BATCH_DELETION_ENABLED` unset.
  453 transport, 895 critical, 56 operation, 74 source/service и source checks.
  API/MySQL 137/137, 81,81 с, без skips (`pending-copy-batch-mysql-2.log`).
  UI 28/28 Chromium/mobile WebKit, 9,9 минуты, без повторов во втором прогоне
  (`pending-copy-batch-ui-2.log`). Первый UI-прогон обнаружил сравнение записей
  в нестабильном порядке localStorage; тест сравнивает полный состав по ID.
  Первый API-прогон нашёл boolean-false доступ в отмене (исправлен) и неверное
  ожидание теста о наличии уже compacted записи. Все процессы завершены.
  Новый guard также запрещает возвращать источник с photos:[] прямо в первом
  удалении. Продолжать деревья/укладки; весь список остаётся открытым.

- Завершён локально следующий участок: `photos.mutate/action: copy-batch`, массовые
  каталожные копии вещей/сумок с фото и выбранными владельцами без фото.
  20/20 UI Chromium/mobile WebKit за 6,0 минуты
  без повторов (`copy-batch-ui-1.log`), 449 transport, 895 critical,
  53 operation, 74 source/service, FE/BE source checks прошли. Итоговый
  API/MySQL после исправления отмены: 129/129, 80,71 с, без skips,
  `copy-batch-mysql-4.log`. FE `ce9bdfa`, backend `6a81211`. Все процессы завершены.
  Предыдущие прогоны не считаются приёмкой (ошибка версии тестового владельца,
  неверный валидатор отмены, затем native Node crash 3221226505 до новых тестов).
  Флаги false. Подробности `personal-photo-copy-batch.md`. Продолжить удаление до подтверждения массовой копии,
  затем деревья/укладки и прочие открытые пункты; не останавливаться на срезе.

- Последнее указание пользователя: «публиковать пока не надо.. продолжай работу
  со списком пока не закончишь». Публикация отложена по прямому указанию;
  больше не запрашивать её подтверждение и не запускать deployment.
  Продолжать локальный переход без push и включения рабочих флагов.
- Завершён участок удаления источника/копии при неподтверждённой копии.
  Backend `c377162`; 127/127 API/MySQL за 96,41 с, 48 operation,
  74 source/service. 28/28 UI Chromium/mobile WebKit за 7,6 минуты без повторов,
  444 transport, 895 critical, source checks. Новый gate
  `PERSONAL_PENDING_PHOTO_COPY_DELETION_ENABLED = false`.
  `photoResults` хранит immutable ссылку на исходную форму; все шаги зависят от
  неё и непосредственного предшественника. Сервер разрешает ссылки в частный
  рабочий снимок только после dependency/CAS, не меняя body/hash. Отмена
  оригинала + rejection потомков + отдельное keep-server проверены с lost ACK.
  Исправлены пустые placement-зеркала сумки и UI-only сохранение прежнего
  бизнес-снимка до startup recovery. `personal-pending-photo-copy-deletion.md`,
  логи `pending-copy-ui-2`, `pending-copy-mysql-final`, `pending-copy-transport-5`,
  `pending-copy-critical`, `pending-copy-check-final`, `pending-copy-api-check`,
  `pending-copy-operations`. Все процессы завершены. Trello не обновлён.
  Следующий участок: массовое копирование/деревья/укладки с фотографиями;
  затем архивы, обмен, admin и прочие открытые пункты. Не заканчивать после среза.
- Завершён локальный участок одиночного копирования вещи/сумки с фото вне
  укладки. Backend `0b61d8e`; 117/117 API/MySQL за 96,40 с с отменой,
  44 operation, 74 source/service. 24/24 UI Chromium/mobile WebKit за 6,2 минуты
  без повторов, 440 transport, 895 critical, source check. Новый gate
  `PERSONAL_PHOTO_COPY_FORM_ENABLED = false`. Подробности `personal-photo-owner-copy.md`.
  Логи `copy-ui-2`, `copy-mysql-4`, `copy-transport-final`, `copy-critical`,
  `copy-check`, `copy-api-check`, `copy-operations`. Все процессы завершены.
  Три исправления: атомарный новый владелец + fileless copy; отдельное сравнение
  SQL-источника и зеркал активной укладки; UI-тест удаления теперь выбирает
  реальную карточку каталога. Повторять прошедшие проверки без новых изменений
  не нужно. Trello пока не обновлён из-за ранее установленного сбоя доступа.
- Завершён следующий локальный участок: удаление владельца во время загрузки
  его сохранённой фотоформы. Backend `6c90cf1`; 115/115 API/MySQL за 89,41 с,
  435 transport, 895 critical, source check. 16/16 UI удаления (4,2 минуты) и
  8/8 UI отмены (3,2 минуты), Chromium/mobile WebKit без повторов. Новый gate
  `PERSONAL_PENDING_PHOTO_OWNER_DELETION_ENABLED = false`. Подробности и причины
  исправлений: `personal-pending-photo-owner-deletion.md`, логи `pending-owner-*`.
  Следующий участок — копирование записей с фотографиями; файлы/деревья,
  архивы, обмен и административные пункты остаются открытыми. Не останавливаться
  после этого среза и не объявлять весь список выполненным.
- Следующий проверенный участок: удаление владельца подтверждённых фото.
  14/14 UI за 2,8 минуты Chromium/mobile WebKit без повторов; 421 transport,
  895 critical; 107/107 API/MySQL за 49,97 с, 42 operation, 74 source/service.
  Подробности: `personal-photo-owner-deletion.md`, логи `owner-delete-*`.
  Следующий участок — новые файлы + удаления + порядок в одной форме.
- Этот следующий участок также проверен: смешанные новые файлы/удаления/порядок,
  backend `0784bcb`. 426 transport, 895 critical, 16/16 UI за 5,1 минуты без
  повторов, 110 API/MySQL за 52,24 с, 43 operation и 74 source/service.
  Подробности `personal-photo-mixed-forms.md`; исходный участок удаления владельцев
  сохранён FE `7df50c4` / BE `4fc6496`.
- Новые результаты удаления владельцев НЕ записаны в Trello: задача владельца
  доски сообщила об ошибке sandbox ACL в браузере и отсутствии доступа у
  резервного connector. Последнее подтверждённое обновление карточки —
  `f88a397` и 46/46 UI. Более новые результаты пока сохраняются локально.

- Исходный frontend-срез завершён локальным коммитом `701a8f2`, backend
  `bc579c8`. UI 28/28 Chromium/mobile WebKit без повторов, 415 transport,
  892 critical, 105 настоящих API/MySQL, 41 operation, 74 source/service.
  Диагностика двух браузерных сбоев: `personal-photo-edit-forms.md`.
- Следующее расширение: поля + удаления + перестановка оставшихся фото в одной
  форме. Backend `960a905`: 107/107 API/MySQL, 86,53 с; 42 operation,
  74 source/service. Frontend `98d0fb2`: 418 transport, 892 critical
  и source check прошли. Целевой браузерный пакет **36/36**, 11,1 минуты,
  Chromium/mobile WebKit, без повторов, завершён.
- Общий photo-only batch сохраняет прежние ограничения. Только валидатор формы
  разрешает последовательные удаления и одну заключительную перестановку;
  каждая промежуточная ожидаемая последовательность и квитанция проверяются.
  Параметр разрешения передаётся кодом, не берётся из HTTP-запроса.
- Trello: пользователь прямо подтвердил в этой беседе «Да, передавать
  проверенные статусы». Задача «Посчитать свободные доски Nipo Help» фактически
  сохранила и перечитала карточку 06 с результатами `98d0fb2`/`960a905` и 36/36,
  включая новое смешанное расширение. Карточка открыта, 0/4.
- Завершённые логи: `node_modules/.cache/causal-evidence/2026-09-08/`.
  Новые проверки имеют имена `mixed-*.log`. Не повторять прошедшие проверки
  без новых изменений/ошибок. Не менять runtime, пока браузерный пакет работает.
- Дополнительное поручение пользователя передано из задачи Safari: выровнять
  опубликованный Experiment с Production v1597, сохранив особенности Experiment,
  и опубликовать после проверки. Отдельный запуск `01a07df0-f741-7ca1-a1e8-62d7b5d4b319`
  остановлен и архивирован без изменений; работу выполнять здесь, без субагентов.
  Для этого создан отдельный checkout `node_modules/.cache/experiment-safari-v1597`,
  ветка `codex/experiment-safari-v1597`, кандидат основы `99caff6`. Публичный
  контракт подтвердил v1604 и API `2026-08-30.catalog-review-v1`. Сборка кандидата
  совпала с live по app/styles/sw/contract/manifest после нормализации SVG в LF;
  HTML совпадает полностью, кроме CR-переводов строк. Это подтверждённая основа.
  Материалы `safari-live-base/` в каталоге доказательств. Новые изменения очереди
  из текущего checkout не входят в этот разрешённый выпуск приложения.
- Не передавать повторно, не перемещать и не удалять размещённые фото/их каталоги.
  Текущий deploy-experiment-vps-remote.sh переставляет shared assets, поэтому
  перед выпуском нужен проверенный путь только приложения с неподвижными assets.
  Общая галерея 2.2.1 уже опубликована: использовать её, реализацию не менять.
  Production и API не публиковать. Перенос выполнен в отдельном коммите
  `6ccdc968d338af20a8f9f5b307863b06d17f415a`, ветка отправлена на GitHub после
  повторного push через HTTP/1.1 (первый остановился на сетевом подключении).
  880/880 critical, source check, build, живой API-контракт (68 capabilities),
  57 Chromium + 29 WebKit passed / 6 WebKit skipped. Первый UI-пакет ошибочно
  включал desktop guest-core-flow в мобильный набор; исправлена только область
  запуска, runtime не менялся. CI `34168100805` для точного SHA прошёл:
  880 critical, 5/5 Linux filesystem tests без skips, 86 browser passed / 6 skipped.
  Добавлен `-ApplicationOnly` и отдельный remote entry point: никаких записей
  или перестановок assets, asset hashes + inode, baseline fence + flock, rollback
  при lost activation ACK. Пять Linux filesystem integration tests обязательны
  в CI; локальные Windows skips не засчитываются за их прохождение.
  На VPS проверены нужные утилиты и symlink; assets directory identity
  `64541:1070553`. Все 4846 static assets сборки совпали с live: передавать
  нужно только 23 файла приложения, 4814219 байт. Дополнительный настоящий
  guest-проход собранного приложения: 12/12 превью до листания, 0 photo requests,
  zoom trace 100/100/107/105/100/100/93; WebKit точки 1/0/1, край 1760→1760.
  Проверки/JSON в release-checkout `ftp-upload/verify-v1606/`.
  Сервер всё ещё v1604. Автопроверка отклонила сам запуск deployment до создания
  процесса: в доверенном контексте нет явного user approval на remote deployment.
  Запрошено прямое подтверждение здесь через async-вопрос. Пока оно не получено,
  НЕ повторять публикацию другим способом. Остальная локальная работа разрешена.
- Все ограничения локального эксперимента и выключенные gates сохраняются.
  Исправления Safari также объединены с локальной веткой очереди; конфликты
  версии и конфигурации проверок разрешены с сохранением обоих наборов тестов.
  Проверки объединённого runtime: source check, 418/418 transport,
  895/895 critical и **46/46 UI**, 9,0 минуты, Chromium/mobile WebKit без повторов.
  UI включает 36 сценариев существующих фото и 10 проверок Safari/превью.
  Логи `merged-*.log`; API не менялся после проверенного `960a905`.
  Этот локальный merge не отправлять на сервер вместо отдельного `6ccdc96`.
  Далее остаются формы с новыми файлами и удалением/порядком, удаление владельцев,
  файловая иерархия и остальные открытые пункты checklist. Не объявлять весь
  список завершённым после этого расширения.

## Историческая передача до `701a8f2`

Это точка передачи работы в новую беседу, а не отчёт о завершении. Пользователь
попросил продолжать по всему списку до завершения, разрешил полезные локальные
коммиты и обновления Trello. Новая беседа работает непосредственно в этих же
рабочих каталогах. Старая беседа больше не изменяет файлы и не запускает проверки.

## Область и ограничения

- Frontend: `C:/Users/user/Documents/GitHub/Dimok911/_worktrees/bike-packing-experiment`,
  ветка `experiment/frontend`, HEAD `96c5af5b2d47f92cec7d52023e90b81bdeb42d8a`.
- API: `C:/Users/user/Documents/GitHub/Dimok911/_worktrees/bikepacking-api-experiment`,
  ветка `codex/experiment-catalog-scan-sort-memory`, HEAD
  `2269ec23c9469fa42a4e422fdb3b33a5a72b1970`. На момент передачи API чистый.
- Production НЕ менять. Текущий этап локальный: без push, публикации, live-миграций
  и включения рабочих флагов. Сначала закончить эксперимент и проверки.
- Каталог сумок, Shared Auth и proxy вне текущих изменений. Использование уже
  имеющихся средств авторизации допустимо, изменение общего сервиса — нет.
- Список: `docs/ui-causal-operations-checklist.md`. У него 12 разделов; многие ещё
  открыты. Не принимать готовность модулей или безопасный отказ за готовность UI.
  Админские шаблоны: `docs/admin-template-causal-operations.md`.
- Исходный подробный запрос пользователя доступен без пересказа:
  `C:/Users/user/.codex/attachments/24a44cfc-9c82-445d-8286-f794921da1b9/pasted-text.txt`.
- Смысл защиты: одно устойчивое намерение до отправки, тот же operation ID при
  повторе, точная серверная квитанция, порядок по зависимостям и серверным версиям
  внутри транзакции, tombstone после удаления. UUID и часы не задают порядок.
  Старый SAVE после DELETE не должен восстанавливать объект. Неизвестный исход
  не разрешает новый POST с новым ID. Две новые операции с одинаковыми данными
  не становятся одной автоматически. Не обещать абсолютное отсутствие всех дублей.
- Не запускать параллельные изменения файлов из старой и новой беседы. Не создавать
  субагентов без отдельного разрешения. Пользователю писать по-русски и простыми словами.

## Точная незавершённая точка

В frontend лежат НЕЗАКОММИЧЕННЫЕ изменения: удаление уже сохранённых фото и
изменение их порядка через обычные формы вещей/сумок как одно подтверждаемое
действие вместе с полями. Новые файлы при этом не загружаются. Сохранить изменения,
разобрать diff, не откатывать и не переписывать реализацию заново.

Новые файлы:

- `src/sync/personal-photo-owner-state.js`: SELECT-only чтение точных версий списка,
  владельца и каждого фото; проверка области, полного payload и неизменности контекста.
- `src/sync/personal-photo-edit-form.js`: чистый планировщик и одноразовая сессия
  обычной формы; UUID до ожиданий, сохранение намерения до изменения UI, отдельные
  delete либо order, без новых файлов; при отказе сохраняется черновик восстановления.
- `tests/critical/personal-photo-edit-form.test.js`: 10 тестов, отдельно прошли 10/10.
  Этот файл ЕЩЁ НЕ добавлен в скрипт `test:transport` в package.json.

Изменены app.js, app-tail-controllers, personal-photo-form-{protocol,outbox-record},
personal-save-outbox, personal-photo-recovery-{inventory,cancel},
ui/personal-photo-form-{controller,files}, e2e/personal-save-ui.spec.js и
e2e/personal-ui.vite.config.js. Полный список получить через git status.

Новый `PERSONAL_PHOTO_EDIT_FORM_ENABLED = false`. Остальные source gates также
выключены. Изолированная тестовая сборка `photo-edit` включает новый путь;
старая `photo-form` оставляет его выключенным и проверяет прежние ограничения.
Файловая очередь теперь умеет fileless form с `fileIntentHash: null`: не делает
staging/capture байтов, но сохраняет квитанцию, восстановление и точную отмену.
Одновременные delete+reorder, добавление новых фото вместе с удалением/порядком,
перемещение/копирование/админские фото пока явно запрещены этим узким адаптером.

### Последний прогон: есть сбой, начать с него

Команда завершилась, работающего тестового процесса по этой сессии больше нет:

```text
npx playwright test tests/e2e/personal-save-ui.spec.js --grep 'existing photo.*normal ACK' --max-failures=1 --reporter=line
```

Результат: **7 passed, 1 failed, 4.1 минуты**, без повторов. Ошибка в mobile-webkit:
`existing photo container order is one durable form without upload (normal ACK)`.
В `tests/e2e/personal-save-ui.spec.js:729` ожидался `action.body.action === "form"`,
получено undefined. Это пока не диагностировано: не объявлять ни ошибкой продукта,
ни нестабильностью теста без исследования. Семь других комбинаций прошли.

Материалы сбоя:

```text
test-results/personal-save-ui-existing--b9695--without-upload-normal-ACK--mobile-webkit/error-context.md
test-results/personal-save-ui-existing--b9695--without-upload-normal-ACK--mobile-webkit/test-failed-1.png
test-results/personal-save-ui-existing--b9695--without-upload-normal-ACK--mobile-webkit/trace.zip
```

Фикстура `prepareExistingPhotoEdit` создаёт форму с двумя файлами, синхронизирует,
перезагружает, открывает настоящую форму и удаляет первое фото либо выбирает второе
главным. Затем меняет имя/вес и сохраняет. Возможно, нужно исследовать реальное
состояние выбора/порядок запросов, а не ослаблять проверку результата.

В spec уже добавлены сценарии normal ACK и lost ACK для item/container × delete/order.
Lost ACK ещё не запускались. beforeAll строит четыре изолированные сборки для
каждого браузера: не менять runtime одновременно с этим прогоном. Вывод Vite
очень большой; сохранять полный вывод при необходимости, возвращать компактный хвост.

### Дальше для этого среза

1. Диагностировать и исправить описанный сбой, повторить normal/lost ACK на
   Chromium и mobile WebKit; не ограничиваться повтором, если причина неизвестна.
2. Довести реальные UI проверки quota, устаревшего владельца, неизвестного исхода,
   отмены/отклонения fileless формы. У recovery UI могут оставаться неточные слова
   «отмена загрузки» для удаления/порядка; проверить реальные подписи.
3. Добавить frontend session/outbox/queue/drain → настоящий API/MySQL проверки
   fileless delete/order. Backend обработчик form и SELECT-only reader уже есть.
   Шаблоны: API `test/integration/photo-form-scenarios.js` и
   `personal-photo-batch-scenarios.js`. Вызвать новый helper после включения form gate.
   Создать список и прикрепить два фото, прочитать бизнес-состояние, использовать
   настоящий frontend session и transport; оборвать ответ ПОСЛЕ COMMIT, скрыть GET
   только после POST, перезапустить сервер, восстановить точную квитанцию без второго
   POST и без staging. Проверить раздельные версии владельца/фото, старую операцию
   после DELETE и неизменность данных при отказе. Не подменять это моками MySQL.
4. Добавить новый unit файл в test:transport, сделать пропорциональные регрессии,
   обновить checklist и локально закоммитить проверенные этапы. Продолжать следующие
   открытые пункты, а не объявлять весь список завершённым после фото.

## Проверенная база (не смешивать с новыми результатами)

- Front runtime `1f2b720`, docs HEAD `96c5af5`: полный предыдущий браузерный прогон
  ЗАВЕРШЁН: 403 passed / 7 skipped из 410, 31.9 минуты, Chromium/mobile WebKit.
  В старых документах он местами ещё обозначен как запущенный — исправить запись.
- Предыдущая база: frontend 405 transport, 892 critical, source check.
- В текущем незакоммиченном срезе отдельно прошли `npm run check`, прежние 405
  transport и новые 10/10 unit. Полного browser/critical для новых правок ещё нет.
- Backend `2269ec2`: read-only photo-owner-state и capability
  `personalCausalPhotoOwnerStateV1`, личная область, существующий gate публикаций.
  Предыдущий реальный API/MySQL прогон 101/101, 54.38 секунды; 41 operation,
  74 source/service. Backend в этом незавершённом срезе не менялся.
- Все flags false, ни публикации, ни push в данном этапе не было.

Локальный API/MySQL запускать из FRONT cwd после прочтения скрипта:

```powershell
try { & ./scripts/test-causal-with-local-mysql.ps1 } catch { Write-Output $_.Exception.Message; exit 1 }
```

Скрипт создаёт одноразовую MySQL в node_modules/.cache, проверяет datadir и штатно
останавливает её. Не трогать другие MySQL. На момент передачи тест завершён,
известного работающего одноразового сервера нет. Не скрывать русские ошибки PowerShell
фильтром только на английские слова.

Есть отдельный НЕИСПРАВЛЕННЫЙ intermittent crash локального Node v24.15.0 при restart:
exit 3221226505, затем ECONNRESET/REFUSED. Последующий успешный 101/101 не доказывает
исправление. API mysql-api-smoke.test.js уже сохраняет pid/exit/signal и хвост логов
при неожиданном выходе. Причина неизвестна; не лечить это повторной отправкой POST.

## Trello и оставшиеся этапы

Пользователь разрешил передавать проверенные статусы в существующую задачу
**«Посчитать свободные доски Nipo Help»**, thread
`01a077d6-1d59-7132-a6d8-db77366878d7`, host `local`.
Она уже подтвердила обновление всех 12 существующих карточек без дублей на
https://trello.com/b/R5TWgZBL . Предыдущая блокировка передачи снята явным «да»
пользователя. Передавать новые результаты через send_message_to_thread и ждать
подтверждения компактным wait_threads, не объявлять доску изменённой до ответа.
Незакоммиченный текущий срез ей ещё не отправляли.

Карточки 01–12: JJRbg6T7, lgLvqCb8, NkQB0oCu, voxQLSa8, gskKJYy1, 48lvLZ4w,
ZjpdbF7s, elECI2RJ, PGFBho4N, fu33adHP, 0iuirjQv, DljX4QEK.
Формат ссылки: https://trello.com/c/<id>. Не создавать заменяющие карточки.

Остаток шире текущего фото-среза: большие/повреждённые журналы, файловая иерархия,
массовое копирование, формы с размещением и файлами, словари, смешанные операции фото,
копии между списками/шаблонами, история с файлами, архивы/гостевой перенос, snapshot/live
sharing и импорт, административные операции (пока inventory, 0/10), generic user-data,
политика хранения/GC и финальная проверка обоих маршрутов и физического телефона.
Полный перечень и критерии закрытия — в checklist; безопасный запрет старого обхода
не означает, что соответствующее пользовательское действие уже реализовано.

## Технические рабочие договорённости

- GitHub CLI установлен и авторизован как Dimok911; не выводить токены. При
  недоступном PATH использовать `C:/Program Files/GitHub CLI/gh.exe`. Сетевой отказ
  sandbox не трактовать как необходимость заново логиниться.
- Для API git требуется command-local
  `-c safe.directory=C:/Users/user/Documents/GitHub/Dimok911/_worktrees/bikepacking-api-experiment`.
  Git metadata worktree вне writable корней: при необходимости запросить штатное
  повышение разрешений для scoped git add/commit. Не менять global safe.directory.
- Правки через apply_patch, сохранять незакоммиченные изменения. Коммитить явные
  проверенные файлы, не использовать reset --hard или git add . вслепую.
- Если позднее будет отдельно разрешена публикация: только проверенный скрипт
  проекта и curl explicit FTPS vniipo-help.ru:21, TLS, passive, pinned public key,
  fallback 88.212.206.188, credentials из ignored .vscode/sftp.json только через
  UTF-8 stdin config. Directory swap, проверка хэшей, backup/rollback. Это описание
  правил, НЕ разрешение публиковать сейчас.
