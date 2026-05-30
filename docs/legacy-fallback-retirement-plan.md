# Legacy fallback retirement plan (план вывода legacy fallback)

Рабочий статус: entity sync baseline (базовый переход на entity sync) считается
закрытым, а `/bike-packing-data.json` должен остаться только как временная
совместимость и аварийная страховка.

Текущий статус `v974`: обычный повторный startup (запуск) залогиненного
пользователя при неизменной `/freshness` (свежести) больше не должен тянуть
тяжёлый `/bike-packing/lists/:id/state`. Demo/shared шаблоны читаются через
dedicated payload endpoint (отдельную конечную точку payload)
`/bike-packing/public-template-payloads/:itemKey`.

Следующий API-first шаг: добавлен changes feed (лента изменений сущностей)
`/bike-packing/lists/:id/changes?sinceRevision=N`. Он должен позволить другому
устройству после изменившейся `/freshness` забрать только changed/deleted
entities (измененные/удаленные сущности), а не полный `/state`.

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
- old API compatibility (совместимость со старым API): новый list/entity API
  (API списков и сущностей) недоступен, старый процесс API еще не обновлен или
  временно не отвечает.
- too old revision (слишком старая revision): локальная `stateRevision` настолько
  старая или неполная, что changes feed (лента изменений сущностей) не может
  гарантированно восстановить все изменения. Тогда нужен full `/state`.
- первый payload шаблона (первая загрузка состояния шаблона):
  shared/public-template itemKey path (путь по ключу шаблона) переведен на
  `/bike-packing/public-template-payloads/:itemKey` с capability (возможностью API)
  `publicTemplatePayloadEndpoint`; старый `/bike-packing-data.json` остается
  только compatibility fallback (резервный путь совместимости) для API без этого
  endpoint (конечной точки). Повторный refresh (обновление) при том же
  `updatedAt` уже покрыт cache-тестом (тестом кэша).

## Недопустимые обычные сценарии

Эти действия не должны доходить до `POST /bike-packing-data.json` или full
payload save (полной записи состояния), если list API (API списков) и entity
endpoints (endpoints сущностей) доступны:

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

## Условия для отключения legacy fallback (резервного legacy-пути)

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
   умолчанию) и после стабилизации `v974+`.
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
7. Backend production отдает capability `entityChangesFeed` и endpoint
   `/bike-packing/lists/:id/changes?sinceRevision=N` для точечного получения
   changed/deleted entities.

## Шаги удаления

1. Ужесточить capability/version gate (проверку возможностей и версии API):
   если list/entity API отсутствует, frontend не должен молча писать legacy
   payload для обычных сохранений.
2. Done (готово): public template payload чтение переведено на dedicated backend
   endpoint `/bike-packing/public-template-payloads/:itemKey`; legacy reader
   (старый читатель payload) оставлен только для старого API.
3. Done (готово): повторный залогиненный startup при неизменной freshness
   переиспользует локальное состояние и не тянет тяжёлый `/lists/:id/state`.
4. Done API-first (готово на стороне API): добавлен changes feed
   `/bike-packing/lists/:id/changes?sinceRevision=N` для `items`, `containers`,
   `layouts`, `dictionaries`.
5. Done frontend-first (готово на стороне frontend): `v975` при startup refresh
   и background refresh после изменившейся `/freshness` сначала пробует changes
   feed и применяет changed/deleted entities, а full `/state` использует только
   как fallback при неуспешном применении, слишком старой revision или старом API.
6. Проработать dirty offline rebase (перебазирование локальных offline-изменений):
   если устройство было offline и изменило entity A, а сервер параллельно получил
   изменение entity B, фронт должен при stale `baseStateRevision` запросить
   `/changes?sinceRevision=baseStateRevision`, объединить непересекающиеся changes
   без full `/state` и отправить только локальные entity changes. Full state
   остаётся fallback для реальных пересечений, слишком старой revision или
   непокрытых legacy-полей.
7. Оптимизировать eager demo/template loading (раннюю загрузку шаблонов):
   не загружать `demo-state` и `demo-state:en` на старте личной укладки, если
   пользователь не открывал demo/template контекст.
8. Оставить `/bike-packing-data.json` только для read-only import/recovery
   периода (периода импорта/восстановления только на чтение), без
   автоматического save fallback (резервной записи).
9. После одного-двух стабильных релизов удалить automatic legacy writer
   (автоматическую legacy-запись) из `saveRemoteStateRecord`.
10. Последним шагом удалить legacy reader (legacy-чтение) из обычного startup
   path (пути запуска приложения).

## Проверка

Минимальный regression-набор (регрессионная проверка) перед каждым шагом:

- `npm.cmd run test:critical`
- `npm.cmd run check`
- `npm.cmd run build`
- ручной Network audit (проверка сетевых запросов) на production: обычные
  действия не отправляют `POST /bike-packing-data.json`;
- ручной startup audit (проверка запуска): второй reload без изменений должен
  показывать `/freshness` и не должен показывать тяжёлый
  `/bike-packing/lists/:id/state`;
- ручной template audit (проверка шаблонов): demo/shared payload должен идти
  через `/bike-packing/public-template-payloads/:itemKey`, без
  `/bike-packing-data.json`.
