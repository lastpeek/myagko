/**
 * Расчёт стоимости — единственное место, где живёт формула.
 *
 * Порядок применения (PROMPT.md, «Расчёт стоимости»):
 *   база → × количество → +% за сильные загрязнения → +% за вторую сторону
 *   → сумма позиций → минимум → выезд за город → округление вверх.
 *
 * Деньги — целые рубли. Промежуточные строки округляются до рубля
 * (округление половины вверх), итог — до `roundingStep` один раз в конце.
 * Сумма из браузера не принимается: на вход идут только цены из БД и флаги.
 */

export type PricingCategory = "sofa" | "armchair" | "mattress" | "chair" | "other";

export type PricingItemInput = {
  /** Идентификатор варианта тарифа, например `sofa-3`. */
  key: string;
  category: PricingCategory;
  /** Базовая цена из актуального прайса; null — цена по фото. */
  basePrice: number | null;
  quantity: number;
  heavySoiling?: boolean;
  secondSide?: boolean;
  /** Позиция с ценой по фото (категория «Другое»). */
  manual?: boolean;
  /** Разрешает ли вариант доплату за загрязнения (по умолчанию да). */
  allowsSoiling?: boolean;
  /** Разрешает ли вариант вторую сторону (по умолчанию да). */
  allowsSecondSide?: boolean;
};

export type PricingRules = {
  minOrder: number;
  soilingPercent: number;
  secondSidePercent: number;
  outOfTownFee: number;
  roundingStep: number;
};

export type PricingInput = {
  items: PricingItemInput[];
  rules: PricingRules;
  outOfTown: boolean;
};

export type PricedLine = {
  key: string;
  category: PricingCategory;
  quantity: number;
  heavySoiling: boolean;
  secondSide: boolean;
  manual: boolean;
  unitBasePrice: number | null;
  /** Итог позиции в рублях; null — «По фото». */
  lineTotal: number | null;
};

export type PricingResult = {
  lines: PricedLine[];
  /** Сумма позиций с известной ценой, до минимума и выезда. */
  itemsSubtotal: number;
  minimumAdjustment: number;
  outOfTownFee: number;
  /** Итог до округления: позиции + минимум + выезд. */
  rawTotal: number;
  roundingAdjustment: number;
  /** Итог заказа; null — все позиции «По фото». */
  total: number | null;
  hasManualItems: boolean;
  manualItemsCount: number;
  /** Человекочитаемая расшифровка процентов по позиции, для кабинета. */
  formulas: Record<string, string>;
};

const MAX_QUANTITY = 99;

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.trunc(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, MAX_QUANTITY);
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

/** Округление половины вверх на целых числах, без float. */
function roundHalfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateOrder(input: PricingInput): PricingResult {
  const soilingPercent = normalizePercent(input.rules.soilingPercent);
  const secondSidePercent = normalizePercent(input.rules.secondSidePercent);
  const step = Math.max(1, normalizeMoney(input.rules.roundingStep) || 10);

  const lines: PricedLine[] = [];
  const formulas: Record<string, string> = {};

  let itemsSubtotal = 0;
  let manualItemsCount = 0;

  for (const item of input.items) {
    const quantity = normalizeQuantity(item.quantity);
    const heavySoiling =
      Boolean(item.heavySoiling) && item.allowsSoiling !== false;
    const secondSide =
      Boolean(item.secondSide) && item.allowsSecondSide !== false;
    const manual =
      Boolean(item.manual) ||
      item.basePrice === null ||
      !Number.isFinite(item.basePrice);

    if (manual) {
      manualItemsCount += 1;
      lines.push({
        key: item.key,
        category: item.category,
        quantity,
        heavySoiling: false,
        secondSide: false,
        manual: true,
        unitBasePrice: null,
        lineTotal: null,
      });
      formulas[item.key] = "По фото";
      continue;
    }

    const base = normalizeMoney(item.basePrice as number);
    const soilingFactor = heavySoiling ? 100 + soilingPercent : 100;
    const secondFactor = secondSide ? 100 + secondSidePercent : 100;

    const lineTotal = roundHalfUpDiv(
      base * quantity * soilingFactor * secondFactor,
      10_000,
    );

    itemsSubtotal += lineTotal;

    lines.push({
      key: item.key,
      category: item.category,
      quantity,
      heavySoiling,
      secondSide,
      manual: false,
      unitBasePrice: base,
      lineTotal,
    });

    formulas[item.key] = formatLineFormula({
      base,
      quantity,
      soilingPercent: heavySoiling ? soilingPercent : 0,
      secondSidePercent: secondSide ? secondSidePercent : 0,
      lineTotal,
    });
  }

  const minOrder = normalizeMoney(input.rules.minOrder);
  const hasAnyItems = lines.length > 0;
  const hasPricedItems = itemsSubtotal > 0;
  const minimumAdjustment =
    hasPricedItems && itemsSubtotal < minOrder ? minOrder - itemsSubtotal : 0;

  const outOfTownFee =
    hasPricedItems && input.outOfTown
      ? normalizeMoney(input.rules.outOfTownFee)
      : 0;

  const rawTotal = itemsSubtotal + minimumAdjustment + outOfTownFee;
  const total = !hasAnyItems
    ? 0
    : hasPricedItems
      ? Math.ceil(rawTotal / step) * step
      : null;

  return {
    lines,
    itemsSubtotal,
    minimumAdjustment,
    outOfTownFee,
    rawTotal,
    roundingAdjustment: total === null ? 0 : total - rawTotal,
    total,
    hasManualItems: manualItemsCount > 0,
    manualItemsCount,
    formulas,
  };
}

export function formatLineFormula(args: {
  base: number;
  quantity: number;
  soilingPercent: number;
  secondSidePercent: number;
  lineTotal: number;
}): string {
  const parts = [groupDigits(args.base)];
  if (args.quantity > 1) parts.push(`× ${args.quantity}`);
  if (args.soilingPercent > 0) parts.push(`× ${factor(args.soilingPercent)}`);
  if (args.secondSidePercent > 0) {
    parts.push(`× ${factor(args.secondSidePercent)}`);
  }
  parts.push(`= ${groupDigits(args.lineTotal)} ₽`);
  return parts.join(" ");
}

function groupDigits(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

function factor(percent: number): string {
  return String(Math.round((100 + percent) / 10) / 10);
}
