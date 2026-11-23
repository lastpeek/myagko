import { z } from "zod";

import { isPastDate, isValidDate, isValidTime } from "@/lib/time";

export const MAX_ITEMS = 20;
export const MAX_MANUAL_ITEMS = 5;
export const MIN_MANUAL_DESCRIPTION = 10;
export const MAX_MANUAL_DESCRIPTION = 300;

const trimmed = (min: number, max: number, message: string) =>
  z.string().trim().min(min, message).max(max, `Не длиннее ${max} символов`);

export const orderItemInputSchema = z.object({
  tariffId: z.string().trim().min(1).max(64),
  quantity: z.number().int().min(1).max(10),
  heavySoiling: z.boolean().default(false),
  secondSide: z.boolean().default(false),
  optionIds: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
  manualDescription: z
    .string()
    .trim()
    .max(MAX_MANUAL_DESCRIPTION, `Не длиннее ${MAX_MANUAL_DESCRIPTION} символов`)
    .optional(),
});

export const customerSchema = z.object({
  name: trimmed(2, 80, "Как к вам обращаться"),
  phone: z.string().trim().min(10, "Укажите телефон").max(30),
  address: trimmed(5, 200, "Укажите улицу, дом и квартиру"),
  outOfTown: z.boolean().default(false),
  desiredDate: z.string().trim().optional(),
  desiredTimeFrom: z.string().trim().optional(),
  desiredTimeTo: z.string().trim().optional(),
  comment: z.string().trim().max(500, "Не длиннее 500 символов").optional(),
});

export const createOrderSchema = z
  .object({
    items: z
      .array(orderItemInputSchema)
      .min(1, "Корзина пуста")
      .max(MAX_ITEMS, `Не больше ${MAX_ITEMS} позиций`),
    customer: customerSchema,
    consent: z.literal(true, {
      message: "Без согласия на обработку данных заявку принять нельзя",
    }),
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,64}$/, "Некорректный ключ отправки"),
  })
  .superRefine((value, ctx) => {
    const { desiredDate, desiredTimeFrom, desiredTimeTo } = value.customer;
    const date = desiredDate || "";
    const from = desiredTimeFrom || "";
    const to = desiredTimeTo || "";

    if (from || to) {
      if (!date) {
        ctx.addIssue({
          code: "custom",
          message: "Без даты время не принимается",
          path: ["customer", "desiredDate"],
        });
      }
    }

    if (date) {
      if (!isValidDate(date)) {
        ctx.addIssue({
          code: "custom",
          message: "Проверьте дату",
          path: ["customer", "desiredDate"],
        });
      } else if (isPastDate(date)) {
        ctx.addIssue({
          code: "custom",
          message: "Дата уже прошла",
          path: ["customer", "desiredDate"],
        });
      }
    }

    if (from && !isValidTime(from)) {
      ctx.addIssue({
        code: "custom",
        message: "Время в формате ЧЧ:ММ",
        path: ["customer", "desiredTimeFrom"],
      });
    }
    if (to && !isValidTime(to)) {
      ctx.addIssue({
        code: "custom",
        message: "Время в формате ЧЧ:ММ",
        path: ["customer", "desiredTimeTo"],
      });
    }
    if (from && to && from >= to) {
      ctx.addIssue({
        code: "custom",
        message: "Начало должно быть раньше конца",
        path: ["customer", "desiredTimeTo"],
      });
    }
    if (date && from && !to) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите, до какого часа",
        path: ["customer", "desiredTimeTo"],
      });
    }
    if (date && !from && to) {
      ctx.addIssue({
        code: "custom",
        message: "Укажите, с какого часа",
        path: ["customer", "desiredTimeFrom"],
      });
    }
  });

export type CreateOrderPayload = z.infer<typeof createOrderSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(120),
  password: z.string().min(1).max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Введите текущий пароль"),
    newPassword: z
      .string()
      .min(10, "Минимум 10 символов")
      .max(200, "Не длиннее 200 символов"),
    repeatPassword: z.string().min(1, "Повторите пароль"),
  })
  .refine((value) => value.newPassword === value.repeatPassword, {
    message: "Пароли не совпадают",
    path: ["repeatPassword"],
  });

export const orderUpdateSchema = z.object({
  status: z.enum(["new", "agreed", "done", "cancelled"]).optional(),
  finalPrice: z.number().int().min(0).max(1_000_000).nullable().optional(),
  agreedDate: z.string().trim().nullable().optional(),
  agreedTimeFrom: z.string().trim().nullable().optional(),
  agreedTimeTo: z.string().trim().nullable().optional(),
  ownerNote: z.string().max(2000, "Не длиннее 2000 символов").optional(),
});

export type OrderUpdate = z.infer<typeof orderUpdateSchema>;

const pricingId = z
  .string()
  .trim()
  .regex(/^[a-z0-9][a-z0-9-]{0,63}$/, "Код: латиница, цифры и дефис");

export const pricingServiceInputSchema = z.object({
  id: pricingId,
  label: trimmed(1, 60, "Название услуги"),
  hint: z.string().trim().max(120, "Не длиннее 120 символов").default(""),
  icon: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,32}$/, "Неизвестная иконка")
    .default("other"),
  sortOrder: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
});

export const pricingOptionInputSchema = z
  .object({
    id: pricingId,
    label: trimmed(1, 60, "Название опции"),
    kind: z.enum(["percent", "fixed", "fixed_order"]),
    value: z.number().int().min(0).max(1_000_000),
    sortOrder: z.number().int().min(0).max(100_000),
    isActive: z.boolean(),
  })
  .superRefine((option, ctx) => {
    if (option.kind === "percent" && option.value > 500) {
      ctx.addIssue({
        code: "custom",
        message: "Процент — от 0 до 500",
        path: ["value"],
      });
    }
  });

export const tariffItemUpdateSchema = z
  .object({
    id: pricingId,
    category: pricingId,
    label: trimmed(1, 60, "Название услуги"),
    variantLabel: trimmed(1, 60, "Название варианта"),
    basePrice: z.number().int().min(0).max(1_000_000).nullable(),
    requiresPhoto: z.boolean(),
    isManual: z.boolean(),
    isActive: z.boolean(),
    sortOrder: z.number().int().min(0).max(100_000),
    optionIds: z.array(pricingId).max(20),
  })
  .strict();

/** Старый payload кабинета: меняются только цена и видимость. */
export const legacyTariffItemUpdateSchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    basePrice: z.number().int().min(0).max(1_000_000).nullable(),
    isActive: z.boolean(),
  })
  .strict();

export const tariffItemPatchSchema = z.union([
  tariffItemUpdateSchema,
  legacyTariffItemUpdateSchema,
]);

export const tariffSettingsUpdateSchema = z.object({
  minOrder: z.number().int().min(0).max(1_000_000),
  outOfTownFee: z.number().int().min(0).max(100_000),
  roundingStep: z.number().int().min(1).max(1000),
  /** Легаси-поля старой формы; новые заявки считаются по опциям. */
  soilingPercent: z.number().int().min(0).max(500).optional(),
  secondSidePercent: z.number().int().min(0).max(500).optional(),
});

function uniqueIds(
  values: Array<{ id: string }>,
  ctx: z.RefinementCtx,
  path: string,
  message: string,
) {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      ctx.addIssue({ code: "custom", message, path: [path] });
      return;
    }
    seen.add(value.id);
  }
}

export const updateTariffsSchema = z
  .object({
    settings: tariffSettingsUpdateSchema,
    services: z.array(pricingServiceInputSchema).max(50).optional(),
    options: z.array(pricingOptionInputSchema).max(100).optional(),
    items: z.array(tariffItemPatchSchema).max(300),
  })
  .superRefine((value, ctx) => {
    uniqueIds(value.services ?? [], ctx, "services", "Коды услуг повторяются");
    uniqueIds(value.options ?? [], ctx, "options", "Коды опций повторяются");
    uniqueIds(value.items, ctx, "items", "Коды вариантов повторяются");

    const hasCatalog =
      value.services !== undefined || value.options !== undefined;
    if (!hasCatalog) {
      value.items.forEach((item, index) => {
        if ("category" in item) {
          ctx.addIssue({
            code: "custom",
            message: "Для полного сохранения нужны услуги и опции",
            path: ["items", index],
          });
        }
      });
      return;
    }

    if (!value.services || !value.options) {
      ctx.addIssue({
        code: "custom",
        message: "Для полного сохранения нужны услуги и опции",
        path: ["services"],
      });
      return;
    }

    const serviceIds = new Set(value.services.map((service) => service.id));
    const optionIds = new Set(value.options.map((option) => option.id));

    value.items.forEach((item, index) => {
      if (!("category" in item)) {
        ctx.addIssue({
          code: "custom",
          message: "Нужны полные данные варианта",
          path: ["items", index],
        });
        return;
      }

      if (!serviceIds.has(item.category)) {
        ctx.addIssue({
          code: "custom",
          message: "У варианта нет услуги",
          path: ["items", index, "category"],
        });
      }
      if (item.isManual && item.basePrice !== null) {
        ctx.addIssue({
          code: "custom",
          message: "У позиции «По фото» цена не задаётся",
          path: ["items", index, "basePrice"],
        });
      }
      if (!item.isManual && item.basePrice === null) {
        ctx.addIssue({
          code: "custom",
          message: "У варианта с фиксированной ценой цена обязательна",
          path: ["items", index, "basePrice"],
        });
      }
      if (item.isManual && item.optionIds.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: "У позиции «По фото» не может быть опций",
          path: ["items", index, "optionIds"],
        });
      }
      for (const optionId of item.optionIds) {
        if (!optionIds.has(optionId)) {
          ctx.addIssue({
            code: "custom",
            message: "Опция не найдена",
            path: ["items", index, "optionIds"],
          });
          break;
        }
      }
    });
  });

export type UpdateTariffsInput = z.infer<typeof updateTariffsSchema>;

export const updateCompanySchema = z.object({
  name: trimmed(1, 60, "Название компании"),
  city: trimmed(1, 60, "Город"),
  phone: trimmed(5, 40, "Телефон"),
  email: z.string().trim().min(3, "Почта").max(120),
  territory: trimmed(1, 300, "Территория выезда"),
  accentColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "HEX-цвет"),
  heroTitle: trimmed(3, 80, "Заголовок первого экрана"),
  heroSubtitle: trimmed(3, 200, "Подзаголовок"),
  otherRequiresPhoto: z.boolean(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

export const galleryUpdateSchema = z
  .object({
    caption: z
      .string()
      .trim()
      .max(80, "Не длиннее 80 символов")
      .optional(),
    isVisible: z.boolean().optional(),
    move: z.enum(["up", "down"]).optional(),
  })
  .refine(
    (value) =>
      value.caption !== undefined ||
      value.isVisible !== undefined ||
      value.move !== undefined,
    { message: "Нет изменений" },
  );

export type GalleryUpdate = z.infer<typeof galleryUpdateSchema>;

export const telegramChatSchema = z.object({
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{5,20}$/, "chat_id — это число, например 123456789"),
});
