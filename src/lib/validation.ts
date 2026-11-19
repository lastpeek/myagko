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
    const manualItems = value.items.filter((item) =>
      item.tariffId.startsWith("other"),
    );
    if (manualItems.length > MAX_MANUAL_ITEMS) {
      ctx.addIssue({
        code: "custom",
        message: `Не больше ${MAX_MANUAL_ITEMS} позиций «Другое»`,
        path: ["items"],
      });
    }

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

export const tariffItemUpdateSchema = z.object({
  id: z.string().min(1),
  basePrice: z.number().int().min(0).max(1_000_000).nullable(),
  isActive: z.boolean(),
});

export const tariffSettingsUpdateSchema = z.object({
  minOrder: z.number().int().min(0).max(1_000_000),
  soilingPercent: z.number().int().min(0).max(200),
  secondSidePercent: z.number().int().min(0).max(200),
  outOfTownFee: z.number().int().min(0).max(100_000),
  roundingStep: z.number().int().min(1).max(1000),
});

export const updateTariffsSchema = z.object({
  settings: tariffSettingsUpdateSchema,
  items: z.array(tariffItemUpdateSchema).max(50),
});

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
