# Публикация экспериментального фронтенда

Для `experiment.vniipo-help.ru` и `exp-to-prod.vniipo-help.ru` действует
GitHub-first порядок. Сервер не должен получать сборку из незакоммиченного
рабочего дерева.

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
не архивирует фотографии. Для приложения stage заполняется через hard links
только из текущего release, не переходя по symlink assets. Передаются only new or changed
files приложения. Изменение или отсутствие любого assets-файла останавливает этот
режим публикации. Каталог фотографий не перемещается и не удаляется, в том числе
при rollback. Точный список дельты сохраняется в ftp-upload/release-evidence.

Перед atomic directory rename сценарий выполняет full file-count, byte-count,
and SHA-256 verification stage, а после активации сверяет ключевые HTTPS-файлы и
образец повторно использованного assets-файла. При несовпадении публичной
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

Frontend на `experiment.vniipo-help.ru` выбирает `https://api.vniipo-help.ru/experiment/letters-vniipo/api` и через
nginx обращается только к отдельному процессу `bikepacking-api-experiment` на
локальном порту 4312. Все остальные frontend-хосты продолжают использовать
`https://api.vniipo-help.ru`; экспериментальное повышение версии API не должно
менять compatibility version production API.

Если workflow отсутствует, завершился ошибкой или относится к другому SHA,
деплой не начинать и успешным не считать. При ошибке активации или внешней
проверки вернуть сохранённый web-каталог. Аварийный откат к ранее опубликованной
и уже проверенной резервной версии не требует нового workflow, но результат
отката нужно проверить снаружи.

Общая cookie: personal_tags_session, host-only api.vniipo-help.ru. Auth subpath
нового prefix идёт напрямую на 4315; private API остаётся на 4312. Для CI сохранён
публичный read-only alias capabilities на experiment-host без передачи Cookie.
Сам deploy проверяет контракт по новому prefix. Старые клиентские API-запросы
получают 409 experiment_update_required; обновление не удаляет локальные данные.
Сначала требуется подтверждение опубликованного Shared Auth, затем API/routing,
затем этот frontend. См. docs/canonical-session-release.md.
