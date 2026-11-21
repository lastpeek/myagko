CREATE TABLE "telegram_links" (
	"id" integer PRIMARY KEY NOT NULL,
	"chat_id" text,
	"username" text,
	"code" text,
	"code_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "notified_at" timestamp with time zone;