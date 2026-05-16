export function guessCategory(name) {
  const text = name.toLowerCase();
  if (match(text, ["палатка", "спальн", "коврик", "подушка"])) return "Сон";
  if (match(text, ["штаны", "футбол", "трусы", "носки", "джерси", "куртка", "ветровка", "баф", "бахил", "ботинки", "кроссовки", "crocs", "гетры", "одежда"])) return "Одежда";
  if (match(text, ["аптеч", "бинт", "йод", "темпалгин", "энтерол", "клещ", "пластыр"])) return "Медицина";
  if (match(text, ["повербанк", "usb", "gopro", "wahoo", "фонарь", "блок питания", "наушники", "часы", "пульсометр", "sd"])) return "Электроника";
  if (match(text, ["насос", "камера", "покрыш", "тросик", "цеп", "нипп", "co2", "герметик", "педал"])) return "Велозапчасти";
  if (match(text, ["ключ", "монтаж", "инструмент", "мультитул"])) return "Инструменты";
  if (match(text, ["ложка", "горел", "газовый баллон", "кружка", "спички", "салфетки"])) return "Кухня";
  if (match(text, ["каши", "чай", "мюсли", "творог", "сыр", "колбас", "шоколад"])) return "Еда";
  if (match(text, ["вода", "баклаж"])) return "Вода";
  if (match(text, ["паспорт", "карты", "деньг"])) return "Документы";
  if (match(text, ["зубн", "шампунь", "расческа", "крем", "насеком"])) return "Гигиена";
  if (match(text, ["записная", "ручка", "карандаш"])) return "Навигация";
  if (match(text, ["ремонт", "заплат", "стяжки", "стрепы"])) return "Ремонт";
  return "Прочее";
}

export function guessLocation(name) {
  if (name.toLowerCase().includes("надо купить")) return "Надо купить";
  return "Не знаю где";
}

function match(text, words) {
  return words.some((word) => text.includes(word));
}
