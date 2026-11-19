const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

/** 3200 → "3 200 ₽" (неразрывные пробелы). */
export function formatRub(value: number | null | undefined): string {
  if (value === null || value === undefined) return "По фото";
  return `${numberFormatter.format(value).replace(/\u202f/g, "\u00a0")}\u00a0₽`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value).replace(/\u202f/g, "\u00a0");
}

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
});

const dateWithWeekdayFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  weekday: "short",
});

/** "2026-11-24" → "24 ноября" без сдвига часового пояса. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return dateFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatDateWithWeekday(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return dateWithWeekdayFormatter.format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatTimeRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (!from) return "";
  if (!to) return from;
  return `${from}–${to}`;
}

export function plural(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
