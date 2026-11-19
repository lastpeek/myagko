import { describe, expect, it } from "vitest";

import { calculateOrder, type PricingInput } from "./pricing";

const rules: PricingInput["rules"] = {
  minOrder: 2500,
  soilingPercent: 30,
  secondSidePercent: 50,
  outOfTownFee: 500,
  roundingStep: 10,
};

function calc(
  items: PricingInput["items"],
  options: Partial<Omit<PricingInput, "items" | "rules">> = {},
) {
  return calculateOrder({
    items,
    rules,
    outOfTown: false,
    ...options,
  });
}

describe("calculateOrder", () => {
  it("считает обычный заказ из одной позиции", () => {
    const result = calc([
      { key: "sofa-3", category: "sofa", basePrice: 3200, quantity: 1 },
    ]);
    expect(result.itemsSubtotal).toBe(3200);
    expect(result.minimumAdjustment).toBe(0);
    expect(result.outOfTownFee).toBe(0);
    expect(result.total).toBe(3200);
  });

  it("умножает цену на количество", () => {
    const result = calc([
      { key: "chair-back", category: "chair", basePrice: 700, quantity: 4 },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(2800);
    expect(result.total).toBe(2800);
  });

  it("применяет +30% за сильные загрязнения", () => {
    const result = calc([
      {
        key: "sofa-3",
        category: "sofa",
        basePrice: 3200,
        quantity: 1,
        heavySoiling: true,
      },
    ]);
    expect(result.total).toBe(4160);
  });

  it("применяет +50% за вторую сторону матраса", () => {
    const result = calc([
      {
        key: "mattress-double",
        category: "mattress",
        basePrice: 2400,
        quantity: 1,
        secondSide: true,
      },
    ]);
    expect(result.total).toBe(3600);
  });

  it("складывает проценты последовательно: грязь, затем вторая сторона", () => {
    const result = calc([
      {
        key: "mattress-single",
        category: "mattress",
        basePrice: 1500,
        quantity: 1,
        heavySoiling: true,
        secondSide: true,
      },
    ]);
    expect(result.total).toBe(2930);
    expect(result.itemsSubtotal).toBe(2925);
    expect(result.roundingAdjustment).toBe(5);
    expect(result.formulas["mattress-single"]).toBe(
      "1\u00a0500 × 1.3 × 1.5 = 2\u00a0925 ₽",
    );
  });

  it("показывает эффект процентов в расшифровке для кабинета", () => {
    const result = calc([
      {
        key: "mattress-single",
        category: "mattress",
        basePrice: 3200,
        quantity: 1,
        heavySoiling: true,
        secondSide: true,
      },
    ]);
    expect(result.formulas["mattress-single"]).toBe(
      "3\u00a0200 × 1.3 × 1.5 = 6\u00a0240 ₽",
    );
    expect(result.total).toBe(6240);
  });

  it("поднимает заказ до минимального", () => {
    const result = calc([
      { key: "armchair", category: "armchair", basePrice: 1200, quantity: 1 },
    ]);
    expect(result.itemsSubtotal).toBe(1200);
    expect(result.minimumAdjustment).toBe(1300);
    expect(result.total).toBe(2500);
  });

  it("не применяет минимум, если сумма уже выше", () => {
    const result = calc([
      { key: "sofa-2", category: "sofa", basePrice: 2500, quantity: 1 },
    ]);
    expect(result.minimumAdjustment).toBe(0);
    expect(result.total).toBe(2500);
  });

  it("добавляет фиксированный выезд за город после минимума", () => {
    const result = calc(
      [{ key: "sofa-2", category: "sofa", basePrice: 2500, quantity: 1 }],
      { outOfTown: true },
    );
    expect(result.outOfTownFee).toBe(500);
    expect(result.total).toBe(3000);
  });

  it("выезд не участвует в минимуме", () => {
    const result = calc(
      [{ key: "armchair", category: "armchair", basePrice: 1200, quantity: 1 }],
      { outOfTown: true },
    );
    expect(result.minimumAdjustment).toBe(1300);
    expect(result.total).toBe(3000);
  });

  it("округляет вверх до 10 ₽ один раз в конце", () => {
    const result = calc([
      { key: "custom", category: "other", basePrice: 3333, quantity: 1 },
    ]);
    expect(result.total).toBe(3340);
    expect(result.roundingAdjustment).toBe(7);
  });

  it("округляет итог вместе с выездом", () => {
    const result = calc(
      [{ key: "custom", category: "other", basePrice: 3333, quantity: 1 }],
      { outOfTown: true },
    );
    expect(result.total).toBe(3840);
  });

  it("не округляет промежуточные строки", () => {
    const result = calc([
      { key: "a", category: "other", basePrice: 1001, quantity: 3 },
    ]);
    expect(result.itemsSubtotal).toBe(3003);
    expect(result.total).toBe(3010);
  });

  it("держит смешанный заказ: известная сумма и позиция по фото", () => {
    const result = calc([
      { key: "sofa-2", category: "sofa", basePrice: 2500, quantity: 1 },
      {
        key: "other-1",
        category: "other",
        basePrice: null,
        quantity: 1,
        manual: true,
      },
    ]);
    expect(result.total).toBe(2500);
    expect(result.hasManualItems).toBe(true);
    expect(result.manualItemsCount).toBe(1);
    expect(result.lines[1]?.lineTotal).toBeNull();
  });

  it("для заказа только из «Другого» не выдумывает сумму", () => {
    const result = calc([
      {
        key: "other-1",
        category: "other",
        basePrice: null,
        quantity: 1,
        manual: true,
      },
    ]);
    expect(result.total).toBeNull();
    expect(result.hasManualItems).toBe(true);
    expect(result.minimumAdjustment).toBe(0);
  });

  it("не применяет минимум к заказу без известных цен", () => {
    const result = calc(
      [
        {
          key: "other-1",
          category: "other",
          basePrice: null,
          quantity: 1,
          manual: true,
        },
      ],
      { outOfTown: true },
    );
    expect(result.total).toBeNull();
    expect(result.outOfTownFee).toBe(0);
  });

  it("суммирует несколько позиций", () => {
    const result = calc([
      {
        key: "sofa-3",
        category: "sofa",
        basePrice: 3200,
        quantity: 1,
        heavySoiling: true,
      },
      {
        key: "armchair-recliner",
        category: "armchair",
        basePrice: 1800,
        quantity: 1,
      },
    ]);
    expect(result.itemsSubtotal).toBe(5960);
    expect(result.total).toBe(5960);
  });

  it("игнорирует загрязнения и вторую сторону, если вариант их не поддерживает", () => {
    const result = calc([
      {
        key: "chair-seat",
        category: "chair",
        basePrice: 500,
        quantity: 1,
        heavySoiling: true,
        secondSide: true,
        allowsSoiling: false,
        allowsSecondSide: false,
      },
    ]);
    expect(result.total).toBe(2500);
    expect(result.lines[0]?.lineTotal).toBe(500);
  });

  it("нормализует количество: минимум 1, только целое", () => {
    const result = calc([
      { key: "sofa-2", category: "sofa", basePrice: 2500, quantity: 0 },
      { key: "chair-seat", category: "chair", basePrice: 500, quantity: 2.7 },
    ]);
    expect(result.lines[0]?.quantity).toBe(1);
    expect(result.lines[1]?.quantity).toBe(2);
    expect(result.total).toBe(3500);
  });

  it("возвращает нулевой заказ без позиций", () => {
    const result = calc([]);
    expect(result.total).toBe(0);
    expect(result.lines).toHaveLength(0);
    expect(result.minimumAdjustment).toBe(0);
  });

  it("соблюдает произвольный шаг округления", () => {
    const result = calculateOrder({
      items: [{ key: "x", category: "other", basePrice: 5001, quantity: 1 }],
      rules: { ...rules, roundingStep: 100 },
      outOfTown: false,
    });
    expect(result.total).toBe(5100);
  });
});
