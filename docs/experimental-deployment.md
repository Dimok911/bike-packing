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
4. Собрать frontend из этого commit с чистым working tree.
5. Загрузить сборку в уникальный staging-каталог рядом с целевым web-каталогом
   и сверить SHA-256 файлов.
6. Сохранить текущий web-каталог как резервный и активировать staging
   переименованием.
7. Проверить снаружи HTTPS, версию приложения, `app.js`, `styles.css`, `sw.js`,
   статические assets и доступность API через целевой поддомен.
8. Сверить SHA-256 ключевых публичных файлов со сборкой проверенного commit.

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
деплой не начинать и успешным не считать. При ошибке активации или внешней
проверки вернуть сохранённый web-каталог. Аварийный откат к ранее опубликованной
и уже проверенной резервной версии не требует нового workflow, но результат
отката нужно проверить снаружи.
