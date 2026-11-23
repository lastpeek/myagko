import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";

import { companyConfig } from "@/config/company";
import type { Database } from "@/lib/db";
import {
  adminUsers,
  company,
  priceOptions,
  services,
  tariffItemOptions,
  tariffItems,
  tariffSettings,
} from "@/lib/db/schema";

// isolatedModules не даёт читать const enum из d.ts — значение Argon2id = 2.
const ARGON2ID = 2;

export const DEFAULT_SERVICES = [
  {
    id: "sofa",
    label: "Диваны",
    hint: "2, 3 места, угловой",
    icon: "sofa",
    sortOrder: 10,
  },
  {
    id: "armchair",
    label: "Кресла",
    hint: "Обычное или с откидной спинкой",
    icon: "armchair",
    sortOrder: 20,
  },
  {
    id: "mattress",
    label: "Матрасы",
    hint: "С одной или двумя сторонами",
    icon: "mattress",
    sortOrder: 30,
  },
  {
    id: "chair",
    label: "Стулья",
    hint: "Только сиденье или весь стул",
    icon: "chair",
    sortOrder: 40,
  },
  {
    id: "other",
    label: "Другое",
    hint: "Опишите и приложите фото",
    icon: "other",
    sortOrder: 50,
  },
];

export const DEFAULT_PRICE_OPTIONS = [
  {
    id: "soiling",
    label: "Сильные загрязнения",
    kind: "percent" as const,
    value: 30,
    sortOrder: 10,
  },
  {
    id: "second-side",
    label: "Вторая сторона",
    kind: "percent" as const,
    value: 50,
    sortOrder: 20,
  },
];

export const DEFAULT_TARIFFS = [
  {
    id: "sofa-2",
    category: "sofa" as const,
    label: "Диван",
    variantLabel: "2 места",
    basePrice: 2500,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 10,
  },
  {
    id: "sofa-3",
    category: "sofa" as const,
    label: "Диван",
    variantLabel: "3 места",
    basePrice: 3200,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 20,
  },
  {
    id: "sofa-corner",
    category: "sofa" as const,
    label: "Диван",
    variantLabel: "Угловой",
    basePrice: 4200,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 30,
  },
  {
    id: "armchair-standard",
    category: "armchair" as const,
    label: "Кресло",
    variantLabel: "Обычное",
    basePrice: 1200,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 40,
  },
  {
    id: "armchair-recliner",
    category: "armchair" as const,
    label: "Кресло",
    variantLabel: "Реклайнер",
    basePrice: 1800,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 50,
  },
  {
    id: "mattress-single",
    category: "mattress" as const,
    label: "Матрас",
    variantLabel: "Односпальный",
    basePrice: 1500,
    allowsSoiling: true,
    allowsSecondSide: true,
    sortOrder: 60,
  },
  {
    id: "mattress-double",
    category: "mattress" as const,
    label: "Матрас",
    variantLabel: "Двуспальный",
    basePrice: 2400,
    allowsSoiling: true,
    allowsSecondSide: true,
    sortOrder: 70,
  },
  {
    id: "chair-seat",
    category: "chair" as const,
    label: "Стул",
    variantLabel: "Только сиденье",
    basePrice: 500,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 80,
  },
  {
    id: "chair-back",
    category: "chair" as const,
    label: "Стул",
    variantLabel: "Сиденье и спинка",
    basePrice: 700,
    allowsSoiling: true,
    allowsSecondSide: false,
    sortOrder: 90,
  },
  {
    id: "other",
    category: "other" as const,
    label: "Другое",
    variantLabel: "По фото",
    basePrice: null,
    allowsSoiling: false,
    allowsSecondSide: false,
    requiresPhoto: true,
    isManual: true,
    sortOrder: 100,
  },
];

/**
 * Идемпотентный сид: компания, тарифы, настройки, первый владелец.
 * Повторный запуск не перезаписывает изменённые в кабинете значения.
 */
export async function seedDatabase(
  db: Database,
  options: { requireAdmin?: boolean } = {},
): Promise<{ adminCreated: boolean; adminMissing: boolean }> {
  await db
    .insert(company)
    .values({
      id: 1,
      name: companyConfig.name,
      city: companyConfig.city,
      phone: companyConfig.phone,
      email: companyConfig.email,
      territory: companyConfig.territory,
      accentColor: companyConfig.accentColor,
      heroTitle: companyConfig.heroTitle,
      heroSubtitle: companyConfig.heroSubtitle,
      otherRequiresPhoto: companyConfig.otherRequiresPhoto,
    })
    .onConflictDoNothing();

  await db
    .insert(tariffSettings)
    .values({
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
    })
    .onConflictDoNothing();

  for (const service of DEFAULT_SERVICES) {
    await db
      .insert(services)
      .values({
        id: service.id,
        label: service.label,
        hint: service.hint,
        icon: service.icon,
        sortOrder: service.sortOrder,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  for (const option of DEFAULT_PRICE_OPTIONS) {
    await db
      .insert(priceOptions)
      .values({
        id: option.id,
        label: option.label,
        kind: option.kind,
        value: option.value,
        sortOrder: option.sortOrder,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  for (const item of DEFAULT_TARIFFS) {
    await db
      .insert(tariffItems)
      .values({
        id: item.id,
        category: item.category,
        label: item.label,
        variantLabel: item.variantLabel,
        basePrice: item.basePrice,
        requiresPhoto: item.requiresPhoto ?? false,
        allowsSoiling: item.allowsSoiling,
        allowsSecondSide: item.allowsSecondSide,
        isManual: item.isManual ?? false,
        sortOrder: item.sortOrder,
        isActive: true,
      })
      .onConflictDoNothing();
  }

  const defaultLinks = DEFAULT_TARIFFS.flatMap((item) => {
    const links: { itemId: string; optionId: string }[] = [];
    if (item.allowsSoiling) {
      links.push({ itemId: item.id, optionId: "soiling" });
    }
    if (item.allowsSecondSide) {
      links.push({ itemId: item.id, optionId: "second-side" });
    }
    return links;
  });

  if (defaultLinks.length > 0) {
    await db.insert(tariffItemOptions).values(defaultLinks).onConflictDoNothing();
  }

  // Подписи вариантов могли измениться в шаблоне. Обновляем только текст:
  // цены, видимость и флаги существующих строк не трогаем.
  for (const item of DEFAULT_TARIFFS) {
    await db
      .update(tariffItems)
      .set({ variantLabel: item.variantLabel })
      .where(eq(tariffItems.id, item.id));
  }

  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  const existingAdmin = email
    ? await db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, email))
        .limit(1)
    : [];

  if (existingAdmin.length > 0) {
    return { adminCreated: false, adminMissing: false };
  }

  if (!email || !password) {
    if (options.requireAdmin) {
      throw new Error(
        "Для сида задайте ADMIN_EMAIL и ADMIN_PASSWORD в .env (см. .env.example).",
      );
    }
    return { adminCreated: false, adminMissing: true };
  }

  if (password.length < 10) {
    throw new Error("ADMIN_PASSWORD короче 10 символов — сид остановлен.");
  }

  const mustChangePassword =
    process.env.ADMIN_MUST_CHANGE_PASSWORD === "true";

  await db.insert(adminUsers).values({
    email,
    passwordHash: await hash(password, { algorithm: ARGON2ID }),
    mustChangePassword,
    passwordChangedAt: mustChangePassword ? null : new Date(),
  });

  return { adminCreated: true, adminMissing: false };
}
