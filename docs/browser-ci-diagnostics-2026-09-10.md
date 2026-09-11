# Мобильные прерывания Linux CI: подтверждённые факты

## CI 20e8e92: фото-превью и два подтверждённых падения, 11.09.2026

[Run 34585849626](https://github.com/Dimok911/bike-packing/actions/runs/34585849626)
завершился ошибкой mobile WebKit: 1486 passed, 292 skipped, 6 flaky, 1 failed;
Chromium successful. Единственный окончательный отказ —
`composed item photo form preserves placement and availability (create)`:
ожидалось 2 изображения превью, получено 0 в обеих попытках.

Архив `10262160718` сохранён как `ci-20e8e92-mobile.zip`.
В обеих трассах `browser-lifecycle` есть `page-crash`: 11:02:45.118 и
11:03:31.601 UTC. Kernel зафиксировал соответствующие segfault compositor
в 11:02:17 и 11:03:00; уведомление автоматизации пришло позже самого отказа.
Всего в этом запуске 9 segfault в той же `libWPEWebKit-2.0.so.1.10.2`,
смещение `5fd556a`. OOM/oom_kill в доступных cgroup равны нулю.
Это подтверждённые нативные отказы, а не установленная регрессия фотоформы.
Ожидания количества фото, тайм-ауты и число повторов не изменены.

Данные: `resume-ci-20e8e92-mobile.txt`,
`resume-ci-20e8e92-linux-browser.txt`, `ci-20e8e92-photo-lifecycle.json`
в локальном каталоге доказательств. Причина внутри библиотеки и исправление
ещё не установлены; успешные повторные запуски не закрывают этот вопрос.

`7d634e9`, [34550648965](https://github.com/Dimok911/bike-packing/actions/runs/34550648965):
Chromium **847 passed / 260 skipped** (45,9 минуты), mobile **807 passed /
268 skipped / 6 flaky** (1,3 часа), OFF по 4/4. Артефакт 10182509328 сохранён
как `ci-7d634e9-mobile.zip`; lifecycle извлечён в
`ci-7d634e9-lifecycle-analysis.json` рядом с полными журналами.

Все пять личных неудачных первых попыток имеют `page-crash`. В их интервалах
ядро фиксирует прежний segfault compositor со смещением `5fd556a`: 02:09:36,
02:11:09, 02:29:20, 02:31:03 и 02:38:56 UTC 11.09.2026. В том числе падение
страницы предшествует ошибке ожидания текста успешного восстановления — этот
текст не служит доказательством дефекта восстановления. OOM-счётчики службы
и родителя остаются нулевыми; пики 13 760 876 544 / 16 229 117 952 байт.
Корневые метрики отсутствуют. Шестая попытка (административная межшаблонная
копия) завершилась без crash, но с `Cache API operation failed: Context is
stopped`, пустым стеком и URL; это соответствует ранее выделенному reload-
наблюдению ниже. Ошибки не фильтруются и не объявляются исправленными.

Новые завершённые контрольные точки 11.09:

- `ceaa4ae`, [34548946886](https://github.com/Dimok911/bike-packing/actions/runs/34548946886):
  Chromium 827 passed / 260 skipped (47,1 минуты), mobile 788 passed /
  268 skipped / 5 flaky (59,2 минуты), OFF 4/4 в обоих браузерах. В артефакте
  10181508086 (`ci-ceaa4ae-mobile.zip`) подтверждены пять segfault compositor:
  01:19:14, 01:26:35, 01:40:32, 01:43:44, 01:47:02 UTC, смещение `5fd556a`,
  прежний Build ID `775f8be98a373450400132b921d85a4c62795f60`. Измеренные OOM-
  счётчики службы/родителя нулевые; пики 10 481 278 976 / 16 225 804 288 байт.
- `5f35b3a`, [34547328037](https://github.com/Dimok911/bike-packing/actions/runs/34547328037):
  Chromium 805 passed / 260 skipped (54,5 минуты), mobile 769 passed /
  268 skipped / 2 flaky (1,2 часа), OFF по 4/4. Полные журналы сохранены.
  Артефакт 10181273252 (`ci-5f35b3a-mobile.zip`) получен после одного сетевого
  тайм-аута. Ядро подтвердило два segfault compositor в 00:47:24 и 01:28:57 UTC,
  то же смещение/Build ID. OOM-счётчики службы/родителя нулевые; пики
  14 169 423 872 / 16 215 764 992 байт, корневые метрики отсутствуют.

Оба запуска формально successful. Повторы не закрывают нативную проблему;
они не объявляются чистой браузерной приёмкой. Новые локальные UI-проверки
оцениваются отдельно, без фильтрации pageerror и без повторных попыток.

Отдельное локальное наблюдение: `Cache API operation failed: Context is stopped`
при reload, без page-crash. В `resume-admin-cross-tree-ui-1.txt` это один отказ
проверки pageerror (19/20); последующие неизменённые UI 10/10 и расширенные
84/84 прошли. Минимальный `scripts/diagnose-webkit-cache-reload.mjs` запускает
свежий WebKit iPhone-контекст с перехваченным локальным HTML, без приложения,
пользовательских данных или service worker. Все Cache promises обработаны.
Прогон `cache-reload-probe-1.txt`: 25 контрольных reload без ошибок; 25 reload
с Cache API — одна такая же ошибка на первом повторе, пустой стек, без crash.
Это воспроизводит ошибку независимо от приложения, но не доказывает причину
Linux segfault и не является исправлением. Ошибки в UI-тестах не фильтруются.

Контрольная точка `eb7f9b2`, [CI 34544253383](https://github.com/Dimok911/bike-packing/actions/runs/34544253383):
Chromium завершён успешно — 783 passed / 260 skipped, 39,8 минуты; OFF 4/4.
В полном журнале `resume-ci-eb7f9b2-chromium.txt` нет flaky summary или
признаков crash. Mobile завершён: 743 passed / 268 skipped / 6 flaky, 1,1 часа;
OFF 4/4. Запуск формально successful, но чистая браузерная приёмка не заявляется.
Артефакт `ci-eb7f9b2-mobile.zip` (10180144015) и полный mobile-журнал сохранены.
В `ci-eb7f9b2-linux-browser.txt` ядро фиксирует шесть segfault compositor по
тому же смещению `5fd556a`: 00:16:55, 00:23:15, 00:25:27, 00:27:33, 00:44:36,
00:48:18 UTC 11.09. Служба и system.slice: memory.max=max, все OOM-счётчики 0;
пики 12 225 081 344 и 16 214 212 608 байт; корневые метрики отсутствуют.

Новая ограниченная диагностика подтвердила Build ID библиотеки
`775f8be98a373450400132b921d85a4c62795f60`. На `5fd556a` инструкция
`mov (%rdi),%rax`, за ней косвенный вызов; вместе с kernel fault address 0
это указывает на чтение по нулевому указателю. Символ `jsc_weak_value_get_value`
в выводе — лишь ближайший экспортированный символ stripped-библиотеки,
не установленная функция сбоя; строка исходника `??:?`. Стек/причина ещё
не установлены. Это диагноз места машинного отказа, не исправление WebKit.
Следующие CI `34547328037` (`5f35b3a`) и `34548946886` (`ceaa4ae`) ещё выполняются.

Последующий [CI 34540700823](https://github.com/Dimok911/bike-packing/actions/runs/34540700823),
FE `76b51d6`, завершён успешно с первой попытки в обоих браузерах: Chromium
737 passed / 260 skipped, mobile 705 passed / 268 skipped, OFF по 4/4.
В полных журналах этого запуска нет flaky summary, `Target crashed` или
`segfault at`. Это подтверждает успешный прогон этой контрольной точки,
но не устанавливает причину и не закрывает прежние непостоянные падения.
Журналы `resume-ci-76b51d6-chromium.txt` и `resume-ci-76b51d6-mobile.txt` сохранены.

Run `34531714499`, FE `130485c`, завершён успешно: Chromium 625 passed /
260 skipped, mobile 593 passed / 268 skipped / 2 flaky; OFF 4/4 на каждом.
Оба первых mobile-отказа (pending photo copy / container deletion / both и
pending archive descendants / full quota) содержат `page-crash`. Ядро
зафиксировало ещё два segfault потока `eadedCompositor` в той же библиотеке
`libWPEWebKit-2.0.so.1.10.2`, смещение `5fd556a`, в 21:48:57 и 21:57:49 UTC.
Первичные assertions различаются, но нативное падение во время обоих тестов
подтверждено независимо. Причина внутри WebKit всё ещё не установлена.
Сохранены `ci-130485c-mobile.zip`, `ci-130485c-mobile-analysis.json`,
`ci-130485c-linux-browser.txt` и оба `resume-ci-130485c-*.txt`.

## Чтение cgroup службы CI — 11.09

Диагностика читает фактический путь `0::...` из `/proc/self/cgroup`, затем
`memory.current`, `memory.max`, `memory.peak` и `memory.events` этой службы
и её родителей вплоть до `/sys/fs/cgroup`. Это устраняет пробел прежнего
отчёта, который проверял только корень и получил отсутствующие файлы.
Те же данные фиксируются при падении страницы и в финальном Linux-отчёте.
Отсутствующие метрики остаются `null`; cgroup v1 не выдаётся за измеренный v2.
Пути ограничены mount, обход родителей ограничен 16 уровнями. Окружение,
аргументы процессов и дампы памяти по-прежнему не читаются.

Проверки: `resume-browser-cgroup-unit-1.txt`, 2/2; shell syntax без ошибок.
Контроль включает службу с лимитом при отсутствующих корневых метриках,
родительский лимит, корневой/v1/недоступный/некорректный путь. Нативная причина
WebKit остаётся открытой; это дополнение диагностики, не исправление браузера.

## Итоги следующего полного CI

[34521684378](https://github.com/Dimok911/bike-packing/actions/runs/34521684378),
frontend `dd1503a`: оба job успешны. Chromium 581 passed; mobile 550 passed,
268 skipped, 1 flaky; отдельный OFF-набор 4/4 на каждом браузере.
Первый сбой mobile относится к pending photo copy batch / container deletion /
copy. Lifecycle содержит `page-crash`, соединение браузера оставалось открытым.
Журнал ядра в том же временном интервале зафиксировал `segfault at 0` в
`libWPEWebKit-2.0.so.1.10.2`, поток `eadedCompositor`, адрес в библиотеке
`5fd556a`. Это подтверждённый нативный сбой WebKit; конкретная причина и
исправление ещё не установлены. Новая диагностика сохранила нужное свидетельство.
Файлы памяти корневого cgroup отсутствовали, поэтому его лимиты не измерены;
путь процесса — `/system.slice/hosted-compute-agent.service`. Для следующего
разбора нужны символы/backtrace и чтение именно этого cgroup.

Предыдущий [34520315971](https://github.com/Dimok911/bike-packing/actions/runs/34520315971),
frontend `d653d83`: оба job успешны; mobile 550 passed, 268 skipped, 1 flaky,
OFF 4/4. Единственный повтор относится к справочнику, при добавлении категории
после удаления места хранения. В trace нет page-crash и ошибок приложения.
После `fill("Питание")`, ещё до `blur`/`tap`, живое поле уже пустое. В локальном
воспроизведении поле не заменялось, а нативный фокус блокировало ещё открытое
окно проверки сохранённых данных. Тест дополнен ожиданием готовности интерфейса;
отдельно проверена сохранность DOM при обновлении: `dictionary-input-render-race.md`.

Архивы `ci-d653d83-mobile.zip`, `ci-dd1503a-mobile.zip`, соответствующие
`*-analysis.json`, `ci-d653d83-dictionary-trace.json`, `ci-dd1503a-linux-browser.txt`
и полные журналы находятся в прежней игнорируемой папке evidence.

## Проверка метрик службы, 11.09.2026

[CI 34537099623](https://github.com/Dimok911/bike-packing/actions/runs/34537099623),
frontend `5c5b8dc`: оба job успешны. Chromium — 669 passed / 260 skipped;
mobile — 631 passed / 268 skipped / 8 flaky. OFF-наборы — по 4/4.

Во всех восьми первых попытках есть `page-crash`. Ядро зарегистрировало восемь
`eadedCompositor` segfault at 0 в `libWPEWebKit-2.0.so.1.10.2`, offset `5fd556a`,
в соответствующих интервалах тестов (22:24:36, 22:49:37, 22:50:55, 22:52:01,
22:53:08, 23:03:28, 23:08:25, 23:16:13 UTC 10.09). Время уведомления Playwright
о падении позже записи ядра; не используем его как точное время начала сбоя.

Новая диагностика читает реальный `hosted-compute-agent.service` и его предка
`system.slice`: `memory.max=max`, события `oom`, `oom_kill`, `max` равны нулю
до и после каждого сбоя. Корневые метрики по-прежнему недоступны. Полученные
данные не подтверждают завершение из-за лимита памяти. Точное место ошибки
движка и способ её устранения остаются открытыми; успешный повтор не закрывает
эту проблему. Проверки/таймауты не ослаблены.

Полные журналы, `ci-5c5b8dc-mobile.zip`, `ci-5c5b8dc-mobile-analysis.json` и
`ci-5c5b8dc-linux-browser.txt` сохранены в игнорируемой папке evidence.

Для следующего CI добавлено ограниченное чтение символов установленной библиотеки
Playwright: Build ID, `addr2line` и 128 байт дизассемблирования около смещения,
которое сообщил сам kernel. Неизвестное смещение не выдумывается; число уникальных
смещений ограничено четырьмя, библиотек — двумя, отдельные команды — 5 секундами.
Дампы памяти не создаются. Shell syntax проверен; получение символов на Linux
ещё предстоит и само по себе не считается исправлением падения.

## Предыдущие свидетельства

Проверка от 10.09.2026 после реализации административной копии
`d653d83` / backend `44d2e09`. Исправление причин падения WebKit ещё не заявлено.
Проверки приложения не ослаблены, таймауты и количество retries не увеличены.

## Сохранённая диагностика

- [CI 34513968176](https://github.com/Dimok911/bike-packing/actions/runs/34513968176),
  frontend `6a2dc6a`: оба job успешны. Mobile: 533 passed, 268 skipped,
  6 flaky; отдельный OFF-набор 4/4. Во всех шести первых сбоях подтверждено
  падение страницы: пять `page-crash` в приложении `browser-lifecycle` и
  `Target crashed` в административном trace. Соединение браузера у пяти
  отслеживаемых личных случаев оставалось открытым, ОС показывала 13,6–14,6 ГБ
  свободной памяти. Это не исключает лимит cgroup или внутренний сбой процесса.
- [CI 34510750011](https://github.com/Dimok911/bike-packing/actions/runs/34510750011),
  frontend `05ab1e7`: оба job успешны. Mobile: 523 passed, 268 skipped,
  4 flaky; OFF 4/4. Три случая имеют `page-crash` до диагностического отчёта.
  В четвёртом (подготовка mixed photo item/queue quota) сначала не появился
  ожидаемый POST, а затем диагностический вызов получил `Target crashed`.
  Первоначальный отчёт lifecycle был сохранён до этого падения и его не включил.
  Причина первой проверки количества POST этим не установлена.

Артефакты скачаны через GitHub API, хранятся в игнорируемой папке
`node_modules/.cache/causal-evidence/2026-09-08/`: `ci-6a2dc6a-mobile.zip`,
`ci-05ab1e7-mobile.zip`, одноимённые `*-analysis.json` и полные журналы CI.
Текстовые ошибки ожидания видимости формы/числа фото сами по себе не доказывают
дефект этих форм: соответствующая страница в большинстве случаев уже падала.

## Улучшение отчётов

Общий fixture `trackBrowserLifecycle` снимает данные из процесса тестов, даже
если страница больше не отвечает. Личные и административные тесты теперь
сохраняют lifecycle после попыток чтения диагностики. Ошибка чтения страницы
не теряет административный отчёт и не подменяет первичную ошибку новым
необработанным исключением afterEach. На Linux добавлены путь cgroup и
`memory.current/max/peak/events` корневого cgroup.

После Browser smoke CI сохраняет ограниченный отчёт Linux: память, имена
процессов/RSS и сообщения ядра о падениях/нехватке памяти с момента начала
smoke. Чтение журнала ограничено 15 секундами. Окружение процессов, полные
аргументы команд и содержимое памяти в этот отчёт не включаются. Системные
настройки и браузерная версия не меняются.

Это дополнительная диагностика, а не исправление WebKit. Следующий отчёт
позволит проверить signal/segfault/OOM. Если его недостаточно, понадобится
нативный backtrace по [инструкции WebKit](https://trac.webkit.org/wiki/WebKitGTK/Debugging).
Произвольное увеличение ожиданий или обновление браузера без проверки причины
не считается устранением сбоя.

Синтаксис JavaScript, shell и YAML проверен. Целевой UI после изменения
диагностики — **6/6**, Chromium/mobile WebKit, без повторов: копия шаблона,
фотоформа сумки/lost-file и mixed фото вещи/queue-quota
(`resume-browser-diagnostics-ui-1.txt`, 2,2 минуты). Полный административный UI 250/250
относится к неизменённому коду приложения `d653d83`; публикаций нет.

## New completed baseline d8b1c6f, 2026-09-11

Run `34554510823` completed successfully. Chromium job `103124180914`:
967 passed / 260 skipped in 1.0 h; disabled-owner checks 4/4.
Mobile job `103124180891`: 917 passed / 278 skipped / 6 flaky in 1.4 h;
disabled-owner checks 4/4. Logs retained as `resume-ci-d8b1c6f-{chromium,mobile}.txt`.
The six mobile first failures include closed/crashed pages and assertion failures;
their current artifact/lifecycle has not yet been correlated, so this does not
close the native WebKit issue or establish the cause of every assertion failure.
Newer checkpoints 5692f0d/6f965f4/a79a50a/b0890ed were still running at this check.
No publication, flags OFF.

## Completed baseline a79a50a and four native failures, 2026-09-11

Run `34559179335` completed successfully. Chromium job `103138194545`:
1107 passed / 260 skipped in 55.5 min; disabled-owner checks 4/4. Mobile job
`103138194381`: 1059 passed / 278 skipped / 4 flaky in 1.6 h; disabled-owner 4/4.
Logs: `resume-ci-a79a50a-{chromium,mobile}.txt`. Mobile artifact `10185780975`
is retained as `ci-a79a50a-mobile.zip`; derived evidence is
`ci-a79a50a-lifecycle-analysis.json` and `ci-a79a50a-linux-browser.txt`.

All four first failed attempts have an explicit `page-crash` lifecycle event,
including the two later reported as enabled/visible assertion failures. Cases:
ordinary item photo copy after source change; selected item photo batch/lost ACK;
pending container photo batch deletion/cancel-both/lost ACK; explicit cancellation
with batch postponement. They are not four established application regressions.

Kernel diagnostics record four `ThreadedCompositor` segfaults in the same bundled
`libWPEWebKit-2.0.so.1.10.2`, at module offset `5fd556a`, during those attempts:
04:45:00, 04:46:39, 04:56:26 and 05:10:54 UTC. Service and ancestor cgroups report
zero OOM kills/events. High-water memory values are 15,689,388,032 bytes for the
runner service and 16,244,039,680 bytes for its parent. This evidence identifies
native crashes; it does not establish the source function, memory lifetime bug,
or a fix. Successful retries do not close native WebKit acceptance.

Checkpoints b0890ed/0957f89/fc72cbc/4921d46 were still running at this inspection.
