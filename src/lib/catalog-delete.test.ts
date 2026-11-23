import fs from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deleteCatalogEntity } from "@/lib/catalog-delete";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import {
  catalogServices,
  orderItems,
  orders,
  services,
} from "@/lib/db/schema";
import { seedDatabase } from "@/lib/seed-data";

const DB_PATH = path.join(process.cwd(), ".data", "catalog-delete-test");

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.AUTH_SECRET = "catalog-delete-test-secret-0123456789";
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

describe("удаление справочников", () => {
  it("не удаляет услугу с вариантами и категорию с услугами", async () => {
    await expect(
      deleteCatalogEntity(getDb(), "service", "chair-stul"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      deleteCatalogEntity(getDb(), "category", "chair"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("не удаляет вариант, на который ссылается заявка", async () => {
    const db = getDb();
    const inserted = await db
      .insert(orders)
      .values({
        publicNumber: 9001,
        token: "catalog-delete-order-token",
        name: "Клиент",
        phone: "+79130000000",
        address: "Адрес",
        consentAt: new Date(),
        consentVersion: "test",
        estimatedTotal: 5000,
        priceSnapshot: {
          capturedAt: new Date().toISOString(),
          rules: {
            minOrder: 2500,
            outOfTownFee: 500,
            roundingStep: 10,
          },
          tariff: [],
          otherRequiresPhoto: true,
        },
        breakdown: {
          lines: [],
          itemsSubtotal: 5000,
          minimumAdjustment: 0,
          outOfTownFee: 0,
          roundingAdjustment: 0,
          total: 5000,
          hasManualItems: false,
          manualItemsCount: 0,
          minOrder: 2500,
        },
      })
      .returning({ id: orders.id });

    await db.insert(orderItems).values({
      orderId: inserted[0]!.id,
      tariffItemId: "sofa-3",
      category: "sofa",
      label: "Диван",
      variantLabel: "3 места",
      quantity: 1,
      unitBasePrice: 3200,
      lineTotal: 3200,
      formula: "3 200 ₽",
      sortOrder: 0,
    });

    await expect(
      deleteCatalogEntity(getDb(), "variant", "sofa-3"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("удаляет вариант, услугу и категорию без ссылок", async () => {
    const db = getDb();
    await db
      .insert(services)
      .values({
        id: "empty-category",
        label: "Пустая",
        hint: "",
        icon: "other",
        sortOrder: 900,
        isActive: true,
      })
      .onConflictDoNothing();
    await db
      .insert(catalogServices)
      .values({
        id: "empty-service",
        categoryId: "empty-category",
        label: "Пустая услуга",
        hint: "",
        icon: "other",
        sortOrder: 900,
        isActive: true,
      })
      .onConflictDoNothing();

    await deleteCatalogEntity(db, "variant", "chair-seat");
    await deleteCatalogEntity(db, "service", "empty-service");
    await deleteCatalogEntity(db, "category", "empty-category");

    const serviceRows = await db
      .select()
      .from(catalogServices)
      .where(eq(catalogServices.id, "empty-service"));
    const categoryRows = await db
      .select()
      .from(services)
      .where(eq(services.id, "empty-category"));

    expect(serviceRows).toHaveLength(0);
    expect(categoryRows).toHaveLength(0);
  });
});
