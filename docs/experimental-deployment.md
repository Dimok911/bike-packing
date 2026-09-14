# Публикация экспериментального фронтенда

Для `experiment.vniipo-help.ru` и `exp-to-prod.vniipo-help.ru` по умолчанию действует
GitHub-first порядок. Сервер не должен получать сборку из незакоммиченного
рабочего дерева.

## Выпуск только приложения с неподвижными фотографиями

Если фотографии нельзя повторно передавать, перемещать или удалять, запускать
`scripts/deploy-experiment-vps.ps1 -ApplicationOnly`. Этот путь использует
отдельный `deploy-experiment-application-remote.sh`; общий assets-каталог не
копируется, не переименовывается и не очищается. Каждый asset сборки должен уже
существовать с точным SHA-256. Несовпадение останавливает выпуск до upload.

В архив входят только файлы приложения из разрешённого перечня и JavaScript
chunks. Staging создаётся пустым, с новой ссылкой на существующий assets-каталог.
Перед активацией повторно проверяется исходный live manifest; чужой параллельный
выпуск не перезаписывается. После смены приложения проверяются хэши и identity
каталога assets. Откат меняет только приложение, в том числе при потере ответа
об активации. Публичные файлы после отката сверяются с исходными хэшами.

По умолчанию сценарий проверяет успешный `Frontend quality` для точного SHA и контракт
живого API. Проверка выпуска обязательно включает пять настоящих Linux файловых сценариев
активации/отката, потерянного ответа, конкурентного изменения и отказов.
Windows не засчитывается за проверку Linux inode/symlink. Материалы выпуска
сохраняются локально в ignored `ftp-upload/<release-id>`.

```powershell
pwsh -File scripts/deploy-experiment-vps.ps1 -ApplicationOnly -ExpectedCommit <40-char-sha> -ExpectedVersion vNNN
```

### Явная локальная проверка без GitHub Actions

Если пользователь явно разрешил публикацию без Actions, например после исчерпания
лимита, `-ApplicationOnly -LocalValidationReport <report.json>` заменяет только
проверку workflow. Без этого параметра прежняя проверка exact-SHA workflow обязательна.
Другие режимы не принимают локальный отчёт. Контракт живого API, неподвижные assets,
staging, полные хэши, исходный live manifest, backup, rollback и HTTPS остаются обязательными.

Подготовить чистый commit выпуска, собрать приложение и сохранить fingerprint **до**
проверок. Все tracked-файлы, включая тесты и документацию, входят в source manifest;
неигнорируемые новые файлы также останавливают проверку. Сборка проверяется отдельным
полным manifest path/size/SHA-256. Логи и отчёт хранить в ignored каталоге.

```powershell
node scripts/verify-local-release.mjs fingerprint --root . --artifact www/vniipo-help.ru/bike-packing --version v1611
```

Запустить `npm run check`, `npm run test:critical`, `npm run test:transport`,
`npm run build`, `npm run check:live-api-contract`, выбранный и явно записанный
browser-набор выпуска и Linux-тест ниже. Новый валидатор отдельно проверяется командой
`node --test tests/critical/local-release-validation.test.js tests/critical/experiment-vps-deployment.test.js`.
Сохранить команды, результаты и UTF-8 логи. Пересборка после fingerprint допустима
только при совпадении всех байтов. Изменение исходников требует нового commit,
fingerprint и соответствующих проверок.

В `checks.json` сохранить четыре поля вывода fingerprint и массив `checks` с ровно
семью уникальными `id`: `source`, `critical`, `transport`, `browser`, `build`,
`liveApi`, `linuxApplication`. Каждая запись содержит `log` (относительный путь внутри
каталога отчёта) и `exitCode: 0`. Для `critical`, `transport`, `browser` и
`linuxApplication` также обязательны целые `tests`, `passed`, `failed`, `skipped`:
`tests > 0`, `passed === tests`, `failed === skipped === 0`. Последняя запись дополнительно
требует `platform: "linux"`, ровно пять тестов и подтверждающие TAP totals в логе.
Пример одной записи:

```json
{"id":"linuxApplication","log":"linux-application.txt","exitCode":0,"platform":"linux","tests":5,"passed":5,"failed":0,"skipped":0}
```

Это отчёт оператора о выполненных локальных проверках, а не криптографическая
аттестация GitHub и не утверждение, что выбранный browser-набор равен всей CI-матрице.
Валидатор сам вычисляет хэши логов; не переносить сведения об успехе из другого выпуска.
`checks.json`, `report.json` и логи должны находиться в одном evidence-каталоге
(логи могут быть в его подкаталогах).

```powershell
node scripts/verify-local-release.mjs create --root . --artifact www/vniipo-help.ru/bike-packing --version v1611 --checks node_modules/.cache/release-validation/checks.json --report node_modules/.cache/release-validation/report.json
node scripts/verify-local-release.mjs verify --root . --artifact www/vniipo-help.ru/bike-packing --version v1611 --commit <40-char-sha> --report node_modules/.cache/release-validation/report.json
pwsh -File scripts/deploy-experiment-vps.ps1 -ApplicationOnly -ExpectedCommit <40-char-sha> -ExpectedVersion v1611 -LocalValidationReport node_modules/.cache/release-validation/report.json
```

Скрипт проверяет отчёт до первого обращения к серверу и повторно проверяет исходники,
сборку и логи непосредственно перед созданием архива. Существующий отчёт не перезаписывается.

### Пять файловых сценариев на Linux без Actions

Тест использует только встроенные модули Node.js и `bash`, GNU `tar`/coreutils,
`find`, `which`, `flock`. Можно выполнить в локальном Linux/WSL либо через SSH
обычным пользователем в отдельном `/tmp/bike-app-validation.XXXXXXXX`:

```sh
node --version
node -p 'process.platform'
node --test --test-reporter=tap tests/integration/experiment-application-deployment.test.js > linux-application.txt 2>&1
```

Для изолированного запуска достаточно трёх файлов из точного commit:
`package.json`, `tests/integration/experiment-application-deployment.test.js`,
`scripts/deploy-experiment-application-remote.sh`. Передать их через `git archive`
или копированием с проверкой SHA-256, сохранив относительные пути; `.env`, ключи и
остальные данные проекта не нужны. Проверить код возврата и `tests 5 / pass 5 /
fail 0 / skipped 0`; Windows-пропуски не принимаются.

Запускать именно Node-тест, не production shell entry point. Fixture создаёт свой
`mkdtemp`, подставляет временный `parent` только в копию shell-скрипта и проверяет:
активацию/откат с неизменными bytes/inodes фотографий; потерю ответа; чужое изменение
live; неверный asset hash/изображение в архиве приложения; автоматический откат после
порчи активированного приложения. Рабочий `/var/www` и сеть эти тесты не используют.
После сохранения логов удалять только проверенные созданные временные каталоги.

Ниже описан прежний общий режим обновления статических assets. Он не подходит
для выпуска с требованием оставить фотографии и их каталоги на месте.

## Обязательная последовательность

1. Подготовить изменения в отдельной ветке и выполнить локально `npm.cmd run
   check`, `npm.cmd run test:critical` и `npm.cmd run build`.
2. Закоммитить и запушить ветку в GitHub.
3. Дождаться успешного workflow `Frontend quality` для точного commit SHA,
   который планируется публиковать.
4. Проверить, что живой Experiment API полностью соответствует версии и
   возможностям из `release-contract.json` собранного frontend.
5. Собрать frontend из этого commit с чистым working tree.
6. Загрузить сборку в уникальный staging-каталог рядом с целевым web-каталогом
   и сверить SHA-256 файлов.
7. Сохранить текущий web-каталог как резервный и активировать staging
   переименованием.
8. Проверить снаружи HTTPS, версию приложения, `app.js`, `styles.css`, `sw.js`,
   статические assets и доступность API через целевой поддомен.
9. Сверить SHA-256 ключевых публичных файлов со сборкой проверенного commit.

## Инкрементальная публикация статического каталога

Для VPS используется `scripts/deploy-experiment-vps.ps1`. Сценарий строит
manifest of actual SHA-256 для всей сборки и сравнивает его с текущим live.
Vite публикует изображения глобального каталога как content-hashed файлы в
`assets/`. Весь build-каталог `assets/` хранится в persistent shared directory
`/var/www/experiment-shared/assets`, а release-каталог содержит только symlink
на него. Пользовательские фото API/БД в build не входят. Поэтому frontend backup
не архивирует фотографии. Assets stage заполняется через hard links, затем links
изменившихся путей удаляются перед распаковкой. Передаются only new or changed
files; совпадение по имени без совпадения фактического SHA-256 не считается
повторным использованием. Старый catalog stage существует только до внешнего
smoke/rollback gate и удаляется после успешного релиза.

Перед atomic directory rename сценарий выполняет full file-count, byte-count,
and SHA-256 verification stage, а после активации сверяет ключевые HTTPS-файлы и
образцы повторно использованных/новых фотографий. При несовпадении публичной
проверки предыдущий каталог автоматически возвращается на место. FTPS и хост
`88.212.206.188` для Experiment не используются.

До первого SSH-чтения или upload сценарий сверяет `release-contract.json` с
live Experiment API. Несовпадение версии или отсутствие любой обязательной
возможности останавливает публикацию до изменения файлов на сервере.

Пример после успешного workflow `Frontend quality` для точного SHA:

```powershell
npm.cmd run build
pwsh -File scripts/deploy-experiment-vps.ps1 -ExpectedCommit <40-char-sha> -ExpectedVersion vNNN
```

## Изоляция API

Frontend на `experiment.vniipo-help.ru` выбирает одноимённый API origin и через
nginx обращается только к отдельному процессу `bikepacking-api-experiment` на
локальном порту 4312. Все остальные frontend-хосты продолжают использовать
`https://api.vniipo-help.ru`; экспериментальное повышение версии API не должно
менять compatibility version production API.

Если workflow отсутствует, завершился ошибкой или относится к другому SHA,
деплой по обычному пути не начинать и успешным не считать. Единственное описанное
выше исключение — явно разрешённый application-only выпуск с проверенным локальным
отчётом. При ошибке активации или внешней
проверки вернуть сохранённый web-каталог. Аварийный откат к ранее опубликованной
и уже проверенной резервной версии не требует нового workflow, но результат
отката нужно проверить снаружи.
