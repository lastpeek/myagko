import { randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { CONSENT_VERSION } from "@/lib/consent";
import {
  calculateOrder,
  type AppliedPricingOption,
  type PricingOption,
  type PricingOptionSelection,
} from "@/lib/calc/pricing";
import type { Database } from "@/lib/db";
import {
  catalogServices,
  company as companyTable,
  idempotencyKeys,
  orderEvents,
  orderItems,
  orderPhotos,
  orders,
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
  type CatalogServiceRecord,
  type OrderBreakdown,
  type OrderStatus,
  type PriceOptionRecord,
  type PriceSnapshot,
  type SettingsRecord,
  type TariffItemSnapshot,
} from "@/lib/db/schema";
import { normalizePhone } from "@/lib/phone";
import { getStorage, type PhotoStorage } from "@/lib/storage";
import type { CreateOrderPayload } from "@/lib/validation";
import type { NormalizedPhoto } from "@/lib/image";
import type { CompanySettings } from "@/lib/db/schema";

export class OrderValidationError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "OrderValidationError";
    this.field = field;
  }
}

export type IncomingPhoto = {
  itemIndex: number;
  photo: NormalizedPhoto;
};

export type CreateOrderOutcome = {
  id: string;
  token: string;
  publicNumber: number;
  created: boolean;
};

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function newToken(): string {
  return randomBytes(18).toString("base64url");
}

function snapshotOf(
  tariffs: TariffItemSnapshot[],
  settings: SettingsRecord,
  otherRequiresPhoto: boolean,
  options: PricingOption[],
  catalogServiceRows: CatalogServiceRecord[],
): PriceSnapshot {
  return {
    capturedAt: new Date().toISOString(),
    rules: {
      minOrder: settings.minOrder,
      soilingPercent: settings.soilingPercent,
      secondSidePercent: settings.secondSidePercent,
      outOfTownFee: settings.outOfTownFee,
      roundingStep: settings.roundingStep,
    },
    tariff: tariffs,
    otherRequiresPhoto,
    options,
    catalogServices: catalogServiceRows.map((service) => ({
      id: service.id,
      categoryId: service.categoryId,
      label: service.label,
      hint: service.hint,
      icon: service.icon,
    })),
  };
}

type ItemOptions = {
  /** Доступные опции по id варианта. */
  byItem: Map<string, PricingOption[]>;
  /** Каталог активных опций для снимка. */
  catalog: PricingOption[];
  /** Глобальные fixed_order-опции заказа. */
  orderOptions: PricingOption[];
};

async function loadItemOptions(
  db: Database,
  itemIds: string[],
): Promise<ItemOptions> {
  if (itemIds.length === 0) {
    return { byItem: new Map(), catalog: [], orderOptions: [] };
  }

  const [links, rows] = await Promise.all([
    db
      .select({
        itemId: tariffItemOptions.itemId,
        optionId: tariffItemOptions.optionId,
      })
      .from(tariffItemOptions)
      .where(inArray(tariffItemOptions.itemId, itemIds)),
    db
      .select()
      .from(priceOptions)
      .orderBy(asc(priceOptions.sortOrder), asc(priceOptions.id)),
  ]);

  // Наличие хотя бы одной строки в каталоге означает, что база уже перешла
  // на опции. Тогда отсутствие связи — это «у варианта нет опций», а не
  // повод применить старые флаги.
  const hasCatalog = rows.length > 0;
  const activeRows = rows.filter((row) => row.isActive);
  const linkSet = new Set(
    links.map((link) => `${link.itemId}\u0000${link.optionId}`),
  );

  const byItem = new Map<string, PricingOption[]>();
  if (hasCatalog) {
    for (const itemId of itemIds) {
      byItem.set(
        itemId,
        activeRows
          .filter((option) => linkSet.has(`${itemId}\u0000${option.id}`))
          .map(toPricingOption),
      );
    }
  }

  const catalog = activeRows.map(toPricingOption);
  return {
    byItem,
    catalog,
    orderOptions: catalog.filter(
      (option) => option.scope === "order" && option.kind === "fixed_order",
    ),
  };
}

function toPricingOption(option: PriceOptionRecord): PricingOption {
  return {
    id: option.id,
    label: option.label,
    kind: option.kind,
    value: option.value,
    scope: option.scope,
  };
}

function validateParameterValue(
  tariff: typeof tariffItems.$inferSelect,
  value: number,
  index: number,
): number {
  if (!Number.isFinite(value)) {
    throw new OrderValidationError(
      `items.${index}.parameterValue`,
      "Проверьте значение параметра",
    );
  }

  const scaled = value * 100;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-9) {
    throw new OrderValidationError(
      `items.${index}.parameterValue`,
      "Не больше двух знаков после запятой",
    );
  }

  const valueHundredths = Math.round(scaled);
  const minHundredths = Math.round(tariff.minValue * 100);
  const maxHundredths = Math.round(tariff.maxValue * 100);
  const stepHundredths = Math.round(tariff.step * 100);

  if (
    valueHundredths < minHundredths ||
    valueHundredths > maxHundredths ||
    stepHundredths <= 0 ||
    (valueHundredths - minHundredths) % stepHundredths !== 0
  ) {
    throw new OrderValidationError(
      `items.${index}.parameterValue`,
      `Значение должно быть от ${tariff.minValue} до ${tariff.maxValue} с шагом ${tariff.step}`,
    );
  }

  return value;
}

function normalizeOptionQuantity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(value)));
}

function selectedOptionsOf(item: {
  optionIds?: string[];
  optionSelections?: Array<{ id: string; quantity?: number }>;
}): Array<{ id: string; quantity: number }> {
  const selected = new Map<string, number>();
  for (const optionId of item.optionIds ?? []) selected.set(optionId, 1);
  for (const selection of item.optionSelections ?? []) {
    selected.set(selection.id, normalizeOptionQuantity(selection.quantity));
  }
  return Array.from(selected, ([id, quantity]) => ({ id, quantity }));
}

export async function findOrderByToken(
  db: Database,
  token: string,
): Promise<{ id: string; token: string; publicNumber: number } | null> {
  if (!token || token.length < 8) return null;
  const rows = await db
    .select({
      id: orders.id,
      token: orders.token,
      publicNumber: orders.publicNumber,
    })
    .from(orders)
    .where(eq(orders.token, token))
    .limit(1);
  return rows[0] ?? null;
}

export async function findOrderByIdempotencyKey(
  db: Database,
  key: string,
): Promise<CreateOrderOutcome | null> {
  const rows = await db
    .select({
      id: orders.id,
      token: orders.token,
      publicNumber: orders.publicNumber,
      createdAt: idempotencyKeys.createdAt,
    })
    .from(idempotencyKeys)
    .innerJoin(orders, eq(orders.id, idempotencyKeys.orderId))
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (Date.now() - row.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
    return null;
  }

  return {
    id: row.id,
    token: row.token,
    publicNumber: row.publicNumber,
    created: false,
  };
}

export async function createOrder(
  db: Database,
  payload: CreateOrderPayload,
  incomingPhotos: IncomingPhoto[],
  overrides: {
    storage?: PhotoStorage;
    company?: CompanySettings;
    settings?: SettingsRecord;
    tariffs?: (typeof tariffItems.$inferSelect)[];
  } = {},
): Promise<CreateOrderOutcome> {
  const existing = await findOrderByIdempotencyKey(db, payload.idempotencyKey);
  if (existing) return existing;

  const company =
    overrides.company ??
    (await loadCompanyOrDefaults(db));
  const settings = overrides.settings ?? (await loadSettings(db));
  const [allTariffs, activeCatalogServices] = await Promise.all([
    overrides.tariffs ?? loadActiveTariffs(db),
    loadActiveCatalogServices(db),
  ]);
  const tariffs = allTariffs.filter((tariff) => {
    const service = activeCatalogServices.get(tariff.serviceId);
    return Boolean(service && service.categoryId === tariff.category);
  });
  const itemOptions = await loadItemOptions(
    db,
    tariffs.map((tariff) => tariff.id),
  );

  const phone = normalizePhone(payload.customer.phone);
  if (!phone) {
    throw new OrderValidationError("phone", "Проверьте номер телефона");
  }

  if (payload.items.length > 20) {
    throw new OrderValidationError("items", "Слишком много позиций");
  }

  const manualCount = payload.items.filter((item) => {
    const tariff = tariffs.find((t) => t.id === item.tariffId);
    return tariff?.isManual;
  }).length;

  if (manualCount > 5) {
    throw new OrderValidationError("items", "Не больше 5 позиций «Другое»");
  }

  const photosByItem = new Map<number, IncomingPhoto[]>();
  for (const incoming of incomingPhotos) {
    if (incoming.itemIndex < 0 || incoming.itemIndex >= payload.items.length) {
      throw new OrderValidationError("photos", "Фото привязано к несуществующей позиции");
    }
    const list = photosByItem.get(incoming.itemIndex) ?? [];
    list.push(incoming);
    photosByItem.set(incoming.itemIndex, list);
  }

  const totalPhotos = incomingPhotos.length;
  if (totalPhotos > settings.maxPhotosPerOrder) {
    throw new OrderValidationError(
      "photos",
      `Не больше ${settings.maxPhotosPerOrder} фото на заказ`,
    );
  }

  const totalBytes = incomingPhotos.reduce((sum, p) => sum + p.photo.bytes, 0);
  if (totalBytes > settings.maxOrderFileBytes) {
    throw new OrderValidationError("photos", "Заказ с фото слишком большой");
  }

  const resolved = payload.items.map((item, index) => {
    const tariff = tariffs.find((t) => t.id === item.tariffId);
    if (!tariff) {
      throw new OrderValidationError(
        `items.${index}.tariffId`,
        "Такой позиции нет в прайсе. Обновите страницу.",
      );
    }

    const availableOptions = itemOptions.byItem
      .get(tariff.id)
      ?.filter((option) => option.scope !== "order");
    const selectedOptions = selectedOptionsOf(item);

    if (tariff.isManual && selectedOptions.length > 0) {
      throw new OrderValidationError(
        `items.${index}.optionIds`,
        "Для позиции «По фото» опции не применяются",
      );
    }

    if (availableOptions !== undefined) {
      const availableIds = new Set(
        availableOptions.map((option) => option.id),
      );
      for (const option of selectedOptions) {
        if (!availableIds.has(option.id)) {
          throw new OrderValidationError(
            `items.${index}.optionIds`,
            "Эта опция недоступна для выбранного варианта. Обновите страницу.",
          );
        }
      }
    }

    const rawParameterValue = item.parameterValue ?? item.quantity ?? 1;
    const parameterValue = validateParameterValue(
      tariff,
      rawParameterValue,
      index,
    );
    const service = activeCatalogServices.get(tariff.serviceId);
    if (!service) {
      throw new OrderValidationError(
        `items.${index}.tariffId`,
        "Услуга выключена. Обновите страницу.",
      );
    }

    const photos = photosByItem.get(index) ?? [];
    if (photos.length > settings.maxPhotosPerItem) {
      throw new OrderValidationError(
        `photos.${index}`,
        `К позиции можно приложить не больше ${settings.maxPhotosPerItem} фото`,
      );
    }

    if (tariff.isManual) {
      const description = item.manualDescription?.trim() ?? "";
      if (description.length < 10) {
        throw new OrderValidationError(
          `items.${index}.manualDescription`,
          "Опишите предмет — минимум 10 символов",
        );
      }
      if (
        (tariff.requiresPhoto || company.otherRequiresPhoto) &&
        photos.length === 0
      ) {
        throw new OrderValidationError(
          `photos.${index}`,
          "Для этой позиции нужно хотя бы одно фото",
        );
      }
    }

    // Новые опции проверяются по привязке к варианту. Легаси-флаги — только
    // для старых клиентов и баз, где опции ещё не заведены.
    if (availableOptions === undefined) {
      if (item.heavySoiling && !tariff.allowsSoiling) {
        throw new OrderValidationError(
          `items.${index}.heavySoiling`,
          "Для этой позиции доплата за загрязнения не применяется",
        );
      }

      if (item.secondSide && !tariff.allowsSecondSide) {
        throw new OrderValidationError(
          `items.${index}.secondSide`,
          "У этого варианта нет второй стороны",
        );
      }
    }

    return {
      tariff,
      service,
      index,
      parameterValue,
      heavySoiling: tariff.allowsSoiling && item.heavySoiling,
      secondSide: tariff.allowsSecondSide && item.secondSide,
      options: availableOptions,
      optionSelections: selectedOptions satisfies PricingOptionSelection[],
      manualDescription: tariff.isManual
        ? (item.manualDescription?.trim() ?? "")
        : null,
      photos,
    };
  });

  const selectedOrderOptionIds = Array.from(
    new Set(payload.orderOptionIds ?? []),
  );
  const availableOrderOptionIds = new Set(
    itemOptions.orderOptions.map((option) => option.id),
  );
  for (const optionId of selectedOrderOptionIds) {
    if (!availableOrderOptionIds.has(optionId)) {
      throw new OrderValidationError(
        "orderOptionIds",
        "Эта опция заказа недоступна. Обновите страницу.",
      );
    }
  }

  const calculation = calculateOrder({
    items: resolved.map((item) => ({
      key: `${item.tariff.id}#${item.index}`,
      category: item.tariff.category,
      serviceId: item.tariff.serviceId,
      serviceLabel: item.service.label,
      variantId: item.tariff.id,
      variantLabel: item.tariff.variantLabel,
      unit: item.tariff.unit,
      parameterLabel: item.tariff.parameterLabel,
      parameterValue: item.parameterValue,
      pricePerUnit: item.tariff.basePrice ?? 0,
      heavySoiling: item.heavySoiling,
      secondSide: item.secondSide,
      manual: item.tariff.isManual,
      allowsSoiling: item.tariff.allowsSoiling,
      allowsSecondSide: item.tariff.allowsSecondSide,
      ...(item.options !== undefined
        ? {
            options: item.options,
            optionSelections: item.optionSelections,
          }
        : {}),
    })),
    rules: {
      minOrder: settings.minOrder,
      soilingPercent: settings.soilingPercent,
      secondSidePercent: settings.secondSidePercent,
      outOfTownFee: settings.outOfTownFee,
      roundingStep: settings.roundingStep,
    },
    outOfTown: payload.customer.outOfTown,
    orderOptions: itemOptions.orderOptions,
    orderOptionIds: selectedOrderOptionIds,
  });

  const breakdown: OrderBreakdown = {
    lines: resolved.map((item, index) => {
      const priced = calculation.lines[index]!;
      return {
        key: `${item.tariff.id}#${item.index}`,
        serviceId: item.tariff.serviceId,
        serviceLabel: item.service.label,
        variantId: item.tariff.id,
        label: item.tariff.label,
        variantLabel: item.tariff.variantLabel,
        unit: item.tariff.unit,
        parameterLabel: item.tariff.parameterLabel,
        parameterValue: priced.parameterValue,
        quantity: priced.parameterValue,
        pricePerUnit: priced.manual ? null : priced.pricePerUnit,
        baseTotal: priced.baseTotal,
        heavySoiling: priced.heavySoiling,
        secondSide: priced.secondSide,
        manual: priced.manual,
        unitBasePrice: priced.unitBasePrice,
        lineTotal: priced.lineTotal,
        formula:
          calculation.formulas[`${item.tariff.id}#${item.index}`] ??
          (priced.manual ? "По фото" : ""),
        options: priced.options,
      };
    }),
    itemsSubtotal: calculation.itemsSubtotal,
    minimumAdjustment: calculation.minimumAdjustment,
    minimumApplied: calculation.minimumApplied,
    outOfTownFee: calculation.outOfTownFee,
    orderOptions: calculation.orderOptions,
    orderOptionsTotal: calculation.orderOptionsTotal,
    roundingAdjustment: calculation.roundingAdjustment,
    total: calculation.total,
    hasManualItems: calculation.hasManualItems,
    manualItemsCount: calculation.manualItemsCount,
    minOrder: settings.minOrder,
    rules: {
      minOrder: settings.minOrder,
      roundingStep: settings.roundingStep,
    },
  };

  const snapshot = snapshotOf(
    tariffs.map((tariff) => {
      const service = activeCatalogServices.get(tariff.serviceId);
      return {
        key: tariff.id,
        category: tariff.category,
        serviceId: tariff.serviceId,
        serviceLabel: service?.label ?? tariff.label,
        label: tariff.label,
        variantLabel: tariff.variantLabel,
        unit: tariff.unit,
        parameterLabel: tariff.parameterLabel,
        basePrice: tariff.basePrice,
        pricePerUnit: tariff.basePrice,
        minValue: tariff.minValue,
        maxValue: tariff.maxValue,
        step: tariff.step,
        requiresPhoto: tariff.requiresPhoto,
        allowsSoiling: tariff.allowsSoiling,
        allowsSecondSide: tariff.allowsSecondSide,
        isManual: tariff.isManual,
        options: itemOptions.byItem.get(tariff.id),
      };
    }),
    settings,
    company.otherRequiresPhoto,
    itemOptions.catalog,
    Array.from(activeCatalogServices.values()),
  );

  const storage = overrides.storage ?? getStorage();
  const storedKeys: string[] = [];

  type PhotoRow = {
    itemIndex: number;
    storageKey: string;
    mime: string;
    bytes: number;
    width: number;
    height: number;
    sortOrder: number;
  };

  try {
    const photoRows: PhotoRow[] = [];
    for (const item of resolved) {
      let sortOrder = 0;
      for (const incoming of item.photos) {
        const key = `${randomUUID()}.webp`;
        await storage.put(key, incoming.photo.data, incoming.photo.mime);
        storedKeys.push(key);
        photoRows.push({
          itemIndex: item.index,
          storageKey: key,
          mime: incoming.photo.mime,
          bytes: incoming.photo.bytes,
          width: incoming.photo.width,
          height: incoming.photo.height,
          sortOrder: sortOrder++,
        });
      }
    }

    const desiredDate = payload.customer.desiredDate?.trim() || null;
    const desiredFrom = payload.customer.desiredTimeFrom?.trim() || null;
    const desiredTo = payload.customer.desiredTimeTo?.trim() || null;
    const comment = payload.customer.comment?.trim() ?? "";

    const outcome = await db.transaction(async (tx) => {
      await tx
        .delete(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.key, payload.idempotencyKey),
            sql`${idempotencyKeys.createdAt} < now() - interval '24 hours'`,
          ),
        );

      const raced = await tx
        .select({
          id: orders.id,
          token: orders.token,
          publicNumber: orders.publicNumber,
        })
        .from(idempotencyKeys)
        .innerJoin(orders, eq(orders.id, idempotencyKeys.orderId))
        .where(eq(idempotencyKeys.key, payload.idempotencyKey))
        .limit(1);

      if (raced[0]) {
        return { ...raced[0], created: false };
      }

      // Блокируем строку настроек, чтобы номера заявок не пересекались.
      await tx.execute(
        sql`select id from tariff_settings where id = 1 for update`,
      );

      const maxRows = await tx
        .select({
          max: sql<number>`coalesce(max(${orders.publicNumber}), 0)`,
        })
        .from(orders);
      const publicNumber = Math.max(
        Number(maxRows[0]?.max ?? 0) + 1,
        settings.startingOrderNumber,
      );

      const token = newToken();

      const inserted = await tx
        .insert(orders)
        .values({
          publicNumber,
          token,
          status: "new",
          name: payload.customer.name.trim(),
          phone,
          address: payload.customer.address.trim(),
          outOfTown: payload.customer.outOfTown,
          desiredDate,
          desiredTimeFrom: desiredFrom,
          desiredTimeTo: desiredTo,
          comment,
          consentAt: new Date(),
          consentVersion: CONSENT_VERSION,
          estimatedTotal: calculation.total,
          priceSnapshot: snapshot,
          breakdown,
        })
        .returning({
          id: orders.id,
          token: orders.token,
          publicNumber: orders.publicNumber,
        });

      const order = inserted[0]!;

      const itemRows = await tx
        .insert(orderItems)
        .values(
          resolved.map((item, index) => ({
            orderId: order.id,
            tariffItemId: item.tariff.id,
            category: item.tariff.category,
            label: item.tariff.label,
            variantLabel: item.tariff.variantLabel,
            unit: item.tariff.unit,
            parameterLabel: item.tariff.parameterLabel,
            manualDescription: item.manualDescription,
            quantity: calculation.lines[index]!.parameterValue,
            heavySoiling: calculation.lines[index]!.heavySoiling,
            secondSide: calculation.lines[index]!.secondSide,
            unitBasePrice: calculation.lines[index]!.unitBasePrice,
            lineTotal: calculation.lines[index]!.lineTotal,
            formula: breakdown.lines[index]!.formula,
            options: calculation.lines[index]!.options,
            sortOrder: index,
          })),
        )
        .returning({ id: orderItems.id, sortOrder: orderItems.sortOrder });

      const idByIndex = new Map<number, string>();
      for (const row of itemRows) {
        idByIndex.set(row.sortOrder, row.id);
      }

      if (photoRows.length > 0) {
        await tx.insert(orderPhotos).values(
          photoRows.map((photo) => ({
            orderId: order.id,
            orderItemId: idByIndex.get(photo.itemIndex)!,
            storageKey: photo.storageKey,
            mime: photo.mime,
            bytes: photo.bytes,
            width: photo.width,
            height: photo.height,
            sortOrder: photo.sortOrder,
          })),
        );
      }

      await tx.insert(orderEvents).values({
        orderId: order.id,
        type: "created",
        actor: "client",
        payload: { total: calculation.total ?? 0, items: resolved.length },
      });

      await tx.insert(idempotencyKeys).values({
        key: payload.idempotencyKey,
        orderId: order.id,
      });

      return { ...order, created: true };
    });

    if (!outcome.created) {
      await Promise.all(storedKeys.map((key) => storage.delete(key)));
    }

    return outcome;
  } catch (error) {
    await Promise.all(
      storedKeys.map((key) => storage.delete(key).catch(() => undefined)),
    );

    // Гонка двух одинаковых отправок: второй запрос возвращает первую заявку.
    const message = error instanceof Error ? error.message : "";
    if (message.includes("duplicate key") || message.includes("unique")) {
      const again = await findOrderByIdempotencyKey(db, payload.idempotencyKey);
      if (again) return again;
    }

    throw error;
  }
}

async function loadCompanyOrDefaults(db: Database): Promise<CompanySettings> {
  const rows = await db
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Компания не настроена: выполните npm run db:seed");
  }
  return {
    name: row.name,
    city: row.city,
    phone: row.phone,
    email: row.email,
    territory: row.territory,
    accentColor: row.accentColor,
    heroTitle: row.heroTitle,
    heroSubtitle: row.heroSubtitle,
    otherRequiresPhoto: row.otherRequiresPhoto,
  };
}

async function loadSettings(db: Database): Promise<SettingsRecord> {
  const rows = await db
    .select()
    .from(tariffSettings)
    .where(eq(tariffSettings.id, 1))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new Error("Тарифы не настроены: выполните npm run db:seed");
  }
  return row;
}

async function loadActiveTariffs(
  db: Database,
): Promise<(typeof tariffItems.$inferSelect)[]> {
  return db
    .select()
    .from(tariffItems)
    .where(eq(tariffItems.isActive, true))
    .orderBy(asc(tariffItems.sortOrder));
}

async function loadActiveCatalogServices(
  db: Database,
): Promise<Map<string, CatalogServiceRecord>> {
  const [categoryRows, serviceRows] = await Promise.all([
    db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.isActive, true)),
    db
      .select()
      .from(catalogServices)
      .where(eq(catalogServices.isActive, true)),
  ]);
  const categoryIds = new Set(categoryRows.map((row) => row.id));
  return new Map(
    serviceRows
      .filter((service) => categoryIds.has(service.categoryId))
      .map((service) => [service.id, service]),
  );
}

export type PublicOrderPhoto = {
  id: string;
  width: number;
  height: number;
};

export type PublicOrderItem = {
  id: string;
  serviceId?: string;
  serviceLabel?: string;
  variantId?: string;
  category: string;
  label: string;
  variantLabel: string;
  unit?: string;
  parameterLabel?: string;
  parameterValue?: number;
  pricePerUnit?: number | null;
  baseTotal?: number | null;
  manualDescription: string | null;
  quantity: number;
  heavySoiling: boolean;
  secondSide: boolean;
  manual: boolean;
  unitBasePrice: number | null;
  lineTotal: number | null;
  formula: string;
  options: AppliedPricingOption[];
  photos: PublicOrderPhoto[];
};

export type PublicOrder = {
  token: string;
  number: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  desired: { date: string | null; from: string | null; to: string | null };
  agreed: { date: string | null; from: string | null; to: string | null };
  outOfTown: boolean;
  comment: string;
  items: PublicOrderItem[];
  totals: {
    itemsSubtotal: number;
    minimumAdjustment: number;
    minimumApplied: number;
    outOfTownFee: number;
    orderOptionsTotal: number;
    roundingAdjustment: number;
    total: number | null;
    minOrder: number;
    hasManualItems: boolean;
    manualItemsCount: number;
    rules: { minOrder: number; roundingStep: number };
  };
  finalPrice: number | null;
  estimatedTotal: number | null;
};

/** Публичное представление: без заметки владельца, истории и служебных полей. */
export async function getPublicOrder(
  db: Database,
  token: string,
): Promise<PublicOrder | null> {
  if (!token || token.length < 8) return null;

  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.token, token))
    .limit(1);
  const order = rows[0];
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.sortOrder));

  const photos = await db
    .select({
      id: orderPhotos.id,
      orderItemId: orderPhotos.orderItemId,
      width: orderPhotos.width,
      height: orderPhotos.height,
      sortOrder: orderPhotos.sortOrder,
    })
    .from(orderPhotos)
    .where(eq(orderPhotos.orderId, order.id))
    .orderBy(asc(orderPhotos.sortOrder));

  const photosByItem = new Map<string, PublicOrderPhoto[]>();
  for (const photo of photos) {
    const list = photosByItem.get(photo.orderItemId) ?? [];
    list.push({ id: photo.id, width: photo.width, height: photo.height });
    photosByItem.set(photo.orderItemId, list);
  }

  return {
    token: order.token,
    number: order.publicNumber,
    status: order.status,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    desired: {
      date: order.desiredDate,
      from: order.desiredTimeFrom,
      to: order.desiredTimeTo,
    },
    agreed: {
      date: order.agreedDate,
      from: order.agreedTimeFrom,
      to: order.agreedTimeTo,
    },
    outOfTown: order.outOfTown,
    comment: order.comment,
    items: items.map((item, index) => {
      const line = order.breakdown.lines[index];
      return {
        id: item.id,
        serviceId: line?.serviceId,
        serviceLabel: line?.serviceLabel,
        variantId: line?.variantId,
        category: item.category,
        label: item.label,
        variantLabel: item.variantLabel,
        unit: item.unit ?? line?.unit,
        parameterLabel: item.parameterLabel ?? line?.parameterLabel,
        parameterValue: line?.parameterValue ?? item.quantity,
        pricePerUnit: line?.pricePerUnit,
        baseTotal: line?.baseTotal,
        manualDescription: item.manualDescription,
        quantity: item.quantity,
        heavySoiling: item.heavySoiling,
        secondSide: item.secondSide,
        manual: item.unitBasePrice === null,
        unitBasePrice: item.unitBasePrice,
        lineTotal: item.lineTotal,
        formula: item.formula,
        options: item.options ?? [],
        photos: photosByItem.get(item.id) ?? [],
      };
    }),
    totals: {
      itemsSubtotal: order.breakdown.itemsSubtotal,
      minimumAdjustment: order.breakdown.minimumAdjustment,
      minimumApplied:
        order.breakdown.minimumApplied ??
        order.breakdown.minimumAdjustment,
      outOfTownFee: order.breakdown.outOfTownFee,
      orderOptionsTotal: order.breakdown.orderOptionsTotal ?? 0,
      roundingAdjustment: order.breakdown.roundingAdjustment,
      total: order.breakdown.total,
      minOrder: order.breakdown.minOrder,
      hasManualItems: order.breakdown.hasManualItems,
      manualItemsCount: order.breakdown.manualItemsCount,
      rules: order.breakdown.rules ?? {
        minOrder: order.breakdown.minOrder,
        roundingStep: order.priceSnapshot.rules.roundingStep,
      },
    },
    finalPrice: order.finalPrice,
    estimatedTotal: order.estimatedTotal,
  };
}

/** Фото отдаём только по токену своей заявки или владельцу. */
export async function findPhotoForOrderToken(
  db: Database,
  photoId: string,
  token: string,
): Promise<{ storageKey: string; mime: string } | null> {
  const rows = await db
    .select({ storageKey: orderPhotos.storageKey, mime: orderPhotos.mime })
    .from(orderPhotos)
    .innerJoin(orders, eq(orders.id, orderPhotos.orderId))
    .where(and(eq(orderPhotos.id, photoId), eq(orders.token, token)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findPhotoById(
  db: Database,
  photoId: string,
): Promise<{ storageKey: string; mime: string } | null> {
  const rows = await db
    .select({ storageKey: orderPhotos.storageKey, mime: orderPhotos.mime })
    .from(orderPhotos)
    .where(eq(orderPhotos.id, photoId))
    .limit(1);
  return rows[0] ?? null;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
