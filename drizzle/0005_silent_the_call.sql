INSERT INTO "services" ("id", "label", "hint", "icon", "sort_order", "is_active")
SELECT DISTINCT "category", "category", '', 'other', 100, true
FROM "tariff_items"
WHERE "category" NOT IN (SELECT "id" FROM "services")
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'tariff_items_category_services_id_fk'
	) THEN
		ALTER TABLE "tariff_items" ADD CONSTRAINT "tariff_items_category_services_id_fk" FOREIGN KEY ("category") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'price_options_kind_check'
	) THEN
		ALTER TABLE "price_options" ADD CONSTRAINT "price_options_kind_check" CHECK ("price_options"."kind" in ('percent', 'fixed', 'fixed_order'));
	END IF;
END $$;
