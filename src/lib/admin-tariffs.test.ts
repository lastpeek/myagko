import fs from "node:fs/promises";
import path from "node:path";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyTariffsUpdate, TariffUpdateError } from "@/lib/admin-tariffs";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import {
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
} from "@/lib/db/schema";
import { seedDatabase } from "@/lib/seed-data";
import {
  pricingOptionInputSchema,
  updateTariffsSchema,
} from "@/lib/validation";

const DB_PATH = path.join(process.cwd(), ".data", "admin-tariffs-test");

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.AUTH_SECRET = "admin-tariffs-test-secret-0123456789";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await runMigrations();
  await seedDatabase(getDb(), { requireAdmin: false });
});

afterAll(async () => {
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
});

describe("сохранение тарифов", () => {
  it("принимает старый payload и не стирает связи с опциями", async () => {
    const db = getDb();

    await db
      .delete(tariffItemOptions)
      .where(
        and(
          eq(tariffItemOptions.itemId, "sofa-2"),
          eq(tariffItemOptions.optionId, "soiling"),
        ),
      );

    const parsed = updateTariffsSchema.safeParse({
      settings: {
        minOrder: 3000,
        soilingPercent: 40,
        secondSidePercent: 60,
        outOfTownFee: 700,
        roundingStep: 50,
      },
      items: [{ id: "sofa-2", basePrice: 2600, isActive: true }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    await applyTariffsUpdate(db, parsed.data);

    const item = await db
      .select()
      .from(tariffItems)
      .where(eq(tariffItems.id, "sofa-2"));
    const settings = await db
      .select()
      .from(tariffSettings)
      .where(eq(tariffSettings.id, 1));
    const links = await db
      .select()
      .from(tariffItemOptions)
      .where(
        and(
          eq(tariffItemOptions.itemId, "sofa-2"),
          eq(tariffItemOptions.optionId, "soiling"),
        ),
      );

    expect(item[0]?.basePrice).toBe(2600);
    expect(item[0]?.isActive).toBe(true);
    expect(settings[0]?.minOrder).toBe(3000);
    expect(settings[0]?.soilingPercent).toBe(40);
    expect(links).toHaveLength(0);
  });

  it("принимает полный payload и создаёт услугу, вариант и связь", async () => {
    const db = getDb();

    const parsed = updateTariffsSchema.safeParse({
      settings: {
        minOrder: 2500,
        outOfTownFee: 500,
        roundingStep: 10,
      },
      services: [
        {
          id: "windows",
          label: "Окна",
          hint: "Мойка стекла",
          icon: "other",
          sortOrder: 200,
          isActive: true,
        },
      ],
      options: [
        {
          id: "frames",
          label: "Рамы",
          kind: "fixed",
          value: 200,
          sortOrder: 10,
          isActive: true,
        },
      ],
      items: [
        {
          id: "window-3",
          category: "windows",
          label: "Окно",
          variantLabel: "3 створки",
          basePrice: 3000,
          requiresPhoto: false,
          isManual: false,
          isActive: true,
          sortOrder: 200,
          optionIds: ["frames"],
        },
      ],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    await applyTariffsUpdate(db, parsed.data);

    const service = await db
      .select()
      .from(services)
      .where(eq(services.id, "windows"));
    const option = await db
      .select()
      .from(priceOptions)
      .where(eq(priceOptions.id, "frames"));
    const item = await db
      .select()
      .from(tariffItems)
      .where(eq(tariffItems.id, "window-3"));
    const link = await db
      .select()
      .from(tariffItemOptions)
      .where(
        and(
          eq(tariffItemOptions.itemId, "window-3"),
          eq(tariffItemOptions.optionId, "frames"),
        ),
      );

    expect(service).toHaveLength(1);
    expect(option[0]?.kind).toBe("fixed");
    expect(item[0]?.category).toBe("windows");
    expect(link).toHaveLength(1);

    const legacy = updateTariffsSchema.safeParse({
      settings: { minOrder: 2500, outOfTownFee: 500, roundingStep: 10 },
      items: [{ id: "window-3", basePrice: 3100, isActive: true }],
    });
    expect(legacy.success).toBe(true);
    if (!legacy.success) return;

    await applyTariffsUpdate(db, legacy.data);

    const linksAfter = await db
      .select()
      .from(tariffItemOptions)
      .where(eq(tariffItemOptions.itemId, "window-3"));
    expect(linksAfter).toHaveLength(1);
  });

  it("отклоняет отсутствующий вариант в старом payload", async () => {
    const parsed = updateTariffsSchema.safeParse({
      settings: { minOrder: 2500, outOfTownFee: 500, roundingStep: 10 },
      items: [{ id: "missing", basePrice: 100, isActive: true }],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    await expect(
      applyTariffsUpdate(getDb(), parsed.data),
    ).rejects.toBeInstanceOf(TariffUpdateError);
  });
});

describe("валидация опций", () => {
  const base = {
    id: "option",
    label: "Опция",
    sortOrder: 0,
    isActive: true,
  };

  it("принимает допустимые значения", () => {
    expect(
      pricingOptionInputSchema.safeParse({
        ...base,
        kind: "percent",
        value: 500,
      }).success,
    ).toBe(true);
    expect(
      pricingOptionInputSchema.safeParse({
        ...base,
        kind: "fixed",
        value: 1_000_000,
      }).success,
    ).toBe(true);
    expect(
      pricingOptionInputSchema.safeParse({
        ...base,
        kind: "fixed_order",
        value: 0,
      }).success,
    ).toBe(true);
  });

  it("отклоняет процент выше 500", () => {
    const result = pricingOptionInputSchema.safeParse({
      ...base,
      kind: "percent",
      value: 501,
    });
    expect(result.success).toBe(false);
  });

  it("отклоняет отрицательные, дробные и нечисловые значения", () => {
    for (const value of [-1, 1.5, "100", Number.NaN]) {
      const result = pricingOptionInputSchema.safeParse({
        ...base,
        kind: "fixed",
        value,
      });
      expect(result.success).toBe(false);
    }
  });

  it("отклоняет фикс выше 1 000 000", () => {
    const result = pricingOptionInputSchema.safeParse({
      ...base,
      kind: "fixed_order",
      value: 1_000_001,
    });
    expect(result.success).toBe(false);
  });
});
