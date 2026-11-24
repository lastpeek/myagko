import fs from "node:fs/promises";
import path from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

async function applyMigration(
  client: PGlite,
  file: string,
): Promise<void> {
  const sql = await fs.readFile(
    path.join(process.cwd(), "drizzle", file),
    "utf8",
  );
  for (const statement of sql.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}

async function counts(client: PGlite): Promise<{
  services: number;
  catalogServices: number;
  options: number;
  links: number;
}> {
  const result = await client.query<{
    services: number;
    catalogServices: number;
    options: number;
    links: number;
  }>(`
    select
      (select count(*)::int from "services") as services,
      (select count(*)::int from "catalog_services") as "catalogServices",
      (select count(*)::int from "price_options") as options,
      (select count(*)::int from "tariff_item_options") as links
  `);
  return result.rows[0]!;
}

describe("миграции услуг и опций", () => {
  it("0004 и 0005 идемпотентны на одной базе", async () => {
    const client = new PGlite();
    try {
      for (const file of [
        "0000_faithful_red_ghost.sql",
        "0001_mean_dark_beast.sql",
        "0002_clammy_vertigo.sql",
        "0003_serious_runaways.sql",
        "0004_light_fantastic_four.sql",
        "0005_silent_the_call.sql",
        "0006_moaning_madelyne_pryor.sql",
        "0007_glorious_junta.sql",
      ]) {
        await applyMigration(client, file);
      }

      const first = await counts(client);
      await applyMigration(client, "0004_light_fantastic_four.sql");
      await applyMigration(client, "0005_silent_the_call.sql");
      await applyMigration(client, "0006_moaning_madelyne_pryor.sql");
      await applyMigration(client, "0007_glorious_junta.sql");
      const second = await counts(client);

      expect(second).toEqual(first);
    } finally {
      await client.close();
    }
  });

  it("переживает легаси-заявку, неактивную услугу и удалённый вариант", async () => {
    const client = new PGlite();
    try {
      for (const file of [
        "0000_faithful_red_ghost.sql",
        "0001_mean_dark_beast.sql",
        "0002_clammy_vertigo.sql",
        "0003_serious_runaways.sql",
      ]) {
        await applyMigration(client, file);
      }

      await client.exec(`
        insert into "tariff_settings"
          ("id", "min_order", "soiling_percent", "second_side_percent", "out_of_town_fee", "rounding_step")
        values (1, 2500, 30, 50, 500, 10);

        insert into "tariff_items"
          ("id", "category", "label", "variant_label", "base_price", "allows_soiling", "allows_second_side", "is_manual", "is_active")
        values
          ('sofa-3', 'sofa', 'Диван', '3 места', 3200, true, false, false, true),
          ('archived', 'custom', 'Архив', 'Старый', 1000, true, false, false, false),
          ('orphan', 'custom', 'Без услуги', 'Без услуги', 500, false, false, false, true);
      `);

      const snapshot = JSON.stringify({
        capturedAt: "2026-01-01T00:00:00.000Z",
        rules: {
          minOrder: 2500,
          soilingPercent: 30,
          secondSidePercent: 50,
          outOfTownFee: 500,
          roundingStep: 10,
        },
        tariff: [],
        otherRequiresPhoto: true,
      });
      const breakdown = JSON.stringify({
        lines: [
          {
            key: "sofa-3#0",
            label: "Диван",
            variantLabel: "3 места",
            quantity: 1,
            heavySoiling: true,
            secondSide: true,
            manual: false,
            unitBasePrice: 3200,
            lineTotal: 4160,
            formula: "3 200 × 1.3 = 4 160 ₽",
          },
        ],
        itemsSubtotal: 4160,
        minimumAdjustment: 0,
        outOfTownFee: 0,
        roundingAdjustment: 0,
        total: 4160,
        hasManualItems: false,
        manualItemsCount: 0,
        minOrder: 2500,
      });

      const inserted = await client.query<{ id: string }>(
        `insert into "orders"
          ("public_number", "token", "name", "phone", "address", "consent_at", "consent_version", "estimated_total", "price_snapshot", "breakdown")
         values (1001, 'legacy-token-123', 'Клиент', '+79130000000', 'Адрес', now(), '1', 4160, $1::jsonb, $2::jsonb)
         returning "id"`,
        [snapshot, breakdown],
      );
      const orderId = inserted.rows[0]!.id;

      await client.query(
        `insert into "order_items"
          ("order_id", "tariff_item_id", "category", "label", "variant_label", "quantity", "heavy_soiling", "second_side", "unit_base_price", "line_total", "formula", "sort_order")
         values ($1, 'deleted-variant', 'custom', 'Удалённый', 'Старый', 1, true, true, 1000, 1500, '', 0)`,
        [orderId],
      );

      const before = await client.query<{
        price_snapshot: unknown;
        breakdown: unknown;
      }>(
        `select o."price_snapshot", o."breakdown"
         from "orders" o
         where o."id" = $1`,
        [orderId],
      );

      await applyMigration(client, "0004_light_fantastic_four.sql");
      await applyMigration(client, "0005_silent_the_call.sql");
      await client.exec(`
        insert into "price_options" ("id", "label", "kind", "value", "sort_order", "is_active")
        values ('rush', 'Срочность', 'fixed_order', 1000, 30, true);
      `);
      await applyMigration(client, "0006_moaning_madelyne_pryor.sql");
      await applyMigration(client, "0007_glorious_junta.sql");

      await client.exec(`
        update "services" set "is_active" = false where "id" = 'custom';
        delete from "tariff_items" where "id" = 'archived';
      `);

      const afterDirty = await counts(client);
      await applyMigration(client, "0004_light_fantastic_four.sql");
      await applyMigration(client, "0005_silent_the_call.sql");
      await applyMigration(client, "0006_moaning_madelyne_pryor.sql");
      await applyMigration(client, "0007_glorious_junta.sql");
      const afterSecondRun = await counts(client);
      expect(afterSecondRun).toEqual(afterDirty);

      const after = await client.query<{
        price_snapshot: unknown;
        breakdown: unknown;
        options: unknown;
      }>(
        `select o."price_snapshot", o."breakdown", oi."options"
         from "orders" o
         join "order_items" oi on oi."order_id" = o."id"
         where o."id" = $1`,
        [orderId],
      );

      expect(after.rows[0]?.price_snapshot).toEqual(
        before.rows[0]?.price_snapshot,
      );
      expect(after.rows[0]?.breakdown).toEqual(before.rows[0]?.breakdown);
      expect(after.rows[0]?.options).toBeNull();

      const custom = await client.query<{ is_active: boolean }>(
        `select "is_active" from "services" where "id" = 'custom'`,
      );
      expect(custom.rows[0]?.is_active).toBe(false);

      const variants = await client.query<{
        service_id: string;
        unit: string;
        parameter_label: string;
      }>(
        `select "service_id", "unit", "parameter_label" from "tariff_items"`,
      );
      expect(variants.rows.length).toBeGreaterThan(0);
      for (const variant of variants.rows) {
        expect(variant.service_id).toBeTruthy();
        expect(variant.unit).toBe("шт");
        expect(variant.parameter_label).toBe("Количество");
      }

      const rush = await client.query<{ scope: string }>(
        `select "scope" from "price_options" where "id" = 'rush'`,
      );
      expect(rush.rows[0]?.scope).toBe("order");

      await expect(
        client.exec(
          `insert into "price_options" ("id", "label", "kind", "value") values ('bad', 'Плохая', 'bogus', 1)`,
        ),
      ).rejects.toThrow();
      await expect(
        client.exec(
          `insert into "tariff_items" ("id", "category", "label", "variant_label") values ('bad', 'missing', 'Плохой', 'Нет услуги')`,
        ),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  });
});
