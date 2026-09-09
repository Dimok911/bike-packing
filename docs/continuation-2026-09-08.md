# Продолжение очереди и подтверждений API — 2026-09-08

## Актуальная точка — после исходной передачи ниже

Эта секция имеет приоритет над историческим состоянием остального документа.


Итог item photo context: UI4 завершён 26/26, 5,3 мин, exit 0 (session13431).
API2 212/212, 229,61 с. Все процессы завершены. Docs и checklist обновлены.
Срез полностью проверен и готов к scoped local FE/BE commit. Ниже упоминания
выполняющегося UI4 исторические. Три НОВЫХ НЕПОДКЛЮЧЁННЫХ файла сумок
(перечислены ниже) не включать в commit формы вещи.


Продолжение 2026-09-09: галерея принята FE cf92069, API HEAD f80303b.
Текущий незакоммиченный срез — составная форма личной вещи с фото,
formContext.version=1, собственные false gate/capability; полный выбранный
layout, доступность и количество проходят одну прежнюю фото-транзакцию.
FE новый personal-photo-item-form-context.js и тест, app/controller,
form protocol/plan/session/edit/submit, outbox/queue; BE mirror, form,
list-operations/lists API, capability server и тесты. Docs
personal-photo-item-form-context.md и API causal-photo-item-form-context.md.
10 targeted +54 queue, 584 transport (transport-2), 896 critical,
75 BE operations, 74 BE source/service и FE check прошли.
API/MySQL item-photo-context-mysql-2.log: 212/212, 229,61 с, exit 0;
процесс 98675 завершён, disposable MySQL штатно остановлен. Первый прогон
211 total,205 pass,6 fail из-за test expectation GET unknown=404 вместо
200/operation.state=unknown; затем четыре новых paired теста не получили
свой флаг. Исправлен только fixture; дополнительный SQL rollback тест
прошёл во втором полном прогоне вместе с полным набором.
UI2 item-photo-context-ui-2.log: 12/12, 2,3 мин. UI1:6 pass,1 fail,5 notrun:
новый mobile create тест оставлял focus в quantity перед tap; исправлен
blur через существующий submitForm helper, приложение не менялось.
UI3 item-photo-context-ui-3.log завершён: 9 pass, 1 fail, 16 notrun.
Новые composed Chromium прошли; ordinary helper требовал photo-form bundle,
но был собран только photo-edit. Runtime не менялся; повтор UI4 запущен
с modes photo-form,photo-edit, process session13431. Сейчас выполняется:
26 тестов, grep composed item photo|ordinary photo form (container|item)
(create|edit) saves, режим photo-edit. Новые move/fileless delete+quantity/
unplace/lost ACK и регрессия восьми обычных форм. НЕ считать завершённым
до финального выхода; после обновить обе docs и checklist, scoped local
commits FE/BE. Все исходные gates false. Никаких push/publication/Trello.
Далее продолжать ВЕСЬ список, не завершать ответ после этого среза.
Следующий пункт — составные фотоформы сумок. Изучены layout-ops.js,
item-dialog-save.js и app-tail: parent move/lift, root reordering,
new root placement, catalog detached/link, full source subtree. Подготовлены НЕПОДКЛЮЧЁННЫЕ файлы, НЕ включать в item context commit:
FE src/sync/personal-photo-form-layout.js (общая строгая проверка укладки,
пока item module ещё содержит свою прежнюю копию),
src/sync/personal-photo-container-form-context.js и
 tests/critical/personal-photo-container-form-context.test.js.
Первые 4/4 pure проверки прошли: перенос вложенного дерева, подъём в корень,
новая пустая сумка в выбранной колонке и отрицательные условия. Формы, queue,
API и docs сумок ещё НЕ подключены. Пока compiler запрещает existing detached
bag — полный выбранный источник для его дочерних записей остаётся доработкой.
Никаких BE файлов сумок пока нет. CleanupEmptyContainers default
removeTemporary=false; не приписывать обычному parent move автоматическое
удаление группы без проверки конкретного пути. Снимки UI имеют зеркала,
полный business источник и выбранная укладка должны замораживаться явно.

Сейчас: private-owner срез зафиксирован FE 6b08fe5 / BE f80303b.
Галерея 2.4.0 применена и полностью проверена локально. 896 critical,
573 transport и check прошли; gallery-240-ui-1.log: 39 passed, 3 expected
skips (2 desktop-only + Chromium-specific touch delivery в mobile WebKit),
1,6 мин. gallery-240-photo-forms-1.log: 8/8 реальных guest private photo
forms за 2,7 мин. Session 16604 завершена exit 0; все процессы закончены.
Docs experiment-gallery-2.4.0-local.md. После прохода — отдельный FE commit,
дальше составные формы с размещением/доступностью и остальной список.
Галерея сохранена вместе с четырьмя отличиями experimentTransport, общий
fallback точно совпадает с исходным hash. Версия приложения не менялась.
Публикация и push запрещены последним прямым поручением пользователя.

Актуально: guest descendants зафиксированы FE 794dfb3 / BE bb2c6e6.
Следующий срез personal-photo-private-owner полностью проверен:
в FE/BE batch/form/copy/tree/history, плюс прямой API photo mutation.
FE focused 21/21 и transport 573/573; BE focused 17/17 и operations 72/72.
API/MySQL повтор private-owner-mysql-2.log: 206/206, 219,86 с. Первый прогон
203 pass / 3 fail: два новых теста хешировали сокращённый business снимок
истории вместо полного assembled; исправлен только fixture. FE critical
895/895, check exit 0; BE source/service 74/74. Все эти проверки завершены.
UI private-owner-ui-1.log: 8/8 Chromium/mobile WebKit за 2,8 мин.
Session 38540 завершена exit 0. Все процессы закончены.
Docs personal-private-copy-photos.md. Срез принимается отдельно от галереи.
В ignored node_modules/.cache/causal-evidence/2026-09-08/gallery-alignment
подготовлены 7 *.merged файлов из Production v1597→v1602 с сохранением
правок Experiment. Единственный конфликт photo-gallery разрешён: вернуть
experimentTransport.photoUrl + await prepareCachedEntry. Shared fallback
2.4.0 hash 75c45ba0...2e768 проверен; файлы ещё НЕ применены в runtime.
После private-owner commit: проверить сохранность исходников *.ours, перенести
семь .merged и только CSS controlled-paging блок (не сторонний controls grid),
затем critical/transport/browser. Версию приложения/публикацию не менять.
Нижнее описание НЕПОДКЛЮЧЁННЫХ private-owner файлов теперь историческое.

Guest descendants локально приняты, после принятой пары
FE 0ec1ae1 / BE 7fdda7a. photoResults.version=4, собственные false gate
PERSONAL_PENDING_GUEST_UPDATE_ENABLED и capability personalCausalGuestDescendantsV1.
Frontend/backend общие строгие проверки импортов извлечены из прежнего archive
адаптера; отдельные wrappers сохраняют manifest/version/capability каждого.
Подключены outbox/queue/drain/cancel и формы app.js/app-tail (pendingImport).
38 targeted, 568/568 transport, 70/70 API operations, 74/74 source/service и
FE check проходят. 5 новых pure +6 runtime FE, 3 серверных unit.
API/MySQL повтор завершён 204/204, guest-descendants-mysql-2.log, 238,54 с.
Первый прогон: 201 pass / 3 fail (2 guest test + aggregate) из-за тестового
выбора пустой замены при другой существующей укладке. Исправлен точный
nextLayoutId; runtime проверки сохранены. Все API процессы завершены.
UI подготовлено 18 новых Chromium/mobile-WebKit сценариев: pending guest
photo/fileless fields, item/container/layout deletion, quota, lost child ACK,
две отмены. UI1: 7 pass / 1 failed / 42 not run. Photo fields прошли; fileless fixture
пытался терять ACK уже committed import после reload. Обрыв перенесён на
ACK следующей DB правки. UI2: 13 pass / 1 failed / 36 not run: все fields,
deletions/quota/lost child прошли, guest cancel dialog не показывал число
отклонённых действий. Добавлен счётчик в RU/EN. UI3: 13 pass / 1 failed:
cancel работал, но тест ошибочно ожидал отмену уже готового файла. Теперь
проверяет точные IDs только неизвестных частей; ready original сохраняется.
Окончательный UI4: 4/4 targeted cancellation Chromium/mobile WebKit.
UI5: 50/50 за 11,4 мин, guest-descendants-ui-5.log, modes photo-edit,
grep 'pending (archive|guest) descendants|actual guest sign-in'. Все процессы
завершены exit 0; source check повторён после текста окна и прошёл, check-2.
Critical также прошёл 895/895, guest-descendants-critical-1.log.
Для следующего этапа добавлены НЕПОДКЛЮЧЁННЫЕ, не включать в guest-descendant
коммит: FE src/sync/personal-photo-private-owner.js,
tests/critical/personal-photo-private-owner.test.js; BE
src/lib/personal-photo-private-owner.js, test/bike-packing-private-photo-owner.test.js,
test/integration/private-imported-photo-scenarios.js. Первые 3/3 pure проверки
прошли; новые проверки runtime пока не запускались. Predicate использует существующий
hasPrivateSyncBlockedPublicOrigin, сохраняет старые active/admin guards и
различает независимую private provenance от живых public/shared markers.
Есть конкретный вопрос совместимости: guest owner
сохраняет частное происхождение _publicCopySourceId (это проверено
personal-guest-import-owner.test.js), а personalPhotoFormOwner в
src/sync/personal-photo-form-protocol.js сейчас отвергает это поле у previous.
Проверить реальные личные копии из шаблона и последующую правку фото отдельно;
не ослаблять проверки настоящих public/admin/shared владельцев без модели.
Общий UI controller personal-photo-form-controller.js по-прежнему блокирует
placementChanged/availabilityChanged/catalogSource; новые файлы и composed
forms остаются следующим широким срезом, не считать их готовыми по DB forms.

Не включать новые файлы в прежний срез: он уже локально принят и проверен.
Далее продолжать весь список без публикации/push/включения gates.

Из задачи «Исправить прокрутку фото в Safari» получено сообщение про Production
v1602/shared 2.4.0, commit 6c4b03f976007f7f1628e1e1fd59ca93c9716339,
локальный source ftp-upload/safari-v1595/production-source. Его diff прочитан,
но ещё НЕ перенесён и не проверен здесь. Нужна локальная интеграция после
текущего среза; Experiment здесь пока имеет gallery 2.2.1. Новое сообщение
не разрешает публикацию: прямой запрет пользователя остаётся в силе.

Текущее продолжение 2026-09-09: гостевой перенос подключён к реальному
входу app.js и общим store/outbox/queue/staging/drain/cancellation/recovery.
198/198 API/MySQL (guest-wiring-mysql-1.log, 218,65 с); 24/24 Chromium/mobile
WebKit (guest-import-ui-7.log, 2,2 мин); 557 transport, 895 critical, 67 API
operations, 74 source/service и FE check. Все эти процессы завершились exit 0.
Регрессия архивов также завершена: 48/48 Chromium/mobile WebKit,
guest-archive-regression-1.log, 11,4 мин. Этот проверенный срез принимается
локально отдельно от следующей незавершённой работы.

Selection journal сохраняет compact intent до native capture и completion
только по exact committed proof после текущего checkpoint. Это позволяет
восстановить исходный body после compaction и не импортировать handoff снова.
Raw guest workspace/handoff/cache СОХРАНЯЮТСЯ: несколько removeItem не атомарны
с новой гостевой вкладкой. Новая работа не удаляется. Общая политика очистки
остаётся отдельным пунктом 12. Shared Auth не менялся.

Native files → outbox link gap восстанавливается явно из прежнего selection,
intent, base, action, snapshot и байтов; исходный URL больше не нужен. ZIP
после reload включает raw selection journal и все оригиналы. Проверены
частичный stage, lost owner/cancel ACK, native/link quota и более новый guest
workspace. Только известный отсутствующий quantity migration marker=3
сохраняется отдельным DB действием перед выбором guest; остальные diff
по-прежнему блокируются. Полные проверки payload и source не ослаблены.

Следующее: собственные guest descendants
(photoResults.version=4/отдельный gate, без подмены archive resolver),
оставшиеся составные формы/фото, публичные/административные действия и весь
список. Не завершать работу после одного среза. Все release gates false,
публикаций/push/live-миграций нет. Подробности: personal-guest-import.md.

Историческая подготовка (ниже не описывает актуальную подключённость):
Новейшее продолжение — гостевой перенос, 2026-09-09. Подготовка и серверная
часть проверены: 194/194 API/MySQL за 221,90с (guest-import-mysql-1.log),
8/8 IndexedDB Chromium/mobile WebKit за 20,6с (guest-selection-browser-2.log),
543/543 transport, 67/67 API operations-2, 74/74 service/source-2 и FE check.
Проверенная подготовка зафиксирована локально: BE fd95168, FE 633c75f.
Все процессы завершены. Подробности: docs/personal-guest-import.md в обоих
репозиториях. Гостевой UI/общая очередь/очистка ещё НЕ подключены, 09 открыт.
Ничего не публиковать и не push; последний запрос — продолжать весь список
до конца. Не завершать ответ после этого подготовительного среза.

Новые FE source/owner/layout/selection/plan/protocol/files/record модули;
selection-store сохраняет полный выбор в отдельной IndexedDB до файлов,
одинаковый выбор для двух вкладок, immutable UUID/base/source через reload.
Protocol guestImport.version1, kind list.import, false
PERSONAL_GUEST_IMPORT_ENABLED/cap personalCausalGuestImportV1. Полный raw source
сохраняет старый JSON fingerprint: selectionJson = JSON.stringify, канонизация
только для отдельного hash. Именно это исправило первый браузерный failure.
20 новых модульных тестов включены в test:transport, standalone storage spec
включён в mobile-webkit. Существующие guest raw keys/Shared Auth не менялись.

BE содержит 11 зеркал в src/lib/guest-import (+ SHA с нормализацией CRLF),
bike-packing-guest-import.js, отдельный gated handler и cap. Scoped context
теперь передаёт operationId. Общий applyImportedPhotoState извлечён из архива;
archive явно allowArchivedOwners:true, guest false и до этого проверяет ВСЕ
созданные owner/layout ID, включая tombstones/zero-photo. Флаг
BIKE_PACKING_CAUSAL_GUEST_IMPORT_ENABLED зависит от causal+staging+photo,
архивные gates не включают guest. Новые 6 paired API сценариев проходят
полный compile/receipt/restart/reverse child/SQL rollback/cancellation; это
ещё не frontend outbox/UI. Aggregate timeout 240→300с для расширенного набора.
Operations run1 =66/67 из-за audit нового handler, inventory обновлён; run2=67.

Продолжать с подключения FE writer. Новые неподключённые заготовки
personal-guest-import.js и personal-guest-import-outbox-record.js пока не
имеют тестов и не входят в принятый срез. Обычные outbox/store/queue/staging/
drain/cancel/recovery ещё не знают guestImport; app.js не менялся. Нужны exact
receipt+current checkpoint перед consume handoff/очисткой; при изменившемся
гостевом workspace его не очищать. Сначала восстановить selection по handoff,
а не пересоздавать IDs/имена относительно уже изменившейся базы.


Продолжение 2026-09-09: пять DB callbacks зафиксированы в FE `c87f55c`.
Личная история с фото завершена локально: API `47bf753`, 166/166 MySQL
(`photo-history-mysql-3.log`, 197,97 с); 22/22 UI после финального исправления
(`photo-history-ui-3.log`, 5,8 минуты), 491 transport, 895 critical,
60 operation, 74 source/service, FE check. Все процессы API/UI завершены.
`personal-photo-history-restore.md` содержит детали и диагностику первых
прогонов. Новый false gate `PERSONAL_PHOTO_HISTORY_RESTORE_ENABLED` и
server capability `personalCausalPhotoHistoryRestoreV1`. Раздел 8 принят для
личного списка; административная история остаётся в разделе 11.

Архивы без фото теперь приняты локально: 172/172 API/MySQL на Node24.19
(`archive-import-mysql-2.log`, 202,34 с), 10/10 UI Chromium/mobile WebKit
(`archive-import-ui-4.log`, 3,6 минуты), 499 transport, 895 critical,
60 operation, 74 source/service, FE check. См. personal-archive-import.md.
Все процессы завершены. Новый list.import, gate false, три режима, durable
before view, fixed target IDs/names и явное keep-server после отклонения.
Section09 целиком остаётся открытым. Без публикации/push/live/gate enable.

Файловый архив принят локально: 182/182 API/MySQL за 194,34с
(archive-photo-mysql-4.log), 18/18 Chromium/mobile WebKit за 4,8 минуты
(archive-photo-ui-4.log), 514 transport, 895 critical, 60 operation,
74 source/service, FE check-2. Все API/UI процессы завершены. Серверная основа
API df5e7ea и тестовый e402b21; FE b706fff. Оба репозитория
зафиксированы локально. Gates false, no push/publish.

UI исправления: run1 native quota export блокировался getContext с editing
latch. run2 native quota прошёл, queue-link quota потерял memoryForm:
recoveryCopy тоже читал guarded context. Теперь контекст читается без latch;
запись/onCaptured отдельно проверяют assertRunning. run3 cancellation после
lost stage ACK упёрлась в transport barrier. Добавлена строго cancellationOnly
ветка list.import v2 с exact owner/action/asset/photo/fileHash/thumbHash;
обычный dispatch из такой записи по-прежнему запрещён. 18/18 UI и 182/182
API после этих исправлений прошли. См. personal-archive-photo-import.md.

Потомки pending archive приняты локально: 188/188 API/MySQL на Node24.19
archive-descendants-mysql-3.log (222,24с); 26/26 Chromium/mobile WebKit
archive-descendants-ui-2.log (9,3мин). 523 transport-3, 895 critical,
63 operation, 74 source/service, FE check-2. Все процессы завершены.
Документ personal-archive-descendants.md обоих репозиториев; checklist09
обновлён только для конкретного DB среза. Backend commit fd0bea1; frontend 15df2be. Оба зафиксированы локально,
без публикации/push.

FE personal-pending-archive-update.js (false gate/capability
personalCausalArchiveDescendantsV1, photoResults.version3),
personal-pending-archive-form.js (field-only durable session), outbox/queue/
drain/cancellation/recovery, app guards и реальные item/bag forms.
BE bike-packing-archive-result-references.js материализует точные pending
ссылки из original import+immediate parent receipts только в execution body.
Gate BIKE_PACKING_CAUSAL_ARCHIVE_DESCENDANTS_ENABLED false. Явные удаления
owners/layout, fields, fileless owners=[]; отсутствие воскрешения/неявного
удаления в том числе owner без фото; markApplied ребёнка не обходит photo
checkpoint; keep-server решение очищает archiveImport и photoResults.
Экспорт quota формы включает request.binding, automaticImportAllowed:false,
preview с несохранёнными полями и исходный native archive inventory.
UI и API поддерживают потерю ACK и restart, полное сохранение исходных ID/body,
SQL rollback и newer remote. Диагностика первых прогонов в новом документе.

Следующий незавершённый участок — guest handoff. Созданы НЕ импортируемые
runtime src/sync/personal-guest-import-selection.js и отдельный critical test
(НЕ в package; НЕ включать в текущий commit descendants). 3/3 pure теста
прошли: guest-import-selection-2.log. Freeze полного source/base/handoff,
выбранных layouts/names, operationUUID, owner/layout mappings и photo/asset
UUIDs для каждого нового владельца до await (reused owner сохраняет private
photos, не получает guest photos повторно);
повторное использование существующих private records через прежний
planGuestTemplateEntityReuse; shared source mapping между layouts. Gate false.
Это подготовка, не writer/protocol/server/UI адаптер. Нужно ещё общее чистое
проектирование guest import (включая dictionaries, placeholders, metadata,
photo files) и durable handoff identity, paired API+UI/recovery. Нельзя удалять
handoff/workspace до нужной устойчивой записи/подтверждения, делать дубли при
reload или менять Shared Auth. Текущий GUEST_LOGIN_HANDOFF_VERSION = 2.
resolveStoredGuestLoginHandoffCandidate возвращает только candidate, без самого
handoff; payload хранимого handoff нужно явно сохранить для новой операции.

Изученные реальные зависимости гостевого переноса:
- src/public/guest-login-import.js importGuestLocalLayoutsToState: общий idMap,
  planGuestTemplateEntityReuse по выбранным layouts, roots/nested/detached items,
  dictionaries/custom dictionaries, удаление generated target placeholder,
  source-origin metadata, display preferences и нормализация. Legacy layout IDs
  создаются Date.now/Math.random; новый путь должен использовать frozen UUIDs.
- src/public/guest-login-import-flow.js: сейчас consumeHandoff вызывается после
  мутирующего importLayouts до persist. Новый путь требует durable capture до
  view/consume, а clearGuestStorage — только после точного подтверждения.
- app.js importGuestLocalLayouts ~9238 передаёт callbacks, некоторые замкнуты на
  global state. Нельзя подать clone target и оставить такие callbacks: копии
  окажутся в live state. copyPublishedContainerToState ~10267 — wrapper вокруг
  чистого src/public/copy-published-container.js (но allocator внутри Date/Random).
  copyPublishedItemToState ~10290 пока прямо мутирует state. Нужны pure adapters.
- src/public/guest-login-entity-reuse.js: правила reuse по private layouts,
  origin identity + content hash без photos; одна Map между guest layouts.
  stableRecordIds сортирует candidates для выбора reuse, не причинные операции.
- src/state/container-tree-snapshot.js, layout-arrangement.js, dictionaries.js,
  normalize.js/layout-normalize.js; src/backup/restore.js addBackupDictionaryValues.
  Normalizers всех records могут незаметно изменить existing private baseline —
  новый план должен сохранить её точно или остановить несовпадение.
- src/public/copy-public-to-private.js: _publicCopySource* — metadata личной копии,
  не active public origin. Текущий archiveImportPlan privateRecord отвергает
  _publicCopySourceId; нельзя молча стереть provenance ради guest adapter.

Решить до wiring: устойчивый UUID переноса должен пережить clear/consume failure
и завершённый checkpoint, чтобы reload не импортировал ту же guest session под
новыми IDs. Возможный Bike-only importOperationId в сохранённом handoff (сам
Shared Auth не менять), но этот механизм ещё НЕ реализован/НЕ выбран окончательно.
Нужны новая shared pure guest grammar/plan, точный server CAS+receipt и native
files pipeline. Нельзя просто отправить client-final snapshot, изменить существующий
archive source/digest или считать подготовленный selection завершённым переносом.

Потом guest/public origins, sharing/server copy/admin и весь остаток checklist.
Новые/изменённые фотографии и создание/составные формы во время pending archive
пока требуют других адаптеров. Не останавливаться с final после среза: пользователь
велел работать до конца. Публикации, push, live-миграции и gates запрещены.

Новое сообщение Safari source task: Production v1600 опубликован,
app PR13 merge22c0dff33b62f733f78cfa1fa2dcb81d6cff8dbe,
fix20506c879beb0f2ad91bda0236fa7cd512c515f5, finalhead
a15089f65e01548834eb7ae82b0088976de37fad (добавлен sticky fixture fix),
CI34290234469/34290229938 success по сообщению источника. Sharedgallery2.3.0
main ef7a6ea1fd0704ee6e308494bb16c7fff93e8de7, runtimeSHA
5cfb7e78667ecdc375d0d434c44deaf1bef0d1949b10d50dd8e9b9cdf875b2f8.
Здесь НЕ проверено/перенесено. При последующем локальном выравнивании нужны
app adapter + capability + fallback + manifest + CSS; номер Experiment свой.
Физический Safari27beta ещё проверяет пользователь. Наша очередь сохраняется.

Дополнение задачи «Исправить прокрутку фото в Safari»: сообщён выпуск v1599
(PR12, fix cfa222e0891633b42ea1373225db9ad3c3573a18, merge
0e4df10fe9671a3e92f0d2fe7dc56846faa278af). Здесь не проверен и не перенесён.
Последующее сообщение: физический iPhone16ProMax Safari27beta всё ещё блокирует
новый pinch, начатый при докатывании после отпускания пальца. Source task
продолжает решение совместно с Shared Services; v1599 НЕ окончательное
исправление этого жеста. Не публиковать Experiment и не переносить буквально
номер Production. Следующее стабильное дополнение ожидается от source task.

Получено новое сообщение существующей задачи «Исправить прокрутку фото в Safari»
(01a078da-0a8e-73e2-a3fd-d65c71e65e60): Production теперь v1598, исправление
офлайн fullscreen, PR #11, d3eb3d052c5a6c56a79344f2f91722eaa7db6bea, merge
c0862dcb8bd4acf601e9d0021fea84abba3a32d6. Это сведения другой задачи, здесь
ещё НЕ проверены и НЕ перенесены. Учесть при последующем локальном выравнивании
Experiment вместо v1597, сохраняя experimentTransport. Отчёт указан в
C:/Users/user/Documents/GitHub/Dimok911/bike-packing/ftp-upload/safari-v1598/release-report.md.
Приоритет — текущий список; публикация по-прежнему запрещена пользователем.

- Завершён локально item-copy-placement (FE `c73f4b8`, API `aab9df3`): 20/20 UI, 5,3 минуты
  (`item-placement-ui-2.log`); 158/158 API/MySQL, 166,28 с, bundled Node 24.19.0
  (`item-placement-mysql-3.log`). 481 transport / 895 critical / 60 operation /
  74 source/service, source checks. Новый gate false. Полные frozen source/target,
  durable-before-view, копия с фото в корневую/вложенную сумку, pending удаления
  source/copy/target, отмена, lost ACK/restart/replay. Подробности:
  `personal-item-copy-placement.md`. Исправлена серверная проекция двух derived
  placement-полей перед точным сравнением, SQL source/revision guard сохранён.
  Все процессы API/UI/диагностической MySQL завершены.
- Завершены пять personal DB callbacks в app.js: catalog copy, tree
  copy/link/missing, layout deletion, dictionary, placement. Снимок сохраняется
  до изменения state, operationId фиксируется до подтверждения. 39/39 focused,
  481/481 transport, 895/895 critical, 74/74 UI Chromium/mobile WebKit за 13,2 минуты.
  `durable-adapters-ui-1.log`, `durable-adapters-transport-1.log`,
  `durable-adapters-critical-1.log`. Подробности `personal-durable-adapters.md`.
  UI-процесс завершён. API не изменён, последняя приёмка 158/158.
- Следующий участок: полная история с подтверждёнными фотографиями (раздел 8).
  Pure plan `personal-photo-history-plan.js` пока НЕ подключён, 4/4 unit.
  Нужны server preview/execute с точной историей, head/asset/file guards,
  атомарное возвращение/удаление ссылок, outbox и настоящие API/UI проверки.
  Новые два файла не входят в commit DB callbacks. Продолжать без публикации.


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
