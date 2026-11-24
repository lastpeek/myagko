/** Подпись территории начинается с города — обновляем город в начале. */
export function syncTerritoryCity(
  previousCity: string,
  nextCity: string,
  territory: string,
): string {
  const previous = previousCity.trim();
  const next = nextCity.trim();
  const value = territory.trim();

  if (!previous || !value) return territory;
  if (value.slice(0, previous.length).toLocaleLowerCase("ru") !== previous.toLocaleLowerCase("ru")) {
    return territory;
  }

  const rest = value.slice(previous.length);
  return `${next}${rest}`.trim();
}

/** Город и территория без повтора: «Красноярск · Красноярск и пригород» не нужен. */
export function territoryLabel(city: string, territory: string): string {
  const value = territory.trim();
  if (!value) return city.trim();
  const cityLabel = city.trim();
  if (!cityLabel) return value;
  if (value.toLocaleLowerCase("ru").startsWith(cityLabel.toLocaleLowerCase("ru"))) {
    return value;
  }
  return `${cityLabel} · ${value}`;
}
