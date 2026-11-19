import { eq, inArray } from "drizzle-orm";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { tariffItems, tariffSettings } from "@/lib/db/schema";
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

  const db = getDb();
  const ids = parsed.data.items.map((item) => item.id);
  const existing = await db
    .select({ id: tariffItems.id, isManual: tariffItems.isManual })
    .from(tariffItems)
    .where(inArray(tariffItems.id, ids));

  const existingMap = new Map(existing.map((row) => [row.id, row]));

  for (const item of parsed.data.items) {
    const row = existingMap.get(item.id);
    if (!row) {
      return apiError(`Позиция ${item.id} не найдена`, 400);
    }
    if (row.isManual && item.basePrice !== null) {
      return apiError("У позиции «Другое» цена только по фото", 400);
    }
    if (!row.isManual && item.basePrice === null) {
      return apiError("У позиции с фиксированной ценой цена обязательна", 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(tariffSettings)
      .set({
        minOrder: parsed.data.settings.minOrder,
        soilingPercent: parsed.data.settings.soilingPercent,
        secondSidePercent: parsed.data.settings.secondSidePercent,
        outOfTownFee: parsed.data.settings.outOfTownFee,
        roundingStep: parsed.data.settings.roundingStep,
        updatedAt: new Date(),
      })
      .where(eq(tariffSettings.id, 1));

    for (const item of parsed.data.items) {
      await tx
        .update(tariffItems)
        .set({
          basePrice: item.basePrice,
          isActive: item.isActive,
          updatedAt: new Date(),
        })
        .where(eq(tariffItems.id, item.id));
    }
  });

  return json({ ok: true });
}
