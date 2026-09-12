# Чистый контракт копирования дерева с фотографиями

Подготовка следующего среза карточки 3. Реализованы только строгий parser, производная raw-проекция и обязательства stage. Это **не готовая операция копирования дерева**: нет HTTP/SQL/FS/IDB/transport/UI, проверки серверных квитанций и активации.

Новые файлы: `src/sync/admin-template-photo-tree-copy-protocol.js`, одноимённый critical test, `tests/fixtures/admin-template-photo-tree-copy-fixture.js` и этот документ. Общий parser, `photoCopy v1`, V8, upload/create/edit/replace и BE не меняются. Gate `ADMIN_TEMPLATE_PHOTO_TREE_COPY_ENABLED=false`; capability name `adminTemplatePhotoTreeCopyV1` только объявлен, нигде не рекламируется.

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

## Что намеренно pending

Полная stage/terminal receipt grammar и validator пока **не реализованы**. Следующий срез должен связать added refs с authenticated immutable receipts, exact origins, source/copy byte equality и глобальной независимостью source/target paths через всех владельцев. Нельзя применить чистую проекцию как confirmed state без этих доказательств.

BE: catalog + обе sorted head/list locks; повторные rights/private/base/full digest proofs; отсутствие каждого нового SQL owner/photo/head/tombstone; все stage proofs; независимые regular files; единая транзакция owners/photos/heads/full payload/revision/history/receipt с rollback всего дерева и assembled roundtrip до commit. Чистая проекция ещё не проверена реальным assembled API.

FE: отдельный typed durable record/plan (предложенный V9), все постоянные IDs до await, общий capture lease и journal admission, полный parent cancellation/fence discriminator, partial stage/save lost ACK и cold recovery, native quota без новых IDs, явный UI «с содержимым». V1/V8 не должны молча принимать tree v2. HTTP/IDB/UI и их проверки — отдельная работа; карточка 3 этим foundation не закрывается.

## Проверка foundation

Focused команда: `node --test tests/critical/admin-template-photo-tree-copy-protocol.test.js`.

14 случаев: вложенное дерево и владельцы без фото; точное обратное удаление проекции до исходного target; raw/opaque/quantity/packed/timestamp сохранность; limits по обе стороны границы; incomplete/cyclic/malformed closure; глобальные коллизии; mutual exclusion; прежние parsers закрыты; полные snapshot/mapping/actor/UUID/base commitments; отсутствие circular hash; подмена projected owner/photo; async input mutation; wire size. Без серверов, БД, сборки или broad-suite запуска.
