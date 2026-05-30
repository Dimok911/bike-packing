# Legacy fallback retirement plan (план вывода legacy fallback)

Рабочий статус: entity sync baseline (базовый переход на entity sync) считается
закрытым, а `/bike-packing-data.json` выведен из автоматических runtime-путей.
Аварийное восстановление теперь опирается на локальные backup-архивы.

Текущий статус `v981`: обычный повторный startup (запуск) залогиненного
пользователя при неизменной `/freshness` (свежести) больше не должен тянуть
тяжёлый `/bike-packing/lists/:id/state`. Demo/shared шаблоны читаются через
dedicated payload endpoint (отдельную конечную точку payload)
`/bike-packing/public-template-payloads/:itemKey`. Автоматических `GET` или
`POST` к `/bike-packing-data.json` во frontend runtime больше быть не должно.

Changes feed (лента изменений сущностей)
`/bike-packing/lists/:id/changes?sinceRevision=N` включён и проверен после
исправления API capability `entityChangesFeedRevisionBump`: entity-sync записи
теперь поднимают `stateRevision`, поэтому другое устройство после изменившейся
`/freshness` может забрать только changed/deleted entities
(измененные/удаленные сущности), а не полный `/state`.

## Допустимые full-payload пути (полная загрузка/запись состояния)

- `forceOverwrite` (принудительная перезапись): пользователь при конфликте явно
  выбирает локальную версию как главную и разрешает заменить серверное состояние
  целиком.

  Пример:

  1. На устройстве A пользователь меняет укладку офлайн или в старой вкладке.
  2. На устройстве B в это время уже сохранена другая версия на сервер.
  3. Устройство A пытается сохранить изменения, а сервер отвечает: "моя версия
     новее, есть конфликт".
  4. Приложение предлагает выбор: загрузить серверную версию или оставить
     локальную.
  5. Если пользователь выбирает "оставить локальную / перезаписать сервер", то
     локальная версия становится новой серверной правдой целиком.

  Почему здесь допустим full payload: пользователь явно сказал, что вся текущая
  локальная версия должна победить серверную. В такой ситуации нельзя безопасно
  разложить решение на отдельные `items/sync`, `containers/sync` и
  `layouts/sync`, потому что важен итоговый снимок состояния целиком.

- `conflict merge` (слияние конфликта): приложение или пользователь объединяет
  локальную и серверную версии, после чего итоговую собранную версию нужно
  сохранить на сервер целиком.

  Пример:

  1. На устройстве A пользователь переименовал вещь.
  2. На устройстве B в это же время поменяли место хранения, категорию или
     структуру сумок.
  3. Обе версии отличаются от старой базовой версии, поэтому простой entity sync
     уже не может безусловно сказать, какая сторона главнее.
  4. Приложение строит merged state (слитое состояние): часть изменений берется
     из локальной версии, часть из серверной.
  5. Получается новая итоговая версия, которой раньше не было ни на устройстве,
     ни на сервере.

  Почему здесь допустим full payload: результат merge - это новый canonical
  state (каноническое состояние), собранный из двух расходящихся версий. Его
  нужно записать как цельную серверную правду, иначе можно потерять часть
  связей между вещами, сумками, укладками и словарями.
- `history restore` / backup recovery (восстановление из истории/резервной
  копии): восстановление версии из истории или резервной копии является полной
  заменой состояния.
- `migration/recovery` (миграция/аварийное восстановление): старый формат,
  поврежденный payload (полезная нагрузка состояния) или подозрительное
  локальное состояние требуют безопасного восстановления.
- too old revision (слишком старая revision): локальная `stateRevision` настолько
  старая или неполная, что changes feed (лента изменений сущностей) не может
  гарантированно восстановить все изменения. Тогда нужен full `/state`.
- первый payload шаблона (первая загрузка состояния шаблона):
  shared/public-template itemKey path (путь по ключу шаблона) переведен на
  `/bike-packing/public-template-payloads/:itemKey` с capability (возможностью API)
  `publicTemplatePayloadEndpoint`; legacy `/bike-packing-data.json` fallback
  удалён из автоматического template path. Повторный refresh (обновление) при
  том же `updatedAt` уже покрыт cache-тестом (тестом кэша).

## Недопустимые обычные сценарии

Эти действия не должны доходить до `GET`/`POST /bike-packing-data.json`.
Они также не должны включать full payload save (полную запись состояния), если
list API (API списков) и entity endpoints (endpoints сущностей) доступны:

- переименование вещи;
- изменение категории или места хранения вещи;
- изменение категории или места хранения контейнера;
- добавление, удаление и переименование пользовательской категории/места;
- переименование контейнера;
- перемещение вещи;
- изменение порядка и вложенности контейнеров;
- переименование layout (укладки);
- переключение layout/template (укладки/шаблона);
- background refresh (фоновое обновление) без изменившейся freshness
  (метаданных свежести);
- повторный startup (запуск приложения) залогиненного пользователя, если
  `/freshness` не изменилась и локальное состояние не dirty (не содержит
  несохраненных изменений).
- получение чужих изменений с другого устройства, если локальная
  `stateRevision` свежая и `/changes?sinceRevision=...` может вернуть только
  changed/deleted entities.

## Выполненные условия отключения legacy fallback (резервного legacy-пути)

1. Backend production (продовый backend) стабильно отдает capabilities
   (заявленные возможности API) для:
   - personal list API (API личных списков);
   - entity sync (синхронизации сущностей) `items`, `containers`, `layouts`,
     `dictionaries`;
   - lightweight `/freshness` (легкого endpoint свежести);
   - history restore (восстановления из истории) на list API.
2. Frontend (клиент) показывает admin/API compatibility warning
   (предупреждение о несовместимости админки/API), если capabilities или
   minimum API version (минимальная версия API) не подходят.
3. Ручной prod-прогон повторен после удаления встроенных defaults (значений по
   умолчанию), после стабилизации startup freshness `v974+` и после проверки
   changes feed на `v978`.
4. Critical tests (критические тесты) покрывают обычные действия и template
   cache (кэш шаблонов) без full payload.
5. Для public templates (публичных шаблонов) есть dedicated payload endpoint
   (отдельная конечная точка payload); отдельно можно добавить lightweight
   manifest/hash (легкий манифест/хэш) поверх catalog `updatedAt`, если
   понадобится ещё сильнее сократить первые payload-загрузки.
6. Startup freshness gate (проверка свежести при запуске) стабильно сохраняет
   `syncMeta.listId`, `stateRevision`, `serverUpdatedAt` и account meta
   (мету аккаунта), поэтому повторный запуск без серверных изменений не делает
   full `/state`.
7. Backend production отдает capabilities `entityChangesFeed` и
   `entityChangesFeedRevisionBump`, а endpoint
   `/bike-packing/lists/:id/changes?sinceRevision=N` используется для
   точечного получения changed/deleted entities.

## Шаги удаления

1. Done (готово): ужесточён capability/version gate (проверка возможностей и версии API):
   если list/entity API отсутствует, frontend не должен молча писать legacy
   payload для обычных сохранений.
2. Done (готово): public template payload чтение переведено на dedicated backend
   endpoint `/bike-packing/public-template-payloads/:itemKey`; legacy reader
   (старый читатель payload) удалён из automatic template path.
3. Done (готово): повторный залогиненный startup при неизменной freshness
   переиспользует локальное состояние и не тянет тяжёлый `/lists/:id/state`.
4. Done API-first (готово на стороне API): добавлен и стабилизирован changes feed
   `/bike-packing/lists/:id/changes?sinceRevision=N` для `items`, `containers`,
   `layouts`, `dictionaries`; `entityChangesFeedRevisionBump` гарантирует, что
   entity-sync save поднимает `stateRevision`.
5. Done frontend-first (готово на стороне frontend): `v978` при startup refresh
   и background refresh после изменившейся `/freshness` сначала пробует changes
   feed и применяет changed/deleted entities, а full `/state` использует только
   как fallback при неуспешном применении или слишком старой revision.
6. Done (готово): `/bike-packing-data.json` больше не используется для
   automatic read/write paths; recovery остаётся через локальные backup-архивы.
7. Done (готово): automatic legacy writer (автоматическая legacy-запись) удалён
   из `saveRemoteStateRecord`; при недоступном list/entity API локальное dirty
   состояние сохраняется на устройстве.
8. Done (готово): legacy reader (legacy-чтение) удалён из обычного startup
   path (пути запуска приложения) и из automatic public-template path.

## Оставшиеся оптимизации вне legacy removal

- Dirty offline rebase (перебазирование локальных offline-изменений): если
  устройство было offline и изменило entity A, а сервер параллельно получил
  изменение entity B, фронт должен при stale `baseStateRevision` запросить
  `/changes?sinceRevision=baseStateRevision`, объединить непересекающиеся changes
  без full `/state` и отправить только локальные entity changes. Full state
  остаётся fallback для реальных пересечений, слишком старой revision или
  непокрытых legacy-полей.
- Eager demo/template loading (ранняя загрузка шаблонов): не загружать
  `demo-state` и `demo-state:en` на старте личной укладки, если пользователь не
  открывал demo/template контекст.

## Проверка

Минимальный regression-набор (регрессионная проверка) перед каждым шагом:

- `npm.cmd run test:critical`
- `npm.cmd run check`
- `npm.cmd run build`
- ручной Network audit (проверка сетевых запросов) на production: обычные
  действия не отправляют `POST /bike-packing-data.json` и не читают
  `GET /bike-packing-data.json`;
- ручной startup audit (проверка запуска): второй reload без изменений должен
  показывать `/freshness` и не должен показывать тяжёлый
  `/bike-packing/lists/:id/state`;
- ручной template audit (проверка шаблонов): demo/shared payload должен идти
  через `/bike-packing/public-template-payloads/:itemKey`, без
  `/bike-packing-data.json`.
