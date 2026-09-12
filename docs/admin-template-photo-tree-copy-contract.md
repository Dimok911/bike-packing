# Чистый контракт копирования дерева с фотографиями

Подготовка следующего среза карточки 3. Реализованы строгий parser, производная raw-проекция, обязательства stage и отдельная чистая проверка stage/terminal квитанций. Это **не готовая операция копирования дерева**: нет HTTP/SQL/FS/IDB/transport/UI и активации. Чистый validator проверяет согласованность документа с исходной командой; он сам не получает authenticated ответ и не проверяет настоящие файлы или права.

Foundation: `src/sync/admin-template-photo-tree-copy-protocol.js`, одноимённый critical test и `tests/fixtures/admin-template-photo-tree-copy-fixture.js`. Следующий отдельный pure слой: `src/sync/admin-template-photo-tree-copy-receipt.js`, `tests/critical/admin-template-photo-tree-copy-receipt.test.js` и `tests/fixtures/admin-template-photo-tree-copy-receipt-fixture.js`. Общий parser, `photoCopy v1`, V8, upload/create/edit/replace и BE этим FE срезом не меняются. Gate `ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED=false`; capability name `adminTemplatePhotoTreeCopyV1` только объявлен, нигде не рекламируется.

## Законченная граница

Один **размещённый корень** и всё его arrangement-замыкание из одного подтверждённого PRIVATE административного шаблона в явную корневую позицию другого подтверждённого PRIVATE шаблона. Только demo/shared bindings. Числовые положительные source/target revisions, разные list IDs. PRIVATE и права — обязательные будущие server observations; клиентский JSON сам их не доказывает.

Источник структуры — `source.payload.layouts[source.layoutId].arrangement`. Корень входит в оба согласованных root arrays. Обход проверяет child/item/order, точные `{type,id}` entries, обратные ссылки, уникальность посещения и положительные целые arrangement quantities. Полный shared raw inventory дополнительно проверяет другие деревья, mirrors и отсутствие новых IDs. Каталожный/вложенный исходный корень, существующий target parent, link, pending source/base, personal/public, whole-template copy и новая форма исходника не поддерживаются.

Включаются все владельцы замыкания, даже без фотографий. До **100 владельцев суммарно**, **32 уровней сумок** (корень — уровень 1), **1..50 фотографий суммарно**, wire до 3 MiB. Получатель unlocked, insertion index — целое `0..targetRoots.length`, без clamp. Дерево не делится на отдельные saves при превышении границ. Items с отсутствующим status, `null`, `""`, `"available"` допускаются; lost/broken/retired и неизвестные статусы не получают разрешения на размещение через нормализацию.

## Exact body

Внешний `adminTemplatePhotoTreeCopyIntent` принимает обычный binding `{environment,actorId,operationId,kind:'template.save',itemKey,listId,body}` и возвращает detached frozen intent с `id`. Он использует существующий parser только для обычной части и отдельно проверяет весь tree body. Наличие другого feature/source поля запрещено.

```js
body = {
  version: 1,
  base: { stateRevision: targetRevision },
  payload: exactOriginalTargetPayload,
  metadata: { title, description, language },
  photoCopy: {
    version: 2,
    source: {
      itemKey, listId, base: { stateRevision: sourceRevision },
      payloadDigest, payload: exactOriginalSourcePayload,
      layoutId, rootId
    },
    placement: { layoutId: targetRawLayoutId, index },
    fields: { name, createdAt, updatedAt, updatedByDeviceId, updatedByDeviceName },
    owners: [{
      entityType: 'container' | 'item', sourceEntityId, entityId,
      photos: [{ sourcePhotoId, photoId, assetId, assetDigest }]
    }]
  }
}
```

`owners` — точное замыкание, сортировка обычным JS строковым сравнением ключа `entityType + ':' + sourceEntityId`: containers, затем items, внутри source ID; locale sorting запрещён. `photos` — все фото владельца в исходном raw порядке, пустой массив допустим. Все IDs выдаются до асинхронной подготовки и сохраняются вызывающим слоем. Модуль IDs не создаёт. Owner IDs отсутствуют в source/target items, containers и layouts, включая detached records, и уникальны между новыми владельцами. Новые photo IDs — ASCII; они уникальны глобально среди новых фото и не заняты ни в одном исходном inventory. Asset IDs — UUIDv4, уникальны, не совпадают с parent operation UUID и существующими raw asset IDs. SQL absence, включая tombstones/opposite-type/deleted rows, остаётся отдельной серверной обязанностью.

Неизвестные owner/business/arrangement поля сохраняются. Известные неподдержанные placement aliases (`parentContainerId`, item с container-only structural fields, container с `containerId`) отклоняются. Selected photo metadata использует без ослабления существующий `adminTemplatePhotoCopyReference`: неподдержанный ключ отменяет весь выбор. Неподдержанные photo metadata вне выбранного дерева остаются raw и не копируются.

## Нет круговой зависимости хешей

`adminTemplatePhotoTreeCopyCommitment(intent)` возвращает exact объект:

```js
{
  version: 2, kind: 'admin-template-photo-tree-copy', environment, actorId,
  templateOperationId,
  source: { itemKey, listId, baseStateRevision, payloadDigest, layoutId, rootId },
  target: { itemKey, listId, baseStateRevision, payloadDigest },
  placement, fields,
  owners: [ /* полное owner mapping; photos содержат все поля КРОМЕ assetDigest */ ]
}
```

Source hash перепроверяется по полному source payload; target hash вычисляется по полному target payload. `treeDigest` — SHA-256 UTF-8 `canonicalAccessJson(commitment)`. Owner без фото тоже связан этим обязательством. `adminTemplatePhotoTreeCopyStageManifests` выдаёт ordered manifest на каждое фото:

```js
{
  version: 2, kind: 'admin-template-photo-tree-copy', environment, actorId,
  operationId: assetId, templateOperationId, treeDigest,
  source: { itemKey, listId, baseStateRevision, payloadDigest, layoutId, rootId,
    entityType, entityId: sourceEntityId, photoId: sourcePhotoId, referenceDigest },
  target: { itemKey, listId, baseStateRevision, payloadDigest,
    entityType, entityId, photoId }
}
```

`referenceDigest` хеширует полный raw selected photo. `assetDigest` — canonical SHA-256 всего manifest. Можно построить body с 64 нулями в assetDigest, вычислить manifests и их hashes, затем создать окончательный immutable body. `assertAdminTemplatePhotoTreeCopyIntentDigests` перепроверяет все настоящие hashes; grammar/проекция сами асинхронные hashes не подтверждают. Никаких input-byte hashes, пришедших от клиента materialization paths или owner IDs в manifest нет.

Грамматически правильный `treeDigest` на stage — только обязательство. Сервер stage должен подтвердить обе версии/права, selected source owner/photo и содержимое файла; финальный save должен пересчитать обязательство из всей команды. Один совпавший присланный digest не доказывает ни полноту дерева, ни существование файлов.

## Точная проекция

`adminTemplatePhotoTreeCopyPayload(intent, addedOwners)` принимает ordered array:

```js
[{ entityType, sourceEntityId, entityId,
   added: [{ assetId, assetDigest, sourcePhotoId, photo: canonicalNewReference }] }]
```

У photo-free владельца `added:[]`. Canonical new reference имеет ровно `{id,photoId,assetId,listId,status:'synced',url,thumbUrl,fileName,type,size,width,height}` плюс **ровно те** `createdAt`/`updatedAt`, которые имел raw source photo, с точными значениями, включая null. Старые URL aliases не переносятся; URL должен ссылаться на ожидаемые list/photo/file-or-thumb route. Проверка trusted origin и соответствия реальным stored bytes здесь отсутствует намеренно: это derivation, а не авторизация произвольной квитанции.

Проекция клонирует старый target. Для новых владельцев клонирует исходную raw row, заменяет ID, creation/edit fields, photos и только известные structural links. `fields.name` заменяет только имя корня. Raw item.quantity и opaque string IDs не переписываются. Quantity размещения берётся из source arrangement. Source placement opaque переносится на новую arrangement entry, raw row opaque — на новую row; они не смешиваются. Отсутствующее исходное `photos` у владельца без фото остаётся отсутствующим.

Новый root вставляется по index в layout и arrangement root arrays; существующие target owners, dictionaries, opaque data, packed maps и metadata layout не меняются. Новые items отсутствуют в packed map. После удаления новых rows/arrangement entries/root из результата получается исходный target целиком. Весь source остаётся неизменным. `assertAdminTemplatePhotoTreeCopyProjection` сравнивает весь payload, а не только IDs или самостоятельно пересчитанный hash. Projection ceiling — 4 MiB.

## Exact stage receipt и полная проверка пакета

Known HTTP stage envelope имеет ровно следующие поля, без дополнительных ключей:

```js
{ ok:true, assetState:'ready' | 'unavailable', receipt:{
  version:2, kind:'admin-template-photo-tree-copy',
  manifest: exactTreeManifest, assetDigest,
  sourceOwnerId, ownerId, baseEntityRevision:0,
  sourceStored:{
    file:{hash,size,type,fileName,width,height}, thumb:{hash,size,type}
  },
  stored:{
    file:{hash,size,type,fileName,width,height}, thumb:{hash,size,type}
  },
  materialization:{version:1,
    source:{filePathDigest,thumbPathDigest},
    target:{filePathDigest,thumbPathDigest}
  }
} }
```

Оба Stored объекта canonical-equal целиком: копирование не меняет bytes и metadata. Hash — lowercase SHA-256 реальных bytes, size — safe integer 1..10 MiB **на каждый original/thumb**, mime jpeg/png/webp/gif/heic; dimensions positive safe integer или null. FileName непустое <=255 без separators/controls. Owner IDs trimmed 1..36 символов без controls; это владельцы соответствующих list rows, не entity IDs и не обязательно actor. `materialization.version:1` — версия существующего алгоритма path commitment, не версия копирования. Каждый path token — hash(canonical(lowercase storage-relative path string)). Source/target strings не принимаются в receipt вместо tokens.

`validateAdminTemplatePhotoTreeCopyStageReceipt(data,{manifest,assetDigest})` проверяет exact tree grammar, expected manifest/hash, stored equality и независимость путей своей пары. `validateAdminTemplatePhotoTreeCopyStages(intent,wrappers)` заново выводит все manifests из полного intent и проверяет ordered пакет целиком. Нет принятия v1-copy/create/upload вместо tree, перестановки или частичного набора.

Global source-path map связывает каждый token с physical `{hash,size,type}`; разные сведения для одного source path запрещены, даже между разными владельцами. Global target-path set не пересекается ни с одним source path или target другого stage. File и thumb могут иметь общий путь **внутри одного stage** только при точном совпадении physical metadata. Одинаковые bytes в независимых путях допустимы. Общая пара sourceOwnerId/ownerId одинакова для всех stage receipts; при этом равенство обоих владельцев actor не требуется и не запрещается.

`assetState:'unavailable'` сохраняет историческую квитанцию и её proofs, не становится ready. Это позволяет прочитать уже совершённый commit, когда стадия более недоступна. Ни single-stage validator, ни aggregate validator не являются допуском к новой записи: write требует current server/FS проверки и ready assets. Unknown/pending/null stages не проходят aggregate committed proof.

## Exact terminal receipt и доверенные URL

`validateAdminTemplatePhotoTreeCopyReceipt` принимает внутреннее `{operation,result}`. HTTP adapter обязан отдельно проверить ровно `{ok:true,operation,result}`, прежде чем убрать outer ok. Внутренний committed документ:

```js
{ operation:{
  id, environment:'bike-packing-experiment', actorId, listId, itemKey,
  kind:'template.save', payloadDigest, state:'committed'
}, result:{ status:200, payload:{
  ok:true, listId, itemKey, stateRevision:targetBase+1,
  visibility:'private', indexes:[],
  photoCopy:{version:2,sourceOwnerId,ownerId,rootId,
    owners:[{entityType,sourceEntityId,entityId,
      added:[{assetId,assetDigest,sourcePhotoId,photo:canonicalNewReference}]}],
    confirmedPayload,confirmedPayloadDigest
  }
} } }
```

Exact rootId — target ID исходного корня. Owners/added должны полностью и по порядку соответствовать intent, включая photo-free owners. Полный projected payload сравнивается canonical с confirmedPayload, затем проверяется confirmedPayloadDigest; каждое новое photo fileName/type/size/width/height совпадает с соответствующим stage.stored.file. Raw timestamps совпадают с source photo. Outer payloadDigest хеширует **полный intent без id**, не projected payload. Внешние actor/list/itemKey/kind/id совпадают с intent, revision ровно base+1. Полная внутренняя terminal receipt ограничена **4 MiB**, включая operation/result, а не только photoCopy. Отдельная result structure проверка — только синхронная grammar/projection; полный async result/receipt validator обязателен для hashes, stages и URL policy.

Точный relative URL: `/letters-vniipo/api/bike-packing/lists/{encodedListId}/photos/{encodedPhotoId}/{file|thumb}`. Допустимые absolute bases совпадают с нынешним v1 client:

- `https://api.vniipo-help.ru/experiment/letters-vniipo/api`
- `https://api-eu.vniipo-help.ru/experiment/letters-vniipo/api`
- `https://experiment.vniipo-help.ru/letters-vniipo/api`
- `https://api.vniipo-help.ru/letters-vniipo/api`

К base добавляется ровно тот же `/bike-packing/lists/...` suffix. Bare `/bike-packing/...` из старой pure projection fixture, произвольный host/prefix/port, protocol-relative URL, query и fragment не принимаются. Валидатор ничего не переписывает: разрешение relative URL через browser location изменило бы raw confirmed hash. Проверяются только новые фото, прежние raw references получателя остаются неизменными.

Rejected terminal fact имеет exact outer identity и result `{status:403|404|409,payload:{ok:false,code}}`. Только `operation_cancelled` требует status409 и дополнительный exact `cancellation:{version:1,operationId:id,noBusinessEffects:true,operationCannotApply:true}`. Полный intent и stage commitments перепроверяются и при отмене, но неизвестные/недостающие stage receipts не мешают подтвердить факт отмены. Такой ответ сам не является parent-fence certificate или правом удалить bytes. Unknown save, waiting и слабая отмена не принимаются как terminal. Late committed требует полного historical stage proof, даже если ранее отправлялась отмена.

Exports нового module: single stage/stages validators, `validateAdminTemplatePhotoTreeCopyResultStructure`, async `validateAdminTemplatePhotoTreeCopyResult` и async `validateAdminTemplatePhotoTreeCopyReceipt`. Входные documents/intent/stages копируются до первого await. `sourceOwnedBytes` как доверенный client boolean нигде не существует; дополнительные поля отклоняются.

## Полная постоянная запись

Отдельный `admin-template-photo-tree-copy-record.js` уже реализован как локальный codec. Exact snapshot `{version:1,source,target,copiedOwners}` сохраняет обе полные редакторские проекции, исходные owner maps и полный ordered список `{entityType,sourceLocalId,localId,serverId}`, включая владельцев без фото. Все новые local IDs уникальны и отсутствуют во всех трёх коллекциях обеих непересекающихся локальных областей. Оба редактора проверяются прежним строгим `assertEditor`; в v1 module добавлен только экспорт этой функции. Снимки с pending tree marker пока запрещены. При каждой записи и каждом холодном чтении заново проверяются полный body, source/target raw proof и все stage digests. Envelope имеет отдельный kind, canonical JSON и hash фактических bytes, предел 12 MiB UTF-8. Ни optimistic rows, ни Blob, ни receipt authority не входят в запись. Codec сам не сохраняет данные в IDB и не отправляет запросы.

Codec прошёл 15 отдельных проверок с настоящим projector, dirty state/photo/raw подменами, коллизиями local ID, rehashed cold-record подменами, async detachment, точной UTF-8 границей и взаимным отказом с v1. Команда: `node --test tests/critical/admin-template-photo-tree-copy-record.test.js`. Последующие локальные store, client и V9 plan описаны ниже; общий допуск и UI ещё не подключены.

Сервер должен получить реальное `sourceOwnedBytes` наблюдение из locked SQL source owner/photo/head/tombstones и прочитанных regular files, а не из JSON assertions. Hash/path tokens в валидной pure receipt не доказывают существование файлов или authenticated канал. Нужны global реальные dev:ino/path sets и повторные byte проверки всех owners до effects и commit.

BE: catalog + обе sorted head/list locks; повторные rights/private/base/full digest proofs; отсутствие каждого нового SQL owner/photo/head/tombstone; все stage proofs; независимые regular files; единая транзакция owners/photos/heads/full payload/revision/history/receipt с rollback всего дерева и assembled roundtrip до commit. 12.09 парный локальный API с настоящей одноразовой MySQL прошёл 13/13 тестов (12 дочерних сценариев плюс родитель), включая эту клиентскую проверку ответов, точную 3 MiB границу, полное дерево и rollback. 1111 source/test files и оба HEAD не менялись; SQL остановлен, порт 50406 закрыт. Это отдельная серверная проверка, без готовой браузерной формы.

FE: отдельный typed durable record/plan (предложенный V9), все постоянные IDs до await, общий capture lease и journal admission, полный parent cancellation/fence discriminator, partial stage/save lost ACK и cold recovery, native quota без новых IDs, явный UI «с содержимым». V1/V8 не должны молча принимать tree v2. HTTP/UI и сквозные проверки — отдельная работа; карточка 3 этим foundation не закрывается.

## Проверка foundation

Focused команда: `node --test tests/critical/admin-template-photo-tree-copy-protocol.test.js`.

14 случаев: вложенное дерево и владельцы без фото; точное обратное удаление проекции до исходного target; raw/opaque/quantity/packed/timestamp сохранность; limits по обе стороны границы; incomplete/cyclic/malformed closure; глобальные коллизии; mutual exclusion; прежние parsers закрыты; полные snapshot/mapping/actor/UUID/base commitments; отсутствие circular hash; подмена projected owner/photo; async input mutation; wire size. Без серверов, БД, сборки или broad-suite запуска.

Receipt команда: `node --test tests/critical/admin-template-photo-tree-copy-receipt.test.js`. 16 случаев: exact all-owner proof/actual relative routes, mode/unknown-field rejection, source/copied bytes и counterpart metadata, foreign/reordered stages, cross-owner path collisions, consistent source aliases, unavailable history/unknown distinction, cross-v1/create refusal, fixed URL policy, collateral/partial projection, timestamps/stored metadata, outer identity/revision/digest, strong cancellation/rejection, full-intent commitment даже при cancellation, detached async inputs, maximum 100-owner/32-depth/50-photo package и oversized receipt refusal. Это pure tests с явными synthetic server facts, не реальные API/MySQL/FS проверки.

## Отдельное хранилище команды дерева

`admin-template-photo-tree-copy-action-store.js` сохраняет JSON-команду и обе полные проекции в отдельной IndexedDB `bike-packing-admin-template-photo-tree-copy-actions-v1`. Все чтения, включая список команд и stage, повторно проверяют полный codec и binding; повреждённая запись своего аккаунта блокирует работу, а чужая не раскрывается. Строгая транзакция повторно сверяет снимок всех записей до добавления. Один UUID нельзя переопределить; другой UUID на той же базе отвергается. Поздняя квота или потеря readback сохраняют исходный выбор и постоянные IDs.

`claimStage` атомарно связывает stage с полным intentHash и assetDigest. Только один конкурентный запрос получает `fresh:true`. Потерянный ответ после commit не освобождает claim и не разрешает повтор POST. Смена аккаунта/поколения проверяется после ожиданий и не раскрывает прежний private snapshot. При выключенном флаге сохранение и claims запрещены, полные чтения для исходного аккаунта доступны. Удаления, отмены и доверенного списка исключений здесь нет.

Защита от других видов команд требует общего capture lease, полного списка журналов и отдельного typed cancellation/fence. Этот store проверяет конкуренцию только внутри своей базы. Клиент, общий допуск, план, UI и сквозная проверка остаются отдельной работой. 18 тестов store используют событийную модель IndexedDB; проверка реальных браузеров проводится отдельно и не подменяется моделью квоты.

## Проверка настоящего IndexedDB

Отдельный `admin-template-photo-tree-copy-store.spec.js` выполняет 6 сценариев в каждом из Chromium и mobile WebKit. Проверены полная неизменная запись после перезагрузки и закрытия вкладки, конкурирующие сохранения в двух вкладках, один fresh claim на стадию, чтение при выключенном флаге, смена аккаунта после фактического commit и смена поколения после commit claim. Запросы к исходникам обслуживаются локально по явному списку; внешнего API и тестовых серверов нет. Во всех 12 сценариях отсутствуют browser/page/console ошибки и повторы, граф из 26 файлов неизменен.

Используется настоящий IndexedDB одного BrowserContext с новыми документами и вкладками. Это не перезапуск процесса браузера, не аварийное завершение ОС и не доказательство исчерпания физической квоты. Синтетические проверки квоты/abort остаются отдельными. Сценарии зарегистрированы и в стандартной мобильной группе, и в отдельной конфигурации для локальной проверки хранилища.

## Typed client и чистый план V9

`admin-template-photo-tree-copy-client.js` использует отдельный JSON journal, immutable полный record/hash и типизированные tree stage endpoints. До первого POST каждой стадии сохраняется атомарный IDB claim, перед сохранением дерева — неизменяемая отметка отправки. Потеря ответа или общего transport entry не позволяет повторить POST: восстановление сверяет тот же UUID через GET. Полные stage/terminal receipts повторно проверяются при холодном чтении; недоступные исторические файлы допускают сверку уже совершённой операции, но не новую отправку. Смена аккаунта, поколения, страницы или окончание admission scope останавливает поздние действия и сохраняет неопределённые barriers.

Новые POST требуют `withDispatchAdmission({intent,recordIntentHash,assertCurrent}, work)`, удерживающий настоящий общий lease/inventory scope до окончания callback. Отсутствующий callback, boolean или ранний возврат не дают разрешения. Сам client не реализует общий inventory. Его command lock уже удерживается в callback: будущий outer runner должен получить sorted source/target common lease ДО command/plan lock, а callback — только проверить и переиспользовать этот scope. Обратное ожидание common lock внутри callback создало бы deadlock с capture.

19 client tests плюс прежний store/codec/V1 client дали 72/72; независимый read-only аудит подтвердил все 48 файлов import graph. Root transport после регистрации client: 1901/1901, без пропусков и ошибок, 6197 tracked/whitelist files unchanged. Квота здесь моделируется, actual API transport клиента и UI ещё не проверены. Client не предоставляет cancel, cleanup, parent-fence или принятие результата редактором.

`admin-template-photo-tree-copy-save-plan.js` задаёт отдельный строгий V9: один полный typed intent, точный target-before comparison view и recordIntentHash. Каждый read заново доказывает весь record и обе исходные области. `projectAdminTemplatePhotoTreeCopyPlanResult` повторно проверяет receipt и все стадии, затем ещё раз читает record; возвращает detached raw proof package с обеими исходными проекциями, всеми copiedOwners (включая владельцев без фото), confirmedPayload, revision и metadata. Arbitrary hashes, частичные ответы, cancellation и optimistic rows не превращаются в разрешение на применение.

14 новых проверок плана и проекции вместе с 13 V8 и 16 tree receipt дали 43/43; 55 импортируемых файлов неизменны. Это чистый raw результат. Generic registry V1–V8, normalized editor adapter, общий inventory/runner, typed cancellation/fence, UI и сквозная приёмка остаются отдельными шагами. Новые модули выключены и не опубликованы.

## Общие блокировки и применение в редакторе: следующий локальный срез

`createAdminTemplatePhotoTreeCopyAdmission(...).run(id, task)` получает настоящий отсортированный common lease исходного шаблона и получателя до любых client/plan locks. Полная запись проверяется до и после ожидания; task получает ограниченный сроком callback context и withDispatchAdmission. При каждой отправке запись снова читается, а обязательные inventory/namespace callbacks повторно проверяются. Их shape не доказывает полноту: production app обязан предоставить реальное содержимое всех журналов и обе текущие области. Scope истекает при выходе, смене аккаунта и раннем возврате callback. 13 новых тестов вместе с прежними client/lease дали 41/41; отдельно проверены opposite ordering, capture против dispatch, конкурирующий UUID и поздняя отправка после окончания scope.

`prepareAdminTemplatePhotoTreeCopyProjection` самостоятельно вызывает полный V9 proof и настоящий server projector. Оно сохраняет прежние target IDs и уже проверенные локальные строки, назначает все новые IDs из copiedOwners, включая владельцев без фото, и переписывает только известные связи. Raw canonical payload и исходные фотографии сохраняются. Источник, другие области и глобальный выбор остаются неизменны. Результат detached: nextState заменяет только target namespace, targetSnapshot отдельно предназначен для contextual hydration. Настоящий persist и quota rollback ещё не подключены. 12 новых тестов вместе с V9 и прежним projector дали 34/34; 49 файлов unchanged.

Приложение теперь читает tree IDB и полный typed client journal при обычном capture, фотоформах, V8 копировании, legacy-choice и порядке, даже при выключенном дереве. Record без plan и journal без IDB не исчезают из проверки. Только точный собственный v2 UUID/body/hash разрешает продолжение той же записи; V8 exclusions, терминальный факт и другая revision не являются принятием дерева. Admission callers удерживают настоящий lease до persistence; предварительное order.open служит только проверкой и повторяется под lease при capture. Helper сам не является атомарным снимком нескольких хранилищ. 8 новых проверок actual app вместе с прежними capture/create дали 29/29. Независимый read-only аудит не нашёл блокеров в этом срезе и двух новых модулях.

Следующая интеграция: реальные app inventory/namespace callbacks для runner, typed cancel/fence/recovery, применение только получателя с guarded mirror/persist и quota rollback, явная форма и браузер/API приёмка. До этого дерево не включается и не публикуется.

## Подключение V9 к общему журналу планов

Общий registry распознаёт V9 отдельно от V1–V8, сверяет полный record и обе исходные области. `capturePhotoTreeCopy(input, {captureLease})` требует уже удерживаемый настоящий lease источника и получателя. `run(id, {captureLease})` при включённом дереве проверяет этот lease до вызовов клиента. При выключенном дереве `run(id)` восстанавливает известную команду только через чтение и GET, без capture или POST. Terminal receipt, все stage receipts и recordIntentHash проверяются независимо от возвращённого клиентом результата.

Отмена V9, прежний cancelRequested и shouldCancel останавливают выполнение до общей ветки отмены: новый marker не сохраняется, старый механизм принятия результата не вызывается. Даже подтверждённая серверная отмена здесь остаётся rejected terminal fact. V8 exclusions не освобождают удерживаемый V9, а его UUID не становится predecessor authority. План повторно сверяется после ожиданий registry; допуск во время внутренних отправок клиента принадлежит внешнему admission scope.

Независимый аудит установил границу registry: если удалить plan внутри `client.run`, registry откажет в принятии результата после возврата, но самостоятельно не остановит внутренние POST. Production dispatch inventory обязан потребовать полный собственный V9 plan и держать его точные сохранённые байты в синхронном `scope.assertCurrent` до конца каждой stage/save. Клиент вызывает этот guard после beginWrite до POST. Capture inventory до создания плана может допускать его отсутствие; dispatch inventory не может. Такой app scope теперь реализован ниже, но его подключение к пользовательскому runner ещё не завершено.

15 новых проверок registry вместе с 45 прежними general/V7/V8/lease прошли 60/60 на неизменном графе из 65 файлов. Общая проверка после регистрации всех новых групп: 1963/1963, без ошибок, отмен и пропусков; source check и syntax также прошли, 6207 исходных файлов сохранили хеши. Предыдущий общий прогон имел две отмены из-за пятисекундного бюджета целого теста admission при параллельной нагрузке. Изменены только эти два тестовых бюджета на 30 секунд; рабочие таймауты и проверки сохранены, диагностический лог оставлен.

## Расширенный общий серверный прогон

DEFAULT API matrix с обязательными create-projection, photoCreate, одиночным photoCopy и tree-copy разделами прошёл **1170/1170**, без ошибок, отмен и пропусков, за 36 минут 19,399 секунды. Проверялась пара FE `51617f2289780bb5c3cac54a3b791774a7b031b1` с пятью неизменными правками заголовка и BE `ff0680e8568223b86201310c49f8bb2250a0874f`. Все 1130 файлов снимка и оба HEAD совпали до и после. Прежний общий прогон 1134 не включал все эти фоторазделы; его результаты не суммируются с новыми.

Прогон использовал отдельную MySQL 8.4.11 с проверкой `@@datadir` перед тестами и штатным SQL SHUTDOWN. Завершение остановки подтверждено 12.09.2026 в 08:32:44 UTC, loopback-порт 60213 закрыт. Исходный каталог и журналы оставлены для диагностики. Это проверка настоящего локального API, MySQL и файловой системы; серверный выпуск и включение дерева ею не выполнялись. Доказательства находятся в BE `node_modules/.cache/tree-api-full-1*`.

## Точная подготовка областей для восстановления дерева

`prepareAdminTemplatePhotoTreeCopyNamespaces` повторно доказывает полный V9 record и обе текущие области. Получатель допускается только в точном исходном состоянии либо с четырьмя выведенными из этого плана pending-полями. Произвольные похожие markers не удаляются. Источник, владельцы, словари, размещение и выделенные новые ID сверяются без нормализации; подмена объекта редактора, аккаунта, поколения или выбранного layout останавливает подготовку. Возвращаемый синхронный guard сохраняет эти проверки после ожиданий и требует действующий внешний inventory/lease guard.

`cleanState` — отделённый первоначальный снимок для полного receipt projector. Он не разрешает присваивать весь снимок текущему приложению: после ожидания допустимо только защищённое слияние получателя с отдельным persist и quota rollback. Сам adapter не получает блокировки, не отправляет запросы и не сохраняет данные. 15 новых проверок вместе с 12 projection и 14 V9 plan дали 41/41 без повторов и пропусков; 50 файлов графа импортов неизменны. Root review подтвердил совместимость строгих словарей и arrangement с полным `assertEditor`; app runner ещё не подключён.

## Реальный inventory непосредственно перед отправкой

`withAdminTemplatePhotoTreeCopyDispatchInventory` требует уже удерживаемые настоящие common leases источника и получателя. Он читает оба набора планов, обычные журналы команд, IDB загрузок и одиночного копирования, V8 client journal, tree IDB/client и очередь порядка даже при выключенном дереве. Полный собственный V9 plan и record обязательны; orphan, повреждённая запись или другая V9 команда блокируют отправку. Только подтверждённое прежним StopChoice/Recovery принятие V1–V8 может исключить соответствующую старую команду; это не исключает V9.

Синхронный guard сохраняет точные raw bytes плана и остальных относящихся к операции localStorage journals до конца callback, включая проверку после `beginWrite` перед POST. Собственный tree client journal законно дополняется stage/receipt: сохраняются его неизменные identity/body/digest/hash, а полные изменяемые подтверждения декодируются заново при каждом admission. Async upstream guard отклоняется без принятия его результата и без необработанного Promise rejection. IDB читается асинхронно под общим lease; этот scope не является глобальной атомарной транзакцией нескольких хранилищ.

17 новых actual-app проверок вместе с соседними admission/registry/inventory/preflight дали 60/60 за 28,819 секунды, без ошибок, отмен и пропусков. Проверены фактический client `beginWrite` с удалением, заменой и переформатированием плана до POST, законные изменения собственного журнала, контекст и окончание callback, принятие V8 stop и запрет исключения V9. Фабрика планов теперь получает реальные readonly tree store/client; tree writes остаются выключенными. Подключение runner, формы, отмены и persist не входит в этот срез.

Первый срез прошёл 58 focused и 1993 общих проверки, однако независимый просмотр обнаружил два лишних отказа: принятый stop неактивного источника проверялся с контекстом активного редактора, а исключённый V1 план не освобождал вторую операцию публикации с отдельным UUID. Исправления сохраняют настоящий actor/admin/generation и разворачивают только полностью доказанные исключённые V1–V8 планы в точные intents всех их операций. Один UUID без совпадения binding/kind/body не разрешает исключение; V9 и собственная операция исключению не подлежат. Новые проверки используют настоящие app context, StopChoiceFor, Recovery и typed plans. Финальный focused snapshot: 527 файлов графа импортов и HEAD неизменны; первые логи оставлены отдельно.

Повторный независимый просмотр FINAL-2 закрыл оба замечания, новых блокеров в исправлениях не найдено. Общий root-прогон после регистрации namespace и dispatch-inventory тестов прошёл **1995/1995** за 53,906 секунды, без ошибок, отмен и пропусков; source и syntax также прошли. Все 6210 файлов снимка и HEAD не менялись во время проверок. Evidence: `node_modules/.cache/tree-fe-dispatch-final-integration-20260912-*`. Этот локальный результат дополняет серверные 1170/1170, но не является подключённой браузерной командой и не входит в опубликованный v1610.

## Выполнение сохранённого дерева, отмена и применение результата

Следующий локальный срез соединяет actual-app runner уже сохранённого V9 с настоящими common leases, dispatch inventory, namespace adapter, registry и клиентом. Сначала удерживаются обе общие блокировки, затем блокировки плана и команды. Сохранённый plan и raw bytes остаются обязательными до POST. Возвращается отделённый `{plan,record,receipt,stageReceipts}`; после выхода scope он не является разрешением изменить редактор. Наличие собственного stop marker блокирует business dispatch, даже при повреждённом содержимом marker. Прямого входа формы в этот runner ещё нет.

Клиент дерева поддерживает явный `cancel(id)` через отдельный `withCancellationAdmission`. Сначала проверяются текущий вход, административные права и GET исходного UUID. Поздний commit принимается только с полными доказательствами дерева и стадий. Если результат неизвестен, явный выбор отмены сохраняется до ожидания cancellation scope, затем отправляется точный исходный envelope на `/template-operations/{UUID}/cancel`. Нужны общий флаг административных операций и его capability; выключенные собственные фотофлаги не запрещают отмену. Потеря ответа приводит к GET того же UUID. Новый POST отмены возможен только по новому явному вызову; обычный `run` не возобновляет стадии после выбора отмены.

Схема client journal обратно совместима: прежние восемь полей либо они и строго boolean `cancelRequested`. Обычный capture сохраняет восемь полей; чтение не мигрирует старые bytes. `true` не сбрасывается автоматически. Registry читает подтверждённую историю с marker при OFF, но не допускает business run. Actual-app runner пока использует только business inventory и останавливается на `true` также при OFF: отдельные cancellation/history scope и экран восстановления ещё нужны. Generic V8 stop/adoption не применяются к V9.

Новый tree parent-fence имеет отдельные kind, prefix и discriminator `admin-template-photo-tree-copy-stage-v2`. Transport допускает отмену только через барьер собственных стадий с точным совпадением режима, binding, parent UUID, record hash и всех asset IDs/digests. Полная сильная квитанция отмены сохраняется вместе с доказательством исходного journal. При холодном запуске обе версии parent-fence читаются раздельно; изменение фактических bytes сертификата, команды или стадии возвращает блокировку. Сертификат снимает только соответствующий transport barrier: стадия остаётся uncertain, её claim и файлы сохраняются. Это не подтверждение стадии, не принятие серверного редактора, не очистка и не разрешение повторно использовать IDs.

`prepareAdminTemplatePhotoTreeCopyForm` выводит полный typed record из заранее выделенных IDs, обеих исходных проекций, выбранного корня и упорядоченных фото всех владельцев. Все входы отделяются до первого await, raw payload не нормализуется, digest каждой стадии вычисляется заново. Неполный состав дерева, перестановка фото, чужая карта, изменения редактора, коллизии и присланные assetDigest отклоняются. Выделение IDs и подключение настоящей формы остаются следующим шагом.

`applyAdminTemplatePhotoTreeCopyResult` — отдельный adapter для подтверждённого commit. Его вызывающий код должен заново получить общий lease/inventory guard. Он проверяет обе области, всю квитанцию и стадии, затем сливает только получателя с актуальным состоянием. Собственный получатель принимается только в точном before, выведенном pending или полном confirmed состоянии. Словари и чужие данные сохраняются; packedItems обновляются лишь для активного получателя. Проверяются также ссылки других укладок на выделенные IDs. Сначала сохраняется и точно перечитывается актуальное локальное зеркало, затем меняется память. При квоте или потере readback память остаётся прежней, записи команды и IDs сохраняются; уже сохранённый подтверждённый результат можно принять при повторе без второй записи. Зеркало не откатывается вслепую поверх возможной записи другой вкладки.

Независимый просмотр apply выявил два случая, исправленных до объединения: изменение аккаунта/области внутри callback чтения storage и новые внешние ссылки после асинхронной проверки. Дополнительные синхронные guards и повторная проверка известных схемных ссылок закрыли оба замечания; повторный просмотр новых блокеров не нашёл. Root review parent-fence дополнительно потребовал одинаковую пару владельцев во всех неполных stage receipts. Это локальный срез выключенной функции, без новых публикаций и без завершения карточки 3.

После объединения пройдены **2054/2054** общих проверок обмена за 109,975 секунды, без ошибок, отмен и пропусков. Source check и проверка синтаксиса всех source/test JS прошли; 6220 файлов, их перечень и HEAD `75dbcd4c` не менялись во время прогона. Доказательства: `node_modules/.cache/tree-execution-checkpoint-2026-09-12T09-53-01-043Z-*`. Эта строка с итогом добавлена после проверки. Отдельные focused результаты: actual-app runner 11/11 (521 файл неизменен), client/cancellation 34/34 (45 файлов), tree-fence вместе с прежними transport/V8 58/58 (138 файлов); они входят в общий результат и не суммируются с ним. Независимый просмотр form preparation и registry delta не выявил блокирующих замечаний. Браузерную форму дерева и серверный выпуск этот прогон не проверяет.

## Подключение формы и продолжения сохранённого дерева

Срез после `21ae6edd` добавляет синхронное выделение всех UUID и локальных/серверных ID по точному выбранному дереву. Корень, вложенные сумки, вещи без фото, порядок фото и обе проекции отделяются до ожиданий. Генератор не повторяется после коллизии или ошибки. Первая подготовленная попытка остаётся в контроллере формы; ошибка записи повторяет исходный выбор.

Actual-app capture использует обе common leases и общий строгий inventory reader. Capture и dispatch имеют отдельные именованные scopes: только первый допускает отсутствие собственных ещё не записанных указателей; полный record перепроверяется. Чужие команды остаются барьерами. Порядок записи: tree IDB, полный V9 plan, client journal, shared mirror с собственными четырьмя pending-полями, live marker. Нет оптимистичных владельцев. Поздняя коллизия local/server ID и чужие схемные ссылки блокируют запись до IDB и проверяются после ожиданий. Ошибка mirror/readback оставляет живые данные и исходную команду для того же повтора.

Picker направляет корневое «с содержимым» только в V9 и сохраняет выбранный placementIndex; отдельная кнопка добавляет в конец. Фото могут находиться только у потомков. Переход в копирование пустой оболочки при ошибке запрещён. V9 current-selection проверяет форму, сессию, флаги и позицию; eligibility проверяется до submit, чтобы собственный pending marker не отменял уже принятую команду. V8 сохраняет прежние правила. Actual-controller + actual-app тест проходит полный capture, отправку и применение, а не только отдельные callback stubs.

После durable capture вызывается dedicated runner. Подтверждённый результат применяется под заново полученным common lease и actual inventory, через полный receipt/stage proof и target-only mirror/live merge. Общий coordinator.flush сначала проверяет сохранённое дерево; при отсутствии соответствующей команды работает прежний путь. Холодное продолжение выбирает ровно одну полную запись по сохранённому указателю/базе. ON восстанавливает недостающий plan/client из того же IDB record. OFF не создаёт их, но может прочитать уже известный результат и применить его. Потерянный ACK и квота последнего mirror проверены через GET исходного UUID без повторной отправки. Повреждённый или чужой указатель дерева останавливается, не переходит в generic V8 recovery.

Исходный контекст submit и холодного resume сохраняется между завершёнными capture/run и применением результата. Отдельный context guard не зависит от прежней identity целевой укладки или закрытия формы после durable capture. Регрессия выполняет настоящие фазы, меняет generation перед возвратом вызывающей функции и проверяет все четыре сочетания submit/resume × capture/run: pending и исходные журналы остаются, результат в новой сессии не применяется.

Прежние браузерные сценарии V8 (вещь, оболочка сумки и несохранённый источник) повторно прошли **6/6** с первой попытки в Chrome и mobile WebKit. Обе изолированные V8 сборки созданы заново; V9 оставался выключен. 532 файла импортов и конфигурации неизменны. Этот прогон завершён перед последней правкой только context guard V9; он не является браузерной приёмкой нового дерева. Доказательства: `node_modules/.cache/causal-evidence/tree-form-legacy-browser-1*`.

Итог после исправлений: **2097/2097** общих проверок обмена за 202,520 секунды, без ошибок, отмен и пропусков. Source check и синтаксис всех source/test JS прошли; 6227 файлов, их перечень и HEAD `21ae6edd` неизменны во время проверки. Доказательства: `node_modules/.cache/tree-execution-checkpoint-2026-09-12T10-46-03-313Z-*`. Отдельно прошли 182/182 прежних проверок цепочки источника, правил копирования и прав доступа. Эта строка с итогом добавлена после прогона; код больше не менялся. Предыдущий прогон 2096 до последней правки сохранён для диагностики и не суммируется с итогом.

Границы остаются открытыми: отдельный экран/допуск явной отмены и чтения после `cancelRequested:true`, принятие завершённого V9 для последующих изменений и очистка, настоящий браузерный сценарий нового дерева совместно с API/MySQL. При выбранной отмене app пока останавливает продолжение с сохранением данных. Новые функции выключены и не опубликованы; эта связка не закрывает весь этап 3 и не является приёмкой на физическом iPhone.

## Явная отмена и сверка результата дерева

Срез после `8af475a9` подключает V9 к существующему окну «Сохранение шаблона» до обычных recovery/compare adapters. `findAdminTemplatePhotoTreeCopyFormRecord` выбирает только полную исходную запись для этой укладки; повреждённый или чужой указатель не превращается в обычную цепочку. Открытие окна читает локальный статус. «Проверить результат» и холодное продолжение после выбранной отмены используют GET исходного UUID. Повторный cancel POST возможен только через явное действие «Остановить отправку» / «Продолжить остановку».

`createAdminTemplatePhotoTreeCopyRecoveryRunner` получает genuine common lease обеих укладок до блокировки клиента, повторно проверяет полный V9 plan, record, journal и факты стадий. Точные байты плана и исходный контекст проверяются через все ожидания, включая после регистрации отправки. Cancel имеет отдельный scope с повторным доказательством, не получает допуск обычной отправки и не требует неизменного редактора старой версии. Локальный read не делает сетевых запросов. Повреждённые записи не пропускаются и не очищаются.

Typed client сохраняет `cancelRequested:true` под блокировкой команды **до первого сетевого ожидания**, включая auth и первоначальный GET. Поэтому офлайн или ошибка входа не теряют решение пользователя при перезагрузке. Используется прежнее необязательное булево поле; новой схемы или server wire нет. После ошибки окно пытается перечитать только локальное состояние, корректирует кнопки на «Продолжить остановку» и сохраняет исходное сообщение об ошибке.

Сильное `operation_cancelled` означает, что исходная команда больше не применится; исходные данные, файлы, IDB, журналы и claims остаются. Поздний `committed` имеет приоритет над намерением остановить: сначала доказываются все стадии и полный receipt, затем окно предлагает «Применить результат». Применение получает новый common lease и отдельный `recovery-apply-inventory` scope: он допускает собственный cancel marker только при неизменном полностью проверенном committed journal. Все чужие записи остаются барьерами; чистый apply adapter повторно проверяет обе области и пишет только получателя, mirror первым. Квота не меняет живой редактор и позволяет применить тот же результат повторно.

Общий V1–V8 cancel/compare/stop-choice путь для V9 не открывается. Подтверждение отмены и применение committed результата ещё не освобождают V9 для новых изменений и не разрешают очистку файлов. Следующий шаг — отдельное доказуемое принятие результата для последующих правок, затем совместная приёмка нового дерева в настоящем браузере и API/MySQL. Новые функции остаются выключенными и не опубликованы.

Финальный общий прогон этого среза: **2126/2126** проверок обмена за 258,765 секунды, без ошибок, отмен и пропусков. Проверки исходников и синтаксиса прошли; все 6233 файла снимка, их перечень и HEAD `8af475a9` оставались неизменными. Evidence: `node_modules/.cache/tree-execution-checkpoint-2026-09-12T11-17-36-517Z-*`. Focused результаты входят в общий набор и не суммируются с ним: recovery runner 14/14, actual-app recovery 7/7, recovery dialog 7/7, typed cancellation 16/16. Проверены офлайн до первоначального GET, потерянный ответ отмены, холодный GET того же UUID, поздний commit, квота, подмена плана и смена аккаунта до POST.

Отдельно на окончательных исходниках прошли **8/8** прежних сценариев окна восстановления в настоящих Chromium и mobile WebKit, по четыре в каждом, без повторов и пропусков, за 105,636 секунды. Заново собрана обычная тестовая административная версия с выключенным V9; 528 файлов графа импортов и HEAD неизменны. Проверены прежние Stop, Compare, принятие локального/серверного состояния и следующая правка. Evidence: `node_modules/.cache/causal-evidence/tree-recovery-legacy-browser-1-*`. Сеть этих тестов изолирована; это регрессия прежнего окна, а не совместная браузерная приёмка нового дерева с настоящим сервером. Строки итогов добавлены после обоих проверочных снимков; исполняемый код после них не менялся.

## Принятие завершённого дерева для дальнейших изменений

Следующий срез после `240b122d` сохраняет отдельное локальное подтверждение принятия V9 по binding и исходному UUID. Обычные сохранения редактора не удаляют эту историю. Каждое чтение заново доказывает полный исходный IDB record, точный V9 plan, typed journal, все квитанции стадий и подтверждённую проекцию. Хеши связывают доказательства, но сами по себе не дают разрешения. Изменяемые наблюдения доступности стадий и намерение отмены не меняют исторический факт; исходные неизменные квитанции продолжают проверяться полностью.

Порядок записи: подтверждённый mirror с проверкой чтением, отдельное подтверждение принятия с проверкой чтением, затем синхронное изменение живого редактора. Ошибка записи или чтения не подтверждает успех. После прерывания между mirror и подтверждением холодный поиск распознаёт только полное совпадение с доказанной проекцией. Если результат уже совпадает в обеих местных копиях, отдельный путь дописывает только подтверждение: последующие изменения источника не откатываются. Новые UUID, повторные отправки и очистка исходной истории при этом не появляются.

Обычное сохранение, изменение порядка и новая копия проверяют такое принятие через реальные typed readers. В inventory новой копии одновременно сверяются прежние plan, record и journal; подтверждения других команд остаются неизменными через все ожидания. Прежние ограничения той же базы и ссылки на UUID дерева сохраняются. Нельзя заменить принятие V8-исключением, numeric base+1, отдельным `committed`, отменой или parent fence.

При известной квитанции с неподтверждённой записью транспорта приложение сначала сверяет исходный UUID через прежний GET-путь. Этот путь также подтверждает первоначальные стадии, чьи typed receipts сохранились раньше ошибки записи транспортного подтверждения. Само принятие не удаляет и не обходит барьер транспорта. История команд, фото и claims остаётся на месте.

Карточка 3.2 пока остаётся «В работе»: после локальных последовательностей ещё требуется совместная приёмка нового дерева в настоящем браузере с API/MySQL. Этот срез не включает публикацию или включение флагов и не означает завершение всего этапа 3.

Финальный общий прогон среза: **2151/2151** проверок обмена за 399,441 секунды, без ошибок, отмен и пропусков. Проверки исходников и синтаксиса прошли; 6237 файлов, их перечень и HEAD `240b122d` неизменны. Evidence: `node_modules/.cache/tree-execution-checkpoint-2026-09-12T12-30-47-610Z-*`. В общий результат входят 16 новых проверок принятия, 13 прежних проверок применения и 8 проверок реальных функций приложения: ordinary save → cold reload → next V9, использование прежнего получателя как источника, порядок, квота между записями, потеря доказательства перед POST, сверка транспортного подтверждения и завершение принятия после изменения источника. Focused evidence: `node_modules/.cache/causal-evidence/tree-acceptance-final-1*` и `tree-acceptance-app-final-1*`; результаты не суммируются с общей цифрой. Эта строка добавлена после контрольного снимка; исполняемый код после него не менялся.

Обычная Vite-сборка также прошла в отдельную ignored-папку `node_modules/.cache/tree-acceptance-build`, без изменения флагов. Log: `node_modules/.cache/tree-acceptance-build.txt`. Это проверка сборки, а не публикация или браузерная приёмка дерева.
