import { cache } from "react";
import { asc, eq } from "drizzle-orm";

import { companyConfig } from "@/config/company";
import { getDb } from "@/lib/db";
import {
  company as companyTable,
  tariffItems,
  tariffSettings,
  type CompanySettings,
  type SettingsRecord,
  type TariffRecord,
} from "@/lib/db/schema";
import type { PricingRules } from "@/lib/calc/pricing";
import type { PublicTariff } from "@/lib/ui-types";

export type { SettingsRecord, TariffRecord };

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
    otherRequiresPhoto: row.otherRequiresPhoto,
  };
});

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

export function toPublicTariff(item: TariffRecord): PublicTariff {
  return {
    id: item.id,
    category: item.category,
    label: item.label,
    variantLabel: item.variantLabel,
    basePrice: item.basePrice,
    requiresPhoto: item.requiresPhoto,
    allowsSoiling: item.allowsSoiling,
    allowsSecondSide: item.allowsSecondSide,
    isManual: item.isManual,
  };
}
