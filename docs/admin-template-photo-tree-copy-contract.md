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

## Что намеренно pending

Отдельный `admin-template-photo-tree-copy-record.js` уже реализован как локальный codec. Exact snapshot `{version:1,source,target,copiedOwners}` сохраняет обе полные редакторские проекции, исходные owner maps и полный ordered список `{entityType,sourceLocalId,localId,serverId}`, включая владельцев без фото. Все новые local IDs уникальны и отсутствуют во всех трёх коллекциях обеих непересекающихся локальных областей. Оба редактора проверяются прежним строгим `assertEditor`; в v1 module добавлен только экспорт этой функции. Снимки с pending tree marker пока запрещены. При каждой записи и каждом холодном чтении заново проверяются полный body, source/target raw proof и все stage digests. Envelope имеет отдельный kind, canonical JSON и hash фактических bytes, предел 12 MiB UTF-8. Ни optimistic rows, ни Blob, ни receipt authority не входят в запись. Codec сам не сохраняет данные в IDB и не отправляет запросы.

Codec прошёл 15 отдельных проверок с настоящим projector, dirty state/photo/raw подменами, коллизиями local ID, rehashed cold-record подменами, async detachment, точной UTF-8 границей и взаимным отказом с v1. Команда: `node --test tests/critical/admin-template-photo-tree-copy-record.test.js`. IDB, сохранённый план, lease/dispatch и UI остаются следующей интеграцией.

Сервер должен получить реальное `sourceOwnedBytes` наблюдение из locked SQL source owner/photo/head/tombstones и прочитанных regular files, а не из JSON assertions. Hash/path tokens в валидной pure receipt не доказывают существование файлов или authenticated канал. Нужны global реальные dev:ino/path sets и повторные byte проверки всех owners до effects и commit.

BE: catalog + обе sorted head/list locks; повторные rights/private/base/full digest proofs; отсутствие каждого нового SQL owner/photo/head/tombstone; все stage proofs; независимые regular files; единая транзакция owners/photos/heads/full payload/revision/history/receipt с rollback всего дерева и assembled roundtrip до commit. Чистая проекция ещё не проверена реальным assembled API.

FE: отдельный typed durable record/plan (предложенный V9), все постоянные IDs до await, общий capture lease и journal admission, полный parent cancellation/fence discriminator, partial stage/save lost ACK и cold recovery, native quota без новых IDs, явный UI «с содержимым». V1/V8 не должны молча принимать tree v2. HTTP/UI и сквозные проверки — отдельная работа; карточка 3 этим foundation не закрывается.

## Проверка foundation

Focused команда: `node --test tests/critical/admin-template-photo-tree-copy-protocol.test.js`.

14 случаев: вложенное дерево и владельцы без фото; точное обратное удаление проекции до исходного target; raw/opaque/quantity/packed/timestamp сохранность; limits по обе стороны границы; incomplete/cyclic/malformed closure; глобальные коллизии; mutual exclusion; прежние parsers закрыты; полные snapshot/mapping/actor/UUID/base commitments; отсутствие circular hash; подмена projected owner/photo; async input mutation; wire size. Без серверов, БД, сборки или broad-suite запуска.

Receipt команда: `node --test tests/critical/admin-template-photo-tree-copy-receipt.test.js`. 16 случаев: exact all-owner proof/actual relative routes, mode/unknown-field rejection, source/copied bytes и counterpart metadata, foreign/reordered stages, cross-owner path collisions, consistent source aliases, unavailable history/unknown distinction, cross-v1/create refusal, fixed URL policy, collateral/partial projection, timestamps/stored metadata, outer identity/revision/digest, strong cancellation/rejection, full-intent commitment даже при cancellation, detached async inputs, maximum 100-owner/32-depth/50-photo package и oversized receipt refusal. Это pure tests с явными synthetic server facts, не реальные API/MySQL/FS проверки.

## Отдельное хранилище команды дерева

`admin-template-photo-tree-copy-action-store.js` сохраняет JSON-команду и обе полные проекции в отдельной IndexedDB `bike-packing-admin-template-photo-tree-copy-actions-v1`. Все чтения, включая список команд и stage, повторно проверяют полный codec и binding; повреждённая запись своего аккаунта блокирует работу, а чужая не раскрывается. Строгая транзакция повторно сверяет снимок всех записей до добавления. Один UUID нельзя переопределить; другой UUID на той же базе отвергается. Поздняя квота или потеря readback сохраняют исходный выбор и постоянные IDs.

`claimStage` атомарно связывает stage с полным intentHash и assetDigest. Только один конкурентный запрос получает `fresh:true`. Потерянный ответ после commit не освобождает claim и не разрешает повтор POST. Смена аккаунта/поколения проверяется после ожиданий и не раскрывает прежний private snapshot. При выключенном флаге сохранение и claims запрещены, полные чтения для исходного аккаунта доступны. Удаления, отмены и доверенного списка исключений здесь нет.

Защита от других видов команд требует общего capture lease, полного списка журналов и отдельного typed cancellation/fence. Этот store проверяет конкуренцию только внутри своей базы. Клиент, общий допуск, план, UI и сквозная проверка остаются отдельной работой. 18 тестов store используют событийную модель IndexedDB; проверка реальных браузеров проводится отдельно и не подменяется моделью квоты.
