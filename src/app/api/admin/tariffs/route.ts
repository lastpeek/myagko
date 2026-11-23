import { eq, inArray } from "drizzle-orm";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import {
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
} from "@/lib/db/schema";
import { isSameOrigin } from "@/lib/rate-limit";
import { updateTariffsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = updateTariffsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400);
  }

  const { settings, services: serviceRows, options, items } = parsed.data;
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(tariffSettings)
      .set({
        minOrder: settings.minOrder,
        outOfTownFee: settings.outOfTownFee,
        roundingStep: settings.roundingStep,
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

    for (const option of options) {
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

    for (const item of items) {
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

    const itemIds = items.map((item) => item.id);
    if (itemIds.length > 0) {
      await tx
        .delete(tariffItemOptions)
        .where(inArray(tariffItemOptions.itemId, itemIds));

      const links = items.flatMap((item) =>
        item.optionIds.map((optionId) => ({
          itemId: item.id,
          optionId,
        })),
      );
      if (links.length > 0) {
        await tx.insert(tariffItemOptions).values(links).onConflictDoNothing();
      }
    }
  });

  return json({ ok: true });
}
