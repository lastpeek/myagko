/**
 * Акцент компании: HEX валидируется на сервере и превращается в тройку
 * токенов для светлой и тёмной темы. Значения выводятся из одного цвета,
 * чтобы в кабинете нельзя было сохранить нечитаемую пару.
 */

export type ThemeColors = {
  accent: string;
  accentSoft: string;
  accentInk: string;
  accentContrast: string;
};

export type AccentTheme = {
  light: ThemeColors;
  dark: ThemeColors;
  contrastOnPaper: number;
  contrastOnAccent: number;
};

const PAPER = "#F7F4EF";
const DARK_PAPER = "#141311";
const WHITE = "#FFFFFF";
const DARK_INK = "#0D1F1A";

export function normalizeHex(input: string): string | null {
  const value = input.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  return null;
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex) ?? "#000000";
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, "0"))
    .join("")}`.toUpperCase();
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) return [0, 0, Math.round(l * 100)];

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  if (sn === 0) {
    const v = ln * 255;
    return [v, v, v];
  }

  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;

  const channel = (t: number) => {
    let tn = t;
    if (tn < 0) tn += 1;
    if (tn > 1) tn -= 1;
    if (tn < 1 / 6) return p + (q - p) * 6 * tn;
    if (tn < 1 / 2) return q;
    if (tn < 2 / 3) return p + (q - p) * (2 / 3 - tn) * 6;
    return p;
  };

  return [
    channel(hn + 1 / 3) * 255,
    channel(hn) * 255,
    channel(hn - 1 / 3) * 255,
  ];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function deriveAccentTheme(accentHex: string): AccentTheme {
  const accent = normalizeHex(accentHex) ?? "#155C4C";

  // Демо-акцент обязан совпадать с палитрой DESIGN.md до оттенка.
  if (accent === "#155C4C") {
    return {
      light: {
        accent: "#155C4C",
        accentSoft: "#E3EFE9",
        accentInk: "#0F4A3D",
        accentContrast: WHITE,
      },
      dark: {
        accent: "#5FBF9F",
        accentSoft: "#1D332C",
        accentInk: "#8AD6BB",
        accentContrast: DARK_INK,
      },
      contrastOnPaper: contrastRatio("#155C4C", PAPER),
      contrastOnAccent: contrastRatio("#155C4C", WHITE),
    };
  }

  const [h, s] = rgbToHsl(...hexToRgb(accent));

  // Светлая тема: акцент как есть, мягкий фон — тот же тон, но бумажный.
  const lightSoftS = Math.max(26, Math.min(34, s));
  const lightSoft = rgbToHex(...hslToRgb(h, lightSoftS, 91));
  const lightInk = rgbToHex(...hslToRgb(h, Math.max(45, s), 17));

  // Тёмная тема: осветлённый акцент, глубокий фон, светлый текст на нём.
  const darkAccent = rgbToHex(...hslToRgb(h, Math.max(35, Math.min(45, s)), 56));
  const darkSoft = rgbToHex(...hslToRgb(h, Math.min(30, s), 16));
  const darkInk = rgbToHex(...hslToRgb(h, Math.max(42, Math.min(52, s)), 69));

  return {
    light: {
      accent,
      accentSoft: lightSoft,
      accentInk: lightInk,
      accentContrast: WHITE,
    },
    dark: {
      accent: darkAccent,
      accentSoft: darkSoft,
      accentInk: darkInk,
      accentContrast: DARK_INK,
    },
    contrastOnPaper: contrastRatio(accent, PAPER),
    contrastOnAccent: contrastRatio(accent, WHITE),
  };
}

export type AccentCheck =
  | { ok: true; theme: AccentTheme }
  | { ok: false; reason: string };

export function validateAccent(hex: string): AccentCheck {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return { ok: false, reason: "Цвет должен быть в формате #RRGGBB" };
  }

  const theme = deriveAccentTheme(normalized);

  if (theme.contrastOnPaper < 4.5) {
    return {
      ok: false,
      reason: `Слишком светлый: контраст с фоном ${theme.contrastOnPaper.toFixed(1)}:1, нужно ≥ 4.5:1`,
    };
  }

  if (theme.contrastOnAccent < 4.5) {
    return {
      ok: false,
      reason: `Белый текст на кнопке не читается (${theme.contrastOnAccent.toFixed(1)}:1). Возьмите более тёмный оттенок`,
    };
  }

  if (contrastRatio(theme.dark.accent, DARK_PAPER) < 4.5) {
    return {
      ok: false,
      reason: "В тёмной теме акцент плохо читается на фоне",
    };
  }

  return { ok: true, theme };
}
