import { eq, inArray } from "drizzle-orm";

import type { Database } from "@/lib/db";
import {
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
} from "@/lib/db/schema";
import type { UpdateTariffsInput } from "@/lib/validation";

export class TariffUpdateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TariffUpdateError";
  }
}

/**
 * Сохранение тарифов из кабинета.
 *
 * Старый payload (settings + items: id/basePrice/isActive) меняет только цены,
 * видимость и правила. Полный payload (services + options + items) заменяет
 * связи вариантов с опциями. Так кабинет работает и до захода 2.
 */
export async function applyTariffsUpdate(
  db: Database,
  input: UpdateTariffsInput,
  now: Date = new Date(),
): Promise<void> {
  const full = input.services !== undefined && input.options !== undefined;

  if (!full) {
    await applyLegacyUpdate(db, input, now);
    return;
  }

  await applyFullUpdate(db, input, now);
}

async function applyLegacyUpdate(
  db: Database,
  input: UpdateTariffsInput,
  now: Date,
): Promise<void> {
  const ids = input.items.map((item) => item.id);
  const rows =
    ids.length > 0
      ? await db
          .select({ id: tariffItems.id, isManual: tariffItems.isManual })
          .from(tariffItems)
          .where(inArray(tariffItems.id, ids))
      : [];
  const existing = new Map(rows.map((row) => [row.id, row]));

  for (const item of input.items) {
    const row = existing.get(item.id);
    if (!row) {
      throw new TariffUpdateError(`Позиция ${item.id} не найдена`);
    }
    if (row.isManual && item.basePrice !== null) {
      throw new TariffUpdateError("У позиции «По фото» цена только по фото");
    }
    if (!row.isManual && item.basePrice === null) {
      throw new TariffUpdateError(
        "У позиции с фиксированной ценой цена обязательна",
      );
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tariffSettings)
      .set({
        minOrder: input.settings.minOrder,
        outOfTownFee: input.settings.outOfTownFee,
        roundingStep: input.settings.roundingStep,
        ...(input.settings.soilingPercent !== undefined
          ? { soilingPercent: input.settings.soilingPercent }
          : {}),
        ...(input.settings.secondSidePercent !== undefined
          ? { secondSidePercent: input.settings.secondSidePercent }
          : {}),
        updatedAt: now,
      })
      .where(eq(tariffSettings.id, 1));

    for (const item of input.items) {
      await tx
        .update(tariffItems)
        .set({
          basePrice: item.basePrice,
          isActive: item.isActive,
          updatedAt: now,
        })
        .where(eq(tariffItems.id, item.id));
    }
  });
}

async function applyFullUpdate(
  db: Database,
  input: UpdateTariffsInput,
  now: Date,
): Promise<void> {
  const serviceRows = input.services ?? [];
  const optionRows = input.options ?? [];

  await db.transaction(async (tx) => {
    await tx
      .update(tariffSettings)
      .set({
        minOrder: input.settings.minOrder,
        outOfTownFee: input.settings.outOfTownFee,
        roundingStep: input.settings.roundingStep,
        ...(input.settings.soilingPercent !== undefined
          ? { soilingPercent: input.settings.soilingPercent }
          : {}),
        ...(input.settings.secondSidePercent !== undefined
          ? { secondSidePercent: input.settings.secondSidePercent }
          : {}),
        updatedAt: now,
      })
      .where(eq(tariffSettings.id, 1));

    for (const service of serviceRows) {
      await tx
        .insert(services)
        .values({
          id: service.id,
          label: service.label,
          hint: service.hint,
          icon: service.icon,
          sortOrder: service.sortOrder,
          isActive: service.isActive,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: services.id,
          set: {
            label: service.label,
            hint: service.hint,
            icon: service.icon,
            sortOrder: service.sortOrder,
            isActive: service.isActive,
            updatedAt: now,
          },
        });
    }

    for (const option of optionRows) {
      await tx
        .insert(priceOptions)
        .values({
          id: option.id,
          label: option.label,
          kind: option.kind,
          value: option.value,
          sortOrder: option.sortOrder,
          isActive: option.isActive,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: priceOptions.id,
          set: {
            label: option.label,
            kind: option.kind,
            value: option.value,
            sortOrder: option.sortOrder,
            isActive: option.isActive,
            updatedAt: now,
          },
        });
    }

    for (const item of input.items) {
      if (!("category" in item)) {
        throw new TariffUpdateError("Нужны полные данные варианта");
      }

      await tx
        .insert(tariffItems)
        .values({
          id: item.id,
          category: item.category,
          label: item.label,
          variantLabel: item.variantLabel,
          basePrice: item.isManual ? null : item.basePrice,
          requiresPhoto: item.requiresPhoto,
          allowsSoiling: true,
          allowsSecondSide: false,
          isManual: item.isManual,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: tariffItems.id,
          set: {
            category: item.category,
            label: item.label,
            variantLabel: item.variantLabel,
            basePrice: item.isManual ? null : item.basePrice,
            requiresPhoto: item.requiresPhoto,
            isManual: item.isManual,
            sortOrder: item.sortOrder,
            isActive: item.isActive,
            updatedAt: now,
          },
        });
    }

    const itemIds = input.items.map((item) => item.id);
    if (itemIds.length > 0) {
      await tx
        .delete(tariffItemOptions)
        .where(inArray(tariffItemOptions.itemId, itemIds));

      const links = input.items.flatMap((item) =>
        "category" in item
          ? item.optionIds.map((optionId) => ({
              itemId: item.id,
              optionId,
            }))
          : [],
      );
      if (links.length > 0) {
        await tx.insert(tariffItemOptions).values(links).onConflictDoNothing();
      }
    }
  });
}
