CREATE TABLE "price_options" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" text NOT NULL,
	"value" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"hint" text DEFAULT '' NOT NULL,
	"icon" text DEFAULT 'other' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tariff_item_options" (
	"item_id" text NOT NULL,
	"option_id" text NOT NULL,
	CONSTRAINT "tariff_item_options_item_id_option_id_pk" PRIMARY KEY("item_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "options" jsonb;--> statement-breakpoint
ALTER TABLE "tariff_item_options" ADD CONSTRAINT "tariff_item_options_item_id_tariff_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."tariff_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tariff_item_options" ADD CONSTRAINT "tariff_item_options_option_id_price_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."price_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "price_options_sort_idx" ON "price_options" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "services_sort_idx" ON "services" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "tariff_item_options_option_idx" ON "tariff_item_options" USING btree ("option_id");--> statement-breakpoint
INSERT INTO "services" ("id", "label", "hint", "icon", "sort_order", "is_active") VALUES
	('sofa', 'Диваны', '2, 3 места, угловой', 'sofa', 10, true),
	('armchair', 'Кресла', 'Обычное или с откидной спинкой', 'armchair', 20, true),
	('mattress', 'Матрасы', 'С одной или двумя сторонами', 'mattress', 30, true),
	('chair', 'Стулья', 'Только сиденье или весь стул', 'chair', 40, true),
	('other', 'Другое', 'Опишите и приложите фото', 'other', 50, true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "services" ("id", "label", "hint", "icon", "sort_order", "is_active")
SELECT DISTINCT "category", "category", '', 'other', 100, true
FROM "tariff_items"
WHERE "category" NOT IN (SELECT "id" FROM "services")
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "price_options" ("id", "label", "kind", "value", "sort_order", "is_active") VALUES
	('soiling', 'Сильные загрязнения', 'percent', COALESCE((SELECT "soiling_percent" FROM "tariff_settings" WHERE "id" = 1), 30), 10, true),
	('second-side', 'Вторая сторона', 'percent', COALESCE((SELECT "second_side_percent" FROM "tariff_settings" WHERE "id" = 1), 50), 20, true)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "tariff_item_options" ("item_id", "option_id")
SELECT "id", 'soiling' FROM "tariff_items" WHERE "allows_soiling" = true
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "tariff_item_options" ("item_id", "option_id")
SELECT "id", 'second-side' FROM "tariff_items" WHERE "allows_second_side" = true
ON CONFLICT DO NOTHING;