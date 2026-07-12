# Правила локализации интерфейса

- Все новые пользовательские функции и изменения интерфейса реализуются одновременно на русском и английском языках.
- Перевод обязателен не только для постоянных подписей, но и для динамических статусов, прогресса, подсказок, подтверждений, ошибок и уведомлений.
- При изменении текста нужно обновлять обе языковые ветки словаря и проверять, что в интерфейсе не остались односторонние строковые литералы.
- Названия, даты и числовые значения, которые формируются во время работы приложения, должны использовать текущий язык и часовой пояс браузера, когда это относится к пользовательскому представлению.

## UI localization rules

- Every new user-facing feature and interface change must be implemented in both Russian and English.
- Localization applies to static labels as well as dynamic statuses, progress messages, help text, confirmations, errors, and notifications.
- When copy changes, update both language branches and verify that no single-language user-facing string literals remain.
- Names, dates, and numeric values generated at runtime must use the active language and the browser time zone when they are presented to the user.
