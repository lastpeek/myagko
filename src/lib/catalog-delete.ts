import { eq } from "drizzle-orm";

import type { Database } from "@/lib/db";
import {
  catalogServices,
  orderItems,
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
} from "@/lib/db/schema";

export type CatalogEntityKind =
  | "category"
  | "service"
  | "variant"
  | "option";

export class CatalogDeleteError extends Error {
  readonly status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "CatalogDeleteError";
    this.status = status;
  }
}

/**
 * Удаление справочника разрешено, только если на него ничего не ссылается.
 * Категория с услугами, услуга с вариантами и вариант с заявками удаляются
 * только через архив (`is_active = false`).
 */
export async function setCatalogEntityActive(
  db: Database,
  kind: CatalogEntityKind,
  id: string,
  isActive: boolean,
): Promise<void> {
  if (kind === "category") {
    const updated = await db
      .update(services)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning({ id: services.id });
    if (!updated[0]) throw new CatalogDeleteError("Категория не найдена", 404);
    return;
  }

  if (kind === "service") {
    const updated = await db
      .update(catalogServices)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(catalogServices.id, id))
      .returning({ id: catalogServices.id });
    if (!updated[0]) throw new CatalogDeleteError("Услуга не найдена", 404);
    return;
  }

  if (kind === "option") {
    const updated = await db
      .update(priceOptions)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(priceOptions.id, id))
      .returning({ id: priceOptions.id });
    if (!updated[0]) throw new CatalogDeleteError("Опция не найдена", 404);
    return;
  }

  const updated = await db
    .update(tariffItems)
    .set({ isActive, updatedAt: new Date() })
    .where(eq(tariffItems.id, id))
    .returning({ id: tariffItems.id });
  if (!updated[0]) throw new CatalogDeleteError("Вариант не найден", 404);
}

export async function deleteCatalogEntity(
  db: Database,
  kind: CatalogEntityKind,
  id: string,
): Promise<void> {
  if (kind === "category") {
    const rows = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.id, id))
      .limit(1);
    if (!rows[0]) throw new CatalogDeleteError("Категория не найдена", 404);

    const childServices = await db
      .select({ id: catalogServices.id })
      .from(catalogServices)
      .where(eq(catalogServices.categoryId, id))
      .limit(1);
    if (childServices[0]) {
      throw new CatalogDeleteError(
        "В категории есть услуги. Сначала перенесите или удалите их, либо скройте категорию",
      );
    }

    const childVariants = await db
      .select({ id: tariffItems.id })
      .from(tariffItems)
      .where(eq(tariffItems.category, id))
      .limit(1);
    if (childVariants[0]) {
      throw new CatalogDeleteError(
        "В категории есть варианты. Их можно только скрыть",
      );
    }

    await db.delete(services).where(eq(services.id, id));
    return;
  }

  if (kind === "service") {
    const rows = await db
      .select({ id: catalogServices.id })
      .from(catalogServices)
      .where(eq(catalogServices.id, id))
      .limit(1);
    if (!rows[0]) throw new CatalogDeleteError("Услуга не найдена", 404);

    const childVariants = await db
      .select({ id: tariffItems.id })
      .from(tariffItems)
      .where(eq(tariffItems.serviceId, id))
      .limit(1);
    if (childVariants[0]) {
      throw new CatalogDeleteError(
        "У услуги есть варианты. Их можно только скрыть",
      );
    }

    await db.delete(catalogServices).where(eq(catalogServices.id, id));
    return;
  }

  if (kind === "option") {
    const rows = await db
      .select({
        id: priceOptions.id,
        kind: priceOptions.kind,
        isActive: priceOptions.isActive,
      })
      .from(priceOptions)
      .where(eq(priceOptions.id, id))
      .limit(1);
    if (!rows[0]) throw new CatalogDeleteError("Опция не найдена", 404);

    if (rows[0].kind === "fixed_order" && rows[0].isActive) {
      throw new CatalogDeleteError(
        "Опция действует на весь заказ. Снимите «Доступна для привязки», чтобы скрыть её.",
      );
    }

    const used = await db
      .select({ itemId: tariffItemOptions.itemId })
      .from(tariffItemOptions)
      .where(eq(tariffItemOptions.optionId, id))
      .limit(1);
    if (used[0]) {
      throw new CatalogDeleteError(
        "Опция используется в вариантах. Снимите «Доступна для привязки», чтобы скрыть её.",
      );
    }

    await db.delete(priceOptions).where(eq(priceOptions.id, id));
    return;
  }

  const rows = await db
    .select({ id: tariffItems.id })
    .from(tariffItems)
    .where(eq(tariffItems.id, id))
    .limit(1);
  if (!rows[0]) throw new CatalogDeleteError("Вариант не найден", 404);

  const referenced = await db
    .select({ id: orderItems.id })
    .from(orderItems)
    .where(eq(orderItems.tariffItemId, id))
    .limit(1);
  if (referenced[0]) {
    throw new CatalogDeleteError(
      "На вариант ссылаются заявки. Его можно только скрыть",
    );
  }

  await db.delete(tariffItems).where(eq(tariffItems.id, id));
}
