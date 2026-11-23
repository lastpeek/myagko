CREATE TABLE IF NOT EXISTS "catalog_services" (
	"id" text PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"label" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'other' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'catalog_services_category_id_services_id_fk'
	) THEN
		ALTER TABLE "catalog_services" ADD CONSTRAINT "catalog_services_category_id_services_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_services_category_idx" ON "catalog_services" USING btree ("category_id","sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "catalog_services_sort_idx" ON "catalog_services" USING btree ("sort_order");--> statement-breakpoint
INSERT INTO "catalog_services" ("id", "category_id", "label", "hint", "icon", "sort_order", "is_active")
SELECT
	CASE
		WHEN "category" = 'sofa' AND "label" = 'Диван' THEN 'sofa-divan'
		WHEN "category" = 'armchair' AND "label" = 'Кресло' THEN 'armchair-kreslo'
		WHEN "category" = 'mattress' AND "label" = 'Матрас' THEN 'mattress-matras'
		WHEN "category" = 'chair' AND "label" = 'Стул' THEN 'chair-stul'
		WHEN "category" = 'other' AND "label" = 'Другое' THEN 'other-drugoe'
		ELSE "category" || '-' || substr(md5("label"), 1, 10)
	END,
	"category",
	"label",
	'',
	'other',
	100,
	true
FROM (
	SELECT DISTINCT "category", "label" FROM "tariff_items"
) AS "legacy_services"
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "service_id" text;--> statement-breakpoint
UPDATE "tariff_items" AS "ti"
SET "service_id" = "cs"."id"
FROM "catalog_services" AS "cs"
WHERE "cs"."category_id" = "ti"."category"
	AND "cs"."label" = "ti"."label"
	AND "ti"."service_id" IS NULL;--> statement-breakpoint
ALTER TABLE "tariff_items" ALTER COLUMN "service_id" SET NOT NULL;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'tariff_items_service_id_catalog_services_id_fk'
	) THEN
		ALTER TABLE "tariff_items" ADD CONSTRAINT "tariff_items_service_id_catalog_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."catalog_services"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tariff_items_service_idx" ON "tariff_items" USING btree ("service_id","sort_order");--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "unit" text DEFAULT 'шт' NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "parameter_label" text DEFAULT 'Количество' NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "min_value" numeric(10, 2) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "max_value" numeric(10, 2) DEFAULT 99 NOT NULL;--> statement-breakpoint
ALTER TABLE "tariff_items" ADD COLUMN IF NOT EXISTS "step" numeric(10, 2) DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "price_options" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'line' NOT NULL;--> statement-breakpoint
UPDATE "price_options" SET "scope" = 'order' WHERE "kind" = 'fixed_order' AND "scope" <> 'order';--> statement-breakpoint
UPDATE "price_options" SET "scope" = 'line' WHERE "kind" <> 'fixed_order' AND "scope" <> 'line';--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'price_options_scope_check'
	) THEN
		ALTER TABLE "price_options" ADD CONSTRAINT "price_options_scope_check" CHECK ("price_options"."scope" in ('line', 'order'));
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'tariff_items_value_range_check'
	) THEN
		ALTER TABLE "tariff_items" ADD CONSTRAINT "tariff_items_value_range_check" CHECK ("tariff_items"."min_value" <= "tariff_items"."max_value" and "tariff_items"."step" > 0);
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "line_total" SET DATA TYPE numeric(12, 2);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "unit" text;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "parameter_label" text;
