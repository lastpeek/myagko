const numberFormatter = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 0,
});

const moneyFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 3200 → "3 200 ₽"; 3187.5 → "3 187,50 ₽". */
export function formatRub(value: number | null | undefined): string {
  if (value === null || value === undefined) return "По фото";

  const hundredths = Math.round(value * 100);
  if (hundredths % 100 === 0) {
    return `${numberFormatter.format(hundredths / 100).replace(/\u202f/g, "\u00a0")}\u00a0₽`;
  }

  return `${moneyFormatter
    .format(hundredths / 100)
    .replace(/\u202f/g, "\u00a0")}\u00a0₽`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value).replace(/\u202f/g, "\u00a0");
}

/** 20.5 → "20,5"; 20 → "20"; 20.05 → "20,05". */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [integer, fraction = "00"] = rounded.toFixed(2).split(".");
  const int = numberFormatter.format(Number(integer)).replace(/\u202f/g, "\u00a0");
  if (fraction === "00") return int;
  return `${int},${fraction.replace(/0$/, "")}`;
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
