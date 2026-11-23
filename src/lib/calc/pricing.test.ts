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

  it("для заказа только из «Другого» не применяет минимум", () => {
    const result = calc([
      {
        key: "other-1",
        category: "other",
        basePrice: null,
        quantity: 1,
        manual: true,
      },
    ]);
    expect(result.total).toBe(0);
    expect(result.hasPricedItems).toBe(false);
    expect(result.hasManualItems).toBe(true);
    expect(result.minimumAdjustment).toBe(0);
    expect(result.orderOptionsTotal).toBe(0);
  });

  it("для «только по фото» добавляет выезд, но не минимум", () => {
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
    expect(result.total).toBe(500);
    expect(result.outOfTownFee).toBe(500);
    expect(result.minimumAdjustment).toBe(0);
    expect(result.hasPricedItems).toBe(false);
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

  it("применяет процентную опцию по optionIds", () => {
    const result = calc([
      {
        key: "sofa-3",
        category: "sofa",
        basePrice: 3200,
        quantity: 1,
        options: [
          { id: "soiling", label: "Загрязнения", kind: "percent", value: 30 },
        ],
        optionIds: ["soiling"],
      },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(4160);
    expect(result.lines[0]?.options[0]?.amount).toBe(960);
    expect(result.total).toBe(4160);
  });

  it("не умножает фикс на количество параметра: по умолчанию 1 штука", () => {
    const result = calc([
      {
        key: "custom",
        category: "other",
        basePrice: 3000,
        quantity: 2,
        options: [
          { id: "assembly", label: "Сборка", kind: "fixed", value: 200 },
        ],
        optionIds: ["assembly"],
      },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(6200);
    expect(result.lines[0]?.options[0]?.quantity).toBe(1);
    expect(result.lines[0]?.options[0]?.amount).toBe(200);
    expect(result.total).toBe(6200);
  });

  it("умножает fixed-опцию на её собственное количество", () => {
    const result = calc([
      {
        key: "custom",
        category: "other",
        basePrice: 3000,
        quantity: 2,
        options: [
          { id: "assembly", label: "Углы", kind: "fixed", value: 200 },
        ],
        optionSelections: [{ id: "assembly", quantity: 4 }],
      },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(6800);
    expect(result.lines[0]?.options[0]?.quantity).toBe(4);
    expect(result.lines[0]?.options[0]?.amount).toBe(800);
    expect(result.total).toBe(6800);
  });

  it("добавляет фикс за заказ один раз, не умножая на количество", () => {
    const result = calc([
      {
        key: "custom",
        category: "other",
        basePrice: 3000,
        quantity: 3,
        options: [
          { id: "delivery", label: "Доставка", kind: "fixed_order", value: 500 },
        ],
        optionIds: ["delivery"],
      },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(9000);
    expect(result.orderOptionsTotal).toBe(500);
    expect(result.total).toBe(9500);
  });

  it("не дублирует фикс за заказ на нескольких позициях", () => {
    const option = {
      id: "delivery",
      label: "Доставка",
      kind: "fixed_order" as const,
      value: 500,
    };
    const result = calc([
      {
        key: "a",
        category: "other",
        basePrice: 3000,
        quantity: 1,
        options: [option],
        optionIds: ["delivery"],
      },
      {
        key: "b",
        category: "other",
        basePrice: 3000,
        quantity: 1,
        options: [option],
        optionIds: ["delivery"],
      },
    ]);
    expect(result.orderOptions).toHaveLength(1);
    expect(result.orderOptionsTotal).toBe(500);
    expect(result.total).toBe(6500);
  });

  it("применяет процент и фикс в заданном порядке", () => {
    const result = calc([
      {
        key: "custom",
        category: "other",
        basePrice: 3000,
        quantity: 1,
        options: [
          { id: "assembly", label: "Сборка", kind: "fixed", value: 200 },
          { id: "rush", label: "Срочность", kind: "percent", value: 10 },
        ],
        optionIds: ["assembly", "rush"],
      },
    ]);
    expect(result.lines[0]?.lineTotal).toBe(3520);
    expect(result.total).toBe(3520);
  });

  it("считает дробные м² без промежуточного округления до рубля", () => {
    const optionless = [
      {
        key: "a",
        category: "ceilings",
        parameterValue: 1.25,
        pricePerUnit: 333,
        options: [],
      },
      {
        key: "b",
        category: "ceilings",
        parameterValue: 1.25,
        pricePerUnit: 333,
        options: [],
      },
    ];
    const result = calculateOrder({
      items: optionless,
      rules: { ...rules, minOrder: 0 },
      outOfTown: false,
    });
    expect(result.lines[0]?.lineTotal).toBe(416.25);
    expect(result.itemsSubtotal).toBe(832.5);
    expect(result.total).toBe(840);
  });

  it("не применяет фикс за заказ к минимуму", () => {
    const result = calc([
      {
        key: "chair",
        category: "chair",
        basePrice: 500,
        quantity: 1,
        options: [
          { id: "delivery", label: "Доставка", kind: "fixed_order", value: 2000 },
        ],
        optionIds: ["delivery"],
      },
    ]);
    expect(result.itemsSubtotal).toBe(500);
    expect(result.minimumAdjustment).toBe(2000);
    expect(result.orderOptionsTotal).toBe(2000);
    expect(result.total).toBe(4500);
  });
});
