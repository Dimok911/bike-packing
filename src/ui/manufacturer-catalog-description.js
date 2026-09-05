const TECHNICAL_PROVENANCE_REPLACEMENTS = [
  [
    "Technical data is normalized from the official product page.",
    "Specifications are from the manufacturer's official product page."
  ],
  [
    "Характеристики нормализованы по официальной карточке товара.",
    "Характеристики взяты с официальной страницы производителя."
  ]
];

export function plainManufacturerCatalogDescription(value) {
  return TECHNICAL_PROVENANCE_REPLACEMENTS.reduce(
    (text, [technical, plain]) => text.replace(technical, plain),
    String(value || "")
  );
}
