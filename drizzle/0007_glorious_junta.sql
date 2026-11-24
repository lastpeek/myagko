ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "browser_title" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "logo_key" text;
