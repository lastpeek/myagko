const NOVOSIBIRSK = "Asia/Novosibirsk";

export const BUSINESS_TIMEZONE = NOVOSIBIRSK;

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

/** Сегодняшняя дата в часовом поясе компании, YYYY-MM-DD. */
export function todayInBusinessTimezone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NOVOSIBIRSK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isPastDate(value: string, now: Date = new Date()): boolean {
  return value < todayInBusinessTimezone(now);
}

export function timeRangeIsValid(from: string, to: string): boolean {
  return isValidTime(from) && isValidTime(to) && from < to;
}

/** Время «сейчас» для подписи «обновлено в 12:03». */
export function formatClock(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NOVOSIBIRSK,
  }).format(date);
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: NOVOSIBIRSK,
  }).format(date);
}
