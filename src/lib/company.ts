import { cache } from "react";
import { asc, eq } from "drizzle-orm";

import { companyConfig } from "@/config/company";
import { getDb } from "@/lib/db";
import {
  catalogServices,
  company as companyTable,
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
  type CatalogServiceRecord,
  type CompanySettings,
  type PriceOptionRecord,
  type ServiceRecord,
  type SettingsRecord,
  type TariffRecord,
} from "@/lib/db/schema";
import type { PricingRules } from "@/lib/calc/pricing";
import type {
  PublicCatalogService,
  PublicPriceOption,
  PublicRules,
  PublicService,
  PublicTariff,
} from "@/lib/ui-types";

export type {
  CatalogServiceRecord,
  SettingsRecord,
  ServiceRecord,
  PriceOptionRecord,
  TariffRecord,
};

export type PricingCatalog = {
  services: PublicService[];
  catalogServices: PublicCatalogService[];
  tariffs: PublicTariff[];
  options: PublicPriceOption[];
  rules: PublicRules;
};

export type PricingConfig = {
  services: ServiceRecord[];
  catalogServices: CatalogServiceRecord[];
  options: PriceOptionRecord[];
  items: TariffRecord[];
  links: (typeof tariffItemOptions.$inferSelect)[];
  settings: SettingsRecord;
};

export const getCompany = cache(async (): Promise<CompanySettings> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(companyTable)
    .where(eq(companyTable.id, 1))
    .limit(1);
  const row = rows[0];

  if (!row) {
    return { ...companyConfig };
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
    browserTitle: row.browserTitle,
    logoKey: row.logoKey,
    otherRequiresPhoto: row.otherRequiresPhoto,
  };
});

export const getServices = cache(async (): Promise<ServiceRecord[]> => {
  return getDb()
    .select()
    .from(services)
    .orderBy(asc(services.sortOrder), asc(services.id));
});

export const getPriceOptions = cache(async (): Promise<PriceOptionRecord[]> => {
  return getDb()
    .select()
    .from(priceOptions)
    .orderBy(asc(priceOptions.sortOrder), asc(priceOptions.id));
});

export const getCatalogServices = cache(
  async (): Promise<CatalogServiceRecord[]> => {
    return getDb()
      .select()
      .from(catalogServices)
      .orderBy(
        asc(catalogServices.sortOrder),
        asc(catalogServices.id),
      );
  },
);

export const getTariffItems = cache(async (): Promise<TariffRecord[]> => {
  const db = getDb();
  return db
    .select()
    .from(tariffItems)
    .orderBy(asc(tariffItems.sortOrder), asc(tariffItems.id));
});

export const getActiveTariffItems = cache(async (): Promise<TariffRecord[]> => {
  const items = await getTariffItems();
  return items.filter((item) => item.isActive);
});

export const getSettings = cache(async (): Promise<SettingsRecord> => {
  const db = getDb();
  const rows = await db
    .select()
    .from(tariffSettings)
    .where(eq(tariffSettings.id, 1))
    .limit(1);

  if (rows[0]) return rows[0];

  return {
    id: 1,
    minOrder: 2500,
    soilingPercent: 30,
    secondSidePercent: 50,
    outOfTownFee: 500,
    roundingStep: 10,
    maxPhotosPerItem: 3,
    maxPhotosPerOrder: 15,
    maxOrderFileBytes: 60_000_000,
    startingOrderNumber: 1001,
    updatedAt: new Date(),
  };
});

export function toPricingRules(settings: SettingsRecord): PricingRules {
  return {
    minOrder: settings.minOrder,
    soilingPercent: settings.soilingPercent,
    secondSidePercent: settings.secondSidePercent,
    outOfTownFee: settings.outOfTownFee,
    roundingStep: settings.roundingStep,
  };
}

/** Минимальная цена вариантов категории — для подписи «от». */
export function minPriceByCategory(
  items: TariffRecord[],
  category: TariffRecord["category"],
): number | null {
  const prices = items
    .filter((item) => item.category === category && item.basePrice !== null)
    .map((item) => item.basePrice as number);
  return prices.length ? Math.min(...prices) : null;
}

export function toPublicService(service: ServiceRecord): PublicService {
  return {
    id: service.id,
    label: service.label,
    hint: service.hint,
    icon: service.icon,
  };
}

export function toPublicPriceOption(
  option: PriceOptionRecord,
): PublicPriceOption {
  return {
    id: option.id,
    label: option.label,
    kind: option.kind,
    value: option.value,
    scope: option.scope,
    sortOrder: option.sortOrder,
  };
}

export function toPublicCatalogService(
  service: CatalogServiceRecord,
): PublicCatalogService {
  return {
    id: service.id,
    categoryId: service.categoryId,
    label: service.label,
    hint: service.hint,
    icon: service.icon,
  };
}

export function toPublicTariff(
  item: TariffRecord,
  options: PublicPriceOption[] = [],
  serviceLabel = item.label,
): PublicTariff {
  return {
    id: item.id,
    category: item.category,
    serviceId: item.serviceId,
    serviceLabel,
    label: item.label,
    variantLabel: item.variantLabel,
    unit: item.unit,
    parameterLabel: item.parameterLabel,
    basePrice: item.basePrice,
    minValue: item.minValue,
    maxValue: item.maxValue,
    step: item.step,
    requiresPhoto: item.requiresPhoto,
    allowsSoiling: item.allowsSoiling,
    allowsSecondSide: item.allowsSecondSide,
    isManual: item.isManual,
    options,
  };
}

/** Каталог для сайта: только активные услуги, варианты и опции. */
export const getPricingCatalog = cache(async (): Promise<PricingCatalog> => {
  const db = getDb();
  const [serviceRows, catalogServiceRows, itemRows, optionRows, links, settings] =
    await Promise.all([
      getDb()
        .select()
        .from(services)
        .orderBy(asc(services.sortOrder), asc(services.id)),
      getDb()
        .select()
        .from(catalogServices)
        .orderBy(
          asc(catalogServices.sortOrder),
          asc(catalogServices.id),
        ),
      getDb()
        .select()
        .from(tariffItems)
        .orderBy(asc(tariffItems.sortOrder), asc(tariffItems.id)),
      getDb()
        .select()
        .from(priceOptions)
        .orderBy(asc(priceOptions.sortOrder), asc(priceOptions.id)),
      db.select().from(tariffItemOptions),
      getSettings(),
    ]);

  const activeServices = serviceRows.filter((service) => service.isActive);
  const serviceIds = new Set(activeServices.map((service) => service.id));
  const activeCatalogServices = catalogServiceRows.filter(
    (service) => service.isActive && serviceIds.has(service.categoryId),
  );
  const catalogServiceIds = new Set(
    activeCatalogServices.map((service) => service.id),
  );
  const activeOptions = optionRows.filter((option) => option.isActive);
  const optionById = new Map(
    activeOptions.map((option) => [option.id, toPublicPriceOption(option)]),
  );

  const optionsByItem = new Map<string, PublicPriceOption[]>();
  for (const link of links) {
    const option = optionById.get(link.optionId);
    if (!option) continue;
    const list = optionsByItem.get(link.itemId) ?? [];
    list.push(option);
    optionsByItem.set(link.itemId, list);
  }

  return {
    services: activeServices.map(toPublicService),
    catalogServices: activeCatalogServices.map(toPublicCatalogService),
    tariffs: itemRows
      .filter(
        (item) =>
          item.isActive &&
          serviceIds.has(item.category) &&
          catalogServiceIds.has(item.serviceId),
      )
      .map((item) =>
        toPublicTariff(
          item,
          (optionsByItem.get(item.id) ?? []).sort(
            (a, b) => a.sortOrder - b.sortOrder,
          ),
          activeCatalogServices.find((service) => service.id === item.serviceId)
            ?.label ?? item.label,
        ),
      ),
    options: activeOptions.map(toPublicPriceOption),
    rules: toPricingRules(settings),
  };
});

/** Полная конфигурация для кабинета: включая архивные строки. */
export const getPricingConfig = cache(async (): Promise<PricingConfig> => {
  const db = getDb();
  const [serviceRows, catalogServiceRows, optionRows, items, links, settings] =
    await Promise.all([
      getServices(),
      getCatalogServices(),
      getPriceOptions(),
      getTariffItems(),
      db.select().from(tariffItemOptions),
      getSettings(),
    ]);

  return {
    services: serviceRows,
    catalogServices: catalogServiceRows,
    options: optionRows,
    items,
    links,
    settings,
  };
});
