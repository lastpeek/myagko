/**
 * Расчёт стоимости — единственное место, где живёт формула.
 *
 * Порядок применения:
 *   база → × количество → опции строки по порядку (процент / фикс за позицию)
 *   → сумма позиций → минимум по строкам → фикс за заказ (один раз)
 *   → выезд за город → округление вверх.
 *
 * Минимум применяется, только если есть хотя бы одна строка с известной ценой.
 * Заказ из одних «По фото» не добивается до минимума: его итог — выезд за
 * город или 0, а интерфейс показывает «по фото».
 *
 * Опции задаются в кабинете. Старые флаги (`heavySoiling`, `secondSide`) и
 * проценты в правилах сохранены для совместимости: заявки, созданные до
 * универсализации, продолжают считаться и отображаться.
 *
 * Деньги — целые рубли. Промежуточные строки округляются до рубля
 * (округление половины вверх), итог — до `roundingStep` один раз в конце.
 * Сумма из браузера не принимается: на вход идут только цены из БД и опции.
 */

export type PricingCategory = string;

export type PricingOptionKind = "percent" | "fixed" | "fixed_order";

export type PricingOption = {
  id: string;
  label: string;
  kind: PricingOptionKind;
  /** Процент (30 = +30%) или сумма в рублях. */
  value: number;
};

export type AppliedPricingOption = PricingOption & {
  /** Сколько опция добавила к позиции, в рублях. */
  amount: number;
};

export type PricingItemInput = {
  /** Идентификатор варианта тарифа, например `sofa-3`. */
  key: string;
  category: PricingCategory;
  /** Базовая цена из актуального прайса; null — цена по фото. */
  basePrice: number | null;
  quantity: number;
  heavySoiling?: boolean;
  secondSide?: boolean;
  /** Позиция с ценой по фото (вариант «По фото»). */
  manual?: boolean;
  /** Разрешает ли вариант доплату за загрязнения (легаси). */
  allowsSoiling?: boolean;
  /** Разрешает ли вариант вторую сторону (легаси). */
  allowsSecondSide?: boolean;
  /** Опции, доступные варианту. Если задано — используется новый расчёт. */
  options?: PricingOption[];
  /** Выбранные id опций. */
  optionIds?: string[];
};

export type PricingRules = {
  minOrder: number;
  /** Легаси-процент; применяется, только если у позиции нет списка опций. */
  soilingPercent?: number;
  /** Легаси-процент; применяется, только если у позиции нет списка опций. */
  secondSidePercent?: number;
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
  options: AppliedPricingOption[];
};

export type PricingResult = {
  lines: PricedLine[];
  /** Сумма позиций с известной ценой, до минимума и выезда. */
  itemsSubtotal: number;
  minimumAdjustment: number;
  outOfTownFee: number;
  /** Фиксированные доплаты «за заказ», один раз на заказ. */
  orderOptions: AppliedPricingOption[];
  orderOptionsTotal: number;
  /** Итог до округления: позиции + минимум + фикс за заказ + выезд. */
  rawTotal: number;
  roundingAdjustment: number;
  /** Итог заказа; 0 — пустой заказ, для «только по фото» — выезд или 0. */
  total: number;
  hasManualItems: boolean;
  manualItemsCount: number;
  /** Есть ли хотя бы одна строка с известной ценой. */
  hasPricedItems: boolean;
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

function normalizeOptions(options: PricingOption[]): PricingOption[] {
  const normalized: PricingOption[] = [];

  for (const option of options) {
    if (typeof option.id !== "string" || option.id.length === 0) continue;

    if (option.kind === "percent") {
      normalized.push({
        id: option.id,
        label: option.label,
        kind: "percent",
        value: normalizePercent(option.value),
      });
    } else if (option.kind === "fixed" || option.kind === "fixed_order") {
      normalized.push({
        id: option.id,
        label: option.label,
        kind: option.kind,
        value: normalizeMoney(option.value),
      });
    }
  }

  return normalized;
}

/** Округление половины вверх на целых числах, без float. */
function roundHalfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function calculateOrder(input: PricingInput): PricingResult {
  const step = Math.max(1, normalizeMoney(input.rules.roundingStep) || 10);

  const lines: PricedLine[] = [];
  const formulas: Record<string, string> = {};
  const orderOptionsById = new Map<string, AppliedPricingOption>();

  let itemsSubtotal = 0;
  let manualItemsCount = 0;

  for (const item of input.items) {
    const quantity = normalizeQuantity(item.quantity);
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
        options: [],
      });
      formulas[item.key] = "По фото";
      continue;
    }

    const base = normalizeMoney(item.basePrice as number);
    const priced = priceLine({
      base,
      quantity,
      item,
      rules: input.rules,
    });

    itemsSubtotal += priced.lineTotal;

    for (const option of priced.orderOptions) {
      if (!orderOptionsById.has(option.id)) {
        orderOptionsById.set(option.id, option);
      }
    }

    lines.push({
      key: item.key,
      category: item.category,
      quantity,
      heavySoiling: priced.heavySoiling,
      secondSide: priced.secondSide,
      manual: false,
      unitBasePrice: base,
      lineTotal: priced.lineTotal,
      options: priced.applied,
    });

    formulas[item.key] = priced.formula;
  }

  const minOrder = normalizeMoney(input.rules.minOrder);
  const hasAnyItems = lines.length > 0;
  const hasPricedItems = lines.some((line) => line.lineTotal !== null);
  const minimumAdjustment =
    hasPricedItems && itemsSubtotal < minOrder ? minOrder - itemsSubtotal : 0;

  const orderOptions = hasPricedItems
    ? Array.from(orderOptionsById.values())
    : [];
  const orderOptionsTotal = orderOptions.reduce(
    (sum, option) => sum + option.amount,
    0,
  );

  const outOfTownFee =
    hasAnyItems && input.outOfTown
      ? normalizeMoney(input.rules.outOfTownFee)
      : 0;

  const rawTotal =
    itemsSubtotal + minimumAdjustment + orderOptionsTotal + outOfTownFee;
  const total = !hasAnyItems
    ? 0
    : hasPricedItems
      ? Math.ceil(rawTotal / step) * step
      : outOfTownFee;

  return {
    lines,
    itemsSubtotal,
    minimumAdjustment,
    outOfTownFee,
    orderOptions,
    orderOptionsTotal,
    rawTotal,
    roundingAdjustment: total - rawTotal,
    total,
    hasManualItems: manualItemsCount > 0,
    manualItemsCount,
    hasPricedItems,
    formulas,
  };
}

function priceLine(args: {
  base: number;
  quantity: number;
  item: PricingItemInput;
  rules: PricingRules;
}): {
  lineTotal: number;
  applied: AppliedPricingOption[];
  orderOptions: AppliedPricingOption[];
  formula: string;
  heavySoiling: boolean;
  secondSide: boolean;
} {
  const { base, quantity, item, rules } = args;

  if (item.options !== undefined) {
    const available = normalizeOptions(item.options);
    const selected = new Set(item.optionIds ?? []);
    // Старые черновики хранили флаги вместо id.
    if (item.heavySoiling) selected.add("soiling");
    if (item.secondSide) selected.add("second-side");

    const applied: AppliedPricingOption[] = [];
    const orderOptions: AppliedPricingOption[] = [];
    let running = base * quantity;

    for (const option of available) {
      if (!selected.has(option.id)) continue;

      if (option.kind === "percent") {
        const before = running;
        running = roundHalfUpDiv(running * (100 + option.value), 100);
        applied.push({ ...option, amount: running - before });
      } else if (option.kind === "fixed") {
        const amount = option.value * quantity;
        running += amount;
        applied.push({ ...option, amount });
      } else {
        // «За заказ»: в сумму строки не входит, применяется один раз.
        orderOptions.push({ ...option, amount: option.value });
      }
    }

    return {
      lineTotal: running,
      applied,
      orderOptions,
      formula: formatGenericFormula({
        base,
        quantity,
        applied,
        lineTotal: running,
      }),
      heavySoiling: applied.some((option) => option.id === "soiling"),
      secondSide: applied.some((option) => option.id === "second-side"),
    };
  }

  // Легаси-расчёт: два фиксированных процента.
  const heavySoiling =
    Boolean(item.heavySoiling) && item.allowsSoiling !== false;
  const secondSide =
    Boolean(item.secondSide) && item.allowsSecondSide !== false;
  const soilingPercent = normalizePercent(rules.soilingPercent ?? 0);
  const secondSidePercent = normalizePercent(rules.secondSidePercent ?? 0);

  const soilingFactor = heavySoiling ? 100 + soilingPercent : 100;
  const secondFactor = secondSide ? 100 + secondSidePercent : 100;

  const lineTotal = roundHalfUpDiv(
    base * quantity * soilingFactor * secondFactor,
    10_000,
  );

  const applied: AppliedPricingOption[] = [];
  if (heavySoiling) {
    const beforeSoiling = roundHalfUpDiv(base * quantity * soilingFactor, 100);
    applied.push({
      id: "soiling",
      label: "Сильные загрязнения",
      kind: "percent",
      value: soilingPercent,
      amount: beforeSoiling - base * quantity,
    });
  }
  if (secondSide) {
    applied.push({
      id: "second-side",
      label: "Вторая сторона",
      kind: "percent",
      value: secondSidePercent,
      amount: lineTotal - roundHalfUpDiv(base * quantity * soilingFactor, 100),
    });
  }

  return {
    lineTotal,
    applied,
    orderOptions: [],
    formula: formatLineFormula({
      base,
      quantity,
      soilingPercent: heavySoiling ? soilingPercent : 0,
      secondSidePercent: secondSide ? secondSidePercent : 0,
      lineTotal,
    }),
    heavySoiling,
    secondSide,
  };
}

function formatGenericFormula(args: {
  base: number;
  quantity: number;
  applied: AppliedPricingOption[];
  lineTotal: number;
}): string {
  const parts = [groupDigits(args.base)];
  if (args.quantity > 1) parts.push(`× ${args.quantity}`);

  for (const option of args.applied) {
    if (option.kind === "percent") {
      parts.push(`× ${factor(option.value)}`);
    } else {
      parts.push(`+ ${groupDigits(option.amount)} ₽`);
    }
  }

  parts.push(`= ${groupDigits(args.lineTotal)} ₽`);
  return parts.join(" ");
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
