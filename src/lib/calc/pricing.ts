/**
 * Расчёт стоимости — единственное место, где живёт формула.
 *
 * Порядок применения:
 *   значение параметра × цена за единицу → опции строки по порядку
 *   (процент / фикс за штуку опции) → сумма позиций → минимум по строкам
 *   → фикс за заказ (один раз) → выезд за город → округление вверх.
 *
 * У варианта один ценовой параметр. Значение может быть дробным (м², м.п.),
 * поэтому внутри считаем в копейках. Цены и итог — целые рубли; финальное
 * округление до шага выполняется один раз.
 *
 * Минимум применяется, только если есть хотя бы одна строка с известной ценой.
 * Заказ из одних «По фото» не добивается до минимума: его итог — выезд за
 * город или 0, а интерфейс показывает «по фото».
 *
 * Старые флаги (`heavySoiling`, `secondSide`) и проценты в правилах сохранены
 * для совместимости: заявки, созданные до универсализации, продолжают
 * считаться и отображаться.
 *
 * Сумма из браузера не принимается: на вход идут только цены из БД и опции.
 */

export type PricingCategory = string;

export type PricingOptionKind = "percent" | "fixed" | "fixed_order";

export type PricingOptionScope = "line" | "order";

export type PricingOption = {
  id: string;
  label: string;
  kind: PricingOptionKind;
  /** Процент (30 = +30%), сумма за штуку или сумма за заказ. */
  value: number;
  scope?: PricingOptionScope;
};

export type PricingOptionSelection = {
  id: string;
  /** Количество для fixed-опции; у percent/fixed_order всегда 1. */
  quantity?: number;
};

export type AppliedPricingOption = PricingOption & {
  /** Количество опции: для fixed — выбранное, для остальных 1. */
  quantity?: number;
  /** Сколько опция добавила, в рублях. */
  amount: number;
};

export type PricingItemInput = {
  /** Идентификатор варианта, например `sofa-3`. */
  key: string;
  category: PricingCategory;
  serviceId?: string;
  serviceLabel?: string;
  variantId?: string;
  variantLabel?: string;
  /** Подпись единицы: шт, м², м.п. */
  unit?: string;
  parameterLabel?: string;
  /** Новое значение параметра; может быть дробным. */
  parameterValue?: number;
  /** Цена за единицу параметра, целые рубли. */
  pricePerUnit?: number;
  /** Легаси: базовая цена варианта и целое количество. */
  basePrice?: number | null;
  quantity?: number;
  heavySoiling?: boolean;
  secondSide?: boolean;
  /** Позиция с ценой по фото. */
  manual?: boolean;
  /** Разрешает ли вариант доплату за загрязнения (легаси). */
  allowsSoiling?: boolean;
  /** Разрешает ли вариант вторую сторону (легаси). */
  allowsSecondSide?: boolean;
  /** Опции, доступные варианту. Если задано — используется новый расчёт. */
  options?: PricingOption[];
  /** Выбранные id опций; количество fixed-опции по умолчанию 1. */
  optionIds?: string[];
  /** Выбранные опции с количеством fixed-опции. */
  optionSelections?: PricingOptionSelection[];
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
  /** Глобальные fixed_order-опции, доступные заказу. */
  orderOptions?: PricingOption[];
  /** Выбранные глобальные fixed_order-опции. */
  orderOptionIds?: string[];
};

export type PricedLine = {
  key: string;
  serviceId?: string;
  serviceLabel?: string;
  variantId?: string;
  category: PricingCategory;
  variantLabel?: string;
  unit?: string;
  parameterLabel?: string;
  /** Значение параметра; для легаси — количество. */
  parameterValue: number;
  /** Легаси-имя для значения параметра. */
  quantity: number;
  pricePerUnit: number;
  baseTotal: number | null;
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
  /** То же, что minimumAdjustment; имя для нового снимка. */
  minimumApplied: number;
  outOfTownFee: number;
  /** Фиксированные доплаты «за заказ», один раз на заказ. */
  orderOptions: AppliedPricingOption[];
  orderOptionsTotal: number;
  /** Итог до округления: позиции + минимум + фикс заказа + выезд. */
  rawTotal: number;
  roundingAdjustment: number;
  /** Итог заказа; 0 — пустой заказ, для «только по фото» — выезд или 0. */
  total: number;
  hasManualItems: boolean;
  manualItemsCount: number;
  /** Есть ли хотя бы одна строка с известной ценой. */
  hasPricedItems: boolean;
  /** Человекочитаемая расшифровка по позиции, для кабинета. */
  formulas: Record<string, string>;
};

const MAX_QUANTITY = 99;
const MAX_OPTION_QUANTITY = 99;

function normalizeQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.trunc(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, MAX_QUANTITY);
}

function normalizeParameterValue(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeMoney(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

function normalizeOptionQuantity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  const rounded = Math.trunc(value);
  if (rounded < 1) return 1;
  return Math.min(rounded, MAX_OPTION_QUANTITY);
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
        scope: "line",
      });
    } else if (option.kind === "fixed" || option.kind === "fixed_order") {
      normalized.push({
        id: option.id,
        label: option.label,
        kind: option.kind,
        value: normalizeMoney(option.value),
        scope: option.kind === "fixed_order" ? "order" : "line",
      });
    }
  }

  return normalized;
}

/** Округление половины вверх на целых числах, без float. */
function roundHalfUpDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function toHundredths(value: number): number {
  return Math.round(value * 100);
}

function fromHundredths(value: number): number {
  return value / 100;
}

export function calculateOrder(input: PricingInput): PricingResult {
  const step = Math.max(1, normalizeMoney(input.rules.roundingStep) || 10);
  const stepHundredths = step * 100;

  const lines: PricedLine[] = [];
  const formulas: Record<string, string> = {};
  const orderOptionsById = new Map<string, AppliedPricingOption>();

  let itemsSubtotalHundredths = 0;
  let manualItemsCount = 0;

  for (const item of input.items) {
    const manual =
      Boolean(item.manual) ||
      (item.pricePerUnit === undefined
        ? item.basePrice === null || !Number.isFinite(item.basePrice)
        : !Number.isFinite(item.pricePerUnit));

    if (manual) {
      manualItemsCount += 1;
      const parameterValue = normalizeParameterValue(
        item.parameterValue ?? item.quantity ?? 1,
      );
      lines.push({
        key: item.key,
        serviceId: item.serviceId,
        serviceLabel: item.serviceLabel,
        variantId: item.variantId ?? item.key,
        category: item.category,
        variantLabel: item.variantLabel,
        unit: item.unit,
        parameterLabel: item.parameterLabel,
        parameterValue,
        quantity: parameterValue,
        pricePerUnit: 0,
        baseTotal: null,
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

    const priced = priceLine({
      item,
      rules: input.rules,
      orderOptionsById,
    });

    itemsSubtotalHundredths += priced.lineTotalHundredths;

    lines.push({
      key: item.key,
      serviceId: item.serviceId,
      serviceLabel: item.serviceLabel,
      variantId: item.variantId ?? item.key,
      category: item.category,
      variantLabel: item.variantLabel,
      unit: item.unit,
      parameterLabel: item.parameterLabel,
      parameterValue: priced.parameterValue,
      quantity: priced.parameterValue,
      pricePerUnit: priced.pricePerUnit,
      baseTotal: priced.baseTotal,
      heavySoiling: priced.heavySoiling,
      secondSide: priced.secondSide,
      manual: false,
      unitBasePrice: priced.pricePerUnit,
      lineTotal: priced.lineTotal,
      options: priced.applied,
    });

    formulas[item.key] = priced.formula;
  }

  const hasAnyItems = lines.length > 0;
  const hasPricedItems = lines.some((line) => line.lineTotal !== null);
  const minOrder = normalizeMoney(input.rules.minOrder);
  const minOrderHundredths = minOrder * 100;
  const minimumAdjustmentHundredths =
    hasPricedItems && itemsSubtotalHundredths < minOrderHundredths
      ? minOrderHundredths - itemsSubtotalHundredths
      : 0;

  if (hasPricedItems && input.orderOptions && input.orderOptionIds) {
    const selected = new Set(input.orderOptionIds);
    for (const option of normalizeOptions(input.orderOptions)) {
      if (option.kind !== "fixed_order" || !selected.has(option.id)) continue;
      if (orderOptionsById.has(option.id)) continue;
      orderOptionsById.set(option.id, {
        ...option,
        quantity: 1,
        amount: fromHundredths(option.value * 100),
      });
    }
  }

  const orderOptions = hasPricedItems
    ? Array.from(orderOptionsById.values())
    : [];
  const orderOptionsTotal = orderOptions.reduce(
    (sum, option) => sum + toHundredths(option.amount),
    0,
  );

  const outOfTownFeeHundredths =
    hasAnyItems && input.outOfTown
      ? normalizeMoney(input.rules.outOfTownFee) * 100
      : 0;

  const rawTotalHundredths =
    itemsSubtotalHundredths +
    minimumAdjustmentHundredths +
    orderOptionsTotal +
    outOfTownFeeHundredths;

  const totalHundredths = !hasAnyItems
    ? 0
    : hasPricedItems
      ? Math.ceil(rawTotalHundredths / stepHundredths) * stepHundredths
      : outOfTownFeeHundredths;

  return {
    lines,
    itemsSubtotal: fromHundredths(itemsSubtotalHundredths),
    minimumAdjustment: fromHundredths(minimumAdjustmentHundredths),
    minimumApplied: fromHundredths(minimumAdjustmentHundredths),
    outOfTownFee: fromHundredths(outOfTownFeeHundredths),
    orderOptions,
    orderOptionsTotal: fromHundredths(orderOptionsTotal),
    rawTotal: fromHundredths(rawTotalHundredths),
    roundingAdjustment: fromHundredths(totalHundredths - rawTotalHundredths),
    total: totalHundredths / 100,
    hasManualItems: manualItemsCount > 0,
    manualItemsCount,
    hasPricedItems,
    formulas,
  };
}

function priceLine(args: {
  item: PricingItemInput;
  rules: PricingRules;
  orderOptionsById: Map<string, AppliedPricingOption>;
}): {
  lineTotal: number;
  lineTotalHundredths: number;
  applied: AppliedPricingOption[];
  parameterValue: number;
  pricePerUnit: number;
  baseTotal: number;
  formula: string;
  heavySoiling: boolean;
  secondSide: boolean;
} {
  const { item, rules, orderOptionsById } = args;
  const parameterValue =
    item.parameterValue !== undefined
      ? normalizeParameterValue(item.parameterValue)
      : normalizeQuantity(item.quantity ?? 1);
  const pricePerUnit = normalizeMoney(
    item.pricePerUnit !== undefined
      ? item.pricePerUnit
      : (item.basePrice as number),
  );
  const unit = item.unit ?? "шт";
  const parameterLabel = item.parameterLabel ?? "Количество";

  if (item.options !== undefined) {
    const available = normalizeOptions(item.options);
    const selected = new Map<string, number>();
    for (const optionId of item.optionIds ?? []) selected.set(optionId, 1);
    for (const selection of item.optionSelections ?? []) {
      selected.set(selection.id, normalizeOptionQuantity(selection.quantity));
    }
    // Старые черновики хранили флаги вместо id.
    if (item.heavySoiling) selected.set("soiling", 1);
    if (item.secondSide) selected.set("second-side", 1);

    const baseHundredths = toHundredths(parameterValue) * pricePerUnit;
    const applied: AppliedPricingOption[] = [];
    let running = baseHundredths;

    for (const option of available) {
      if (!selected.has(option.id)) continue;

      if (option.kind === "percent") {
        const before = running;
        running = roundHalfUpDiv(running * (100 + option.value), 100);
        applied.push({
          ...option,
          quantity: 1,
          amount: fromHundredths(running - before),
        });
      } else if (option.kind === "fixed") {
        const quantity = normalizeOptionQuantity(selected.get(option.id));
        const amountHundredths = option.value * quantity * 100;
        running += amountHundredths;
        applied.push({
          ...option,
          quantity,
          amount: fromHundredths(amountHundredths),
        });
      } else {
        // «За заказ»: в сумму строки не входит, применяется один раз.
        if (!orderOptionsById.has(option.id)) {
          orderOptionsById.set(option.id, {
            ...option,
            quantity: 1,
            amount: fromHundredths(option.value * 100),
          });
        }
      }
    }

    return {
      lineTotal: fromHundredths(running),
      lineTotalHundredths: running,
      applied,
      parameterValue,
      pricePerUnit,
      baseTotal: fromHundredths(baseHundredths),
      formula: formatNewFormula({
        parameterValue,
        parameterLabel,
        unit,
        pricePerUnit,
        applied,
        lineTotal: fromHundredths(running),
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
  const baseHundredths = toHundredths(parameterValue) * pricePerUnit;
  const lineTotalHundredths = roundHalfUpDiv(
    baseHundredths * soilingFactor * secondFactor,
    10_000,
  );

  const applied: AppliedPricingOption[] = [];
  if (heavySoiling) {
    const beforeSoiling = roundHalfUpDiv(
      baseHundredths * soilingFactor,
      100,
    );
    applied.push({
      id: "soiling",
      label: "Сильные загрязнения",
      kind: "percent",
      value: soilingPercent,
      scope: "line",
      quantity: 1,
      amount: fromHundredths(beforeSoiling - baseHundredths),
    });
  }
  if (secondSide) {
    applied.push({
      id: "second-side",
      label: "Вторая сторона",
      kind: "percent",
      value: secondSidePercent,
      scope: "line",
      quantity: 1,
      amount: fromHundredths(
        lineTotalHundredths -
          roundHalfUpDiv(baseHundredths * soilingFactor, 100),
      ),
    });
  }

  return {
    lineTotal: fromHundredths(lineTotalHundredths),
    lineTotalHundredths,
    applied,
    parameterValue,
    pricePerUnit,
    baseTotal: fromHundredths(baseHundredths),
    formula: formatLineFormula({
      base: pricePerUnit,
      quantity: parameterValue,
      soilingPercent: heavySoiling ? soilingPercent : 0,
      secondSidePercent: secondSide ? secondSidePercent : 0,
      lineTotal: fromHundredths(lineTotalHundredths),
    }),
    heavySoiling,
    secondSide,
  };
}

function formatNewFormula(args: {
  parameterValue: number;
  parameterLabel: string;
  unit: string;
  pricePerUnit: number;
  applied: AppliedPricingOption[];
  lineTotal: number;
}): string {
  const parts = [
    `${formatDecimal(args.parameterValue)} ${args.unit} × ${groupDigits(args.pricePerUnit)} ₽`,
  ];

  for (const option of args.applied) {
    if (option.kind === "percent") {
      parts.push(`× ${factor(option.value)}`);
    } else {
      parts.push(
        `+ ${groupDigits(option.value)} ₽ × ${option.quantity ?? 1}`,
      );
    }
  }

  parts.push(`= ${formatRub(args.lineTotal)}`);
  return `${args.parameterLabel}: ${parts.join(" ")}`;
}

export function formatLineFormula(args: {
  base: number;
  quantity: number;
  soilingPercent: number;
  secondSidePercent: number;
  lineTotal: number;
}): string {
  const parts = [groupDigits(args.base)];
  if (args.quantity > 1) parts.push(`× ${formatDecimal(args.quantity)}`);
  if (args.soilingPercent > 0) parts.push(`× ${factor(args.soilingPercent)}`);
  if (args.secondSidePercent > 0) {
    parts.push(`× ${factor(args.secondSidePercent)}`);
  }
  parts.push(`= ${formatRub(args.lineTotal)}`);
  return parts.join(" ");
}

function groupDigits(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
}

function formatDecimal(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [integer, fraction = "00"] = rounded.toFixed(2).split(".");
  const int = groupDigits(Number(integer));
  if (fraction === "00") return int;
  return `${int},${fraction.replace(/0$/, "")}`;
}

function formatRub(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const [integer, fraction = "00"] = rounded.toFixed(2).split(".");
  const int = groupDigits(Number(integer));
  if (fraction === "00") return `${int} ₽`;
  return `${int},${fraction.replace(/0$/, "")} ₽`;
}

function factor(percent: number): string {
  return String(Math.round((100 + percent) / 10) / 10);
}
