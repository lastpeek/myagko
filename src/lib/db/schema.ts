import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type { PricingCategory, PricingRules } from "@/lib/calc/pricing";

export type OrderStatus = "new" | "agreed" | "done" | "cancelled";

export type CompanySettings = {
  name: string;
  city: string;
  phone: string;
  email: string;
  territory: string;
  accentColor: string;
  heroTitle: string;
  heroSubtitle: string;
  otherRequiresPhoto: boolean;
};

export type TariffItemSnapshot = {
  key: string;
  category: PricingCategory;
  label: string;
  variantLabel: string;
  basePrice: number | null;
  requiresPhoto: boolean;
  allowsSoiling: boolean;
  allowsSecondSide: boolean;
  isManual: boolean;
};

export type PriceSnapshot = {
  capturedAt: string;
  rules: PricingRules;
  tariff: TariffItemSnapshot[];
  otherRequiresPhoto: boolean;
};

export type OrderBreakdown = {
  lines: Array<{
    key: string;
    label: string;
    variantLabel: string;
    quantity: number;
    heavySoiling: boolean;
    secondSide: boolean;
    manual: boolean;
    unitBasePrice: number | null;
    lineTotal: number | null;
    formula: string;
  }>;
  itemsSubtotal: number;
  minimumAdjustment: number;
  outOfTownFee: number;
  roundingAdjustment: number;
  total: number | null;
  hasManualItems: boolean;
  manualItemsCount: number;
  minOrder: number;
};

export type OrderEventPayload = Record<string, string | number | null>;

export type SettingsRecord = typeof tariffSettings.$inferSelect;
export type TariffRecord = typeof tariffItems.$inferSelect;
export type OrderRecord = typeof orders.$inferSelect;

export const company = pgTable("company", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  email: text("email").notNull(),
  territory: text("territory").notNull(),
  accentColor: text("accent_color").notNull(),
  heroTitle: text("hero_title").notNull(),
  heroSubtitle: text("hero_subtitle").notNull(),
  otherRequiresPhoto: boolean("other_requires_photo").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tariffSettings = pgTable("tariff_settings", {
  id: integer("id").primaryKey(),
  minOrder: integer("min_order").notNull(),
  soilingPercent: integer("soiling_percent").notNull(),
  secondSidePercent: integer("second_side_percent").notNull(),
  outOfTownFee: integer("out_of_town_fee").notNull(),
  roundingStep: integer("rounding_step").notNull(),
  maxPhotosPerItem: integer("max_photos_per_item").notNull().default(3),
  maxPhotosPerOrder: integer("max_photos_per_order").notNull().default(15),
  maxOrderFileBytes: integer("max_order_file_bytes").notNull().default(60_000_000),
  startingOrderNumber: integer("starting_order_number").notNull().default(1001),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const tariffItems = pgTable(
  "tariff_items",
  {
    id: text("id").primaryKey(),
    category: text("category").$type<PricingCategory>().notNull(),
    label: text("label").notNull(),
    variantLabel: text("variant_label").notNull(),
    basePrice: integer("base_price"),
    requiresPhoto: boolean("requires_photo").notNull().default(false),
    allowsSoiling: boolean("allows_soiling").notNull().default(true),
    allowsSecondSide: boolean("allows_second_side").notNull().default(false),
    isManual: boolean("is_manual").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("tariff_items_sort_idx").on(table.sortOrder)],
);

export const galleryPhotos = pgTable(
  "gallery_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storageKey: text("storage_key").notNull().unique(),
    beforeStorageKey: text("before_storage_key"),
    caption: text("caption").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("gallery_photos_order_idx").on(table.sortOrder)],
);

export const telegramLinks = pgTable("telegram_links", {
  id: integer("id").primaryKey(),
  chatId: text("chat_id"),
  username: text("username"),
  code: text("code"),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publicNumber: integer("public_number").notNull().unique(),
    token: text("token").notNull().unique(),
    status: text("status").$type<OrderStatus>().notNull().default("new"),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    address: text("address").notNull(),
    outOfTown: boolean("out_of_town").notNull().default(false),
    desiredDate: date("desired_date", { mode: "string" }),
    desiredTimeFrom: text("desired_time_from"),
    desiredTimeTo: text("desired_time_to"),
    comment: text("comment").notNull().default(""),
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    consentVersion: text("consent_version").notNull(),
    estimatedTotal: integer("estimated_total"),
    finalPrice: integer("final_price"),
    agreedDate: date("agreed_date", { mode: "string" }),
    agreedTimeFrom: text("agreed_time_from"),
    agreedTimeTo: text("agreed_time_to"),
    ownerNote: text("owner_note").notNull().default(""),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    priceSnapshot: jsonb("price_snapshot").$type<PriceSnapshot>().notNull(),
    breakdown: jsonb("breakdown").$type<OrderBreakdown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("orders_status_idx").on(table.status, table.createdAt),
    index("orders_created_idx").on(table.createdAt),
    index("orders_phone_idx").on(table.phone),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    tariffItemId: text("tariff_item_id"),
    category: text("category").$type<PricingCategory>().notNull(),
    label: text("label").notNull(),
    variantLabel: text("variant_label").notNull(),
    manualDescription: text("manual_description"),
    quantity: integer("quantity").notNull(),
    heavySoiling: boolean("heavy_soiling").notNull().default(false),
    secondSide: boolean("second_side").notNull().default(false),
    unitBasePrice: integer("unit_base_price"),
    lineTotal: integer("line_total"),
    formula: text("formula").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("order_items_order_idx").on(table.orderId, table.sortOrder)],
);

export const orderPhotos = pgTable(
  "order_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("order_photos_order_idx").on(table.orderId)],
);

export const orderEvents = pgTable(
  "order_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actor: text("actor").notNull().default("system"),
    payload: jsonb("payload").$type<OrderEventPayload>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("order_events_order_idx").on(table.orderId, table.createdAt)],
);

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").notNull().default(true),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminSessions = pgTable(
  "admin_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
  },
  (table) => [index("admin_sessions_user_idx").on(table.userId)],
);

export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idempotency_created_idx").on(table.createdAt)],
);

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("rate_limit_key_idx").on(table.key, table.createdAt),
    index("rate_limit_created_idx").on(table.createdAt),
  ],
);

export const orderItemPhotosRelations = relations(orderItems, ({ many }) => ({
  photos: many(orderPhotos),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  photos: many(orderPhotos),
  events: many(orderEvents),
}));
