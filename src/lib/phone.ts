/**
 * Нормализация телефона к +7XXXXXXXXXX.
 * Принимает 8…, 7…, +7…, пробелы, дефисы, скобки.
 * Возвращает null, если номер не похож на российский мобильный/городской.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7${digits.slice(1)}`;
  }

  if (digits.length === 10 && digits.startsWith("9")) {
    return `+7${digits}`;
  }

  return null;
}

export function isValidPhone(raw: string): boolean {
  return normalizePhone(raw) !== null;
}

export function formatPhone(normalized: string): string {
  if (!/^\+7\d{10}$/.test(normalized)) return normalized;
  const d = normalized.slice(2);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8)}`;
}

/** Для tel: — без пробелов. */
export function phoneHref(normalized: string): string {
  return `tel:${normalized}`;
}
