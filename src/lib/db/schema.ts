import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  AppliedPricingOption,
  PricingCategory,
  PricingOption,
  PricingOptionKind,
  PricingOptionScope,
  PricingRules,
} from "@/lib/calc/pricing";

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

export type CatalogServiceSnapshot = {
  id: string;
  categoryId: string;
  label: string;
  hint: string;
  icon: string;
};

export type TariffItemSnapshot = {
  key: string;
  category: PricingCategory;
  serviceId?: string;
  serviceLabel?: string;
  label: string;
  variantLabel: string;
  unit?: string;
  parameterLabel?: string;
  basePrice: number | null;
  pricePerUnit?: number | null;
  minValue?: number;
  maxValue?: number;
  step?: number;
  requiresPhoto: boolean;
  allowsSoiling: boolean;
  allowsSecondSide: boolean;
  isManual: boolean;
  /** Опции варианта с kind/value/scope на момент снимка. */
  options?: PricingOption[];
};

export type PriceSnapshot = {
  capturedAt: string;
  rules: PricingRules;
  tariff: TariffItemSnapshot[];
  otherRequiresPhoto: boolean;
  /** Каталог опций с kind/value/scope на момент снимка. */
  options?: PricingOption[];
  categories?: Array<{ id: string; label: string }>;
  catalogServices?: CatalogServiceSnapshot[];
};

export type OrderBreakdown = {
  lines: Array<{
    key: string;
    serviceId?: string;
    serviceLabel?: string;
    variantId?: string;
    /** Легаси-название варианта; новые заявки дублируют в variantLabel. */
    label: string;
    variantLabel: string;
    unit?: string;
    parameterLabel?: string;
    parameterValue?: number;
    /** Старое имя quantity; новые заявки хранят значение параметра здесь. */
    quantity: number;
    pricePerUnit?: number | null;
    baseTotal?: number | null;
    /** Легаси-флаги: нужны для отображения заявок, созданных до опций. */
    heavySoiling: boolean;
    secondSide: boolean;
    manual: boolean;
    unitBasePrice: number | null;
    lineTotal: number | null;
    formula: string;
    /** Выбранные опции с количеством и суммой. */
    options?: AppliedPricingOption[];
  }>;
  itemsSubtotal: number;
  minimumAdjustment: number;
  minimumApplied?: number;
  outOfTownFee: number;
  /** Фиксированные доплаты «за заказ», один раз на заказ. */
  orderOptions?: AppliedPricingOption[];
  orderOptionsTotal?: number;
  roundingAdjustment: number;
  total: number | null;
  hasManualItems: boolean;
  manualItemsCount: number;
  minOrder: number;
  rules?: { minOrder: number; roundingStep: number };
};

export type OrderEventPayload = Record<string, string | number | null>;

export type SettingsRecord = typeof tariffSettings.$inferSelect;
export type TariffRecord = typeof tariffItems.$inferSelect;
export type ServiceRecord = typeof services.$inferSelect;
export type CatalogServiceRecord = typeof catalogServices.$inferSelect;
export type PriceOptionRecord = typeof priceOptions.$inferSelect;
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

export const services = pgTable(
  "services",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    hint: text("hint").notNull().default(""),
    icon: text("icon").notNull().default("other"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("services_sort_idx").on(table.sortOrder)],
);

export const catalogServices = pgTable(
  "catalog_services",
  {
    id: text("id").primaryKey(),
    categoryId: text("category_id")
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    hint: text("hint").notNull().default(""),
    icon: text("icon").notNull().default("other"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("catalog_services_category_idx").on(table.categoryId, table.sortOrder),
    index("catalog_services_sort_idx").on(table.sortOrder),
  ],
);

export const priceOptions = pgTable(
  "price_options",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    kind: text("kind").$type<PricingOptionKind>().notNull(),
    value: integer("value").notNull(),
    scope: text("scope").$type<PricingOptionScope>().notNull().default("line"),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("price_options_sort_idx").on(table.sortOrder),
    check(
      "price_options_kind_check",
      sql`${table.kind} in ('percent', 'fixed', 'fixed_order')`,
    ),
    check(
      "price_options_scope_check",
      sql`${table.scope} in ('line', 'order')`,
    ),
  ],
);

export const tariffItems = pgTable(
  "tariff_items",
  {
    id: text("id").primaryKey(),
    category: text("category")
      .$type<PricingCategory>()
      .notNull()
      .references(() => services.id, { onDelete: "restrict" }),
    serviceId: text("service_id")
      .notNull()
      .references(() => catalogServices.id, { onDelete: "restrict" }),
    label: text("label").notNull(),
    variantLabel: text("variant_label").notNull(),
    unit: text("unit").notNull().default("шт"),
    parameterLabel: text("parameter_label").notNull().default("Количество"),
    basePrice: integer("base_price"),
    minValue: numeric("min_value", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(1),
    maxValue: numeric("max_value", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(99),
    step: numeric("step", { precision: 10, scale: 2, mode: "number" })
      .notNull()
      .default(1),
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
  (table) => [
    index("tariff_items_sort_idx").on(table.sortOrder),
    index("tariff_items_service_idx").on(table.serviceId, table.sortOrder),
    check(
      "tariff_items_value_range_check",
      sql`${table.minValue} <= ${table.maxValue} and ${table.step} > 0`,
    ),
  ],
);

export const tariffItemOptions = pgTable(
  "tariff_item_options",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => tariffItems.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => priceOptions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.optionId] }),
    index("tariff_item_options_option_idx").on(table.optionId),
  ],
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
    unit: text("unit"),
    parameterLabel: text("parameter_label"),
    quantity: numeric("quantity", { precision: 10, scale: 2, mode: "number" })
      .notNull(),
    heavySoiling: boolean("heavy_soiling").notNull().default(false),
    secondSide: boolean("second_side").notNull().default(false),
    unitBasePrice: integer("unit_base_price"),
    lineTotal: numeric("line_total", {
      precision: 12,
      scale: 2,
      mode: "number",
    }),
    formula: text("formula").notNull().default(""),
    options: jsonb("options").$type<AppliedPricingOption[]>(),
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
