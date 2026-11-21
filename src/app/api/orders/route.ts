import { after } from "next/server";

import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/company";
import { normalizePhoto, photoErrorMessage } from "@/lib/image";
import {
  createOrder,
  OrderValidationError,
  type IncomingPhoto,
} from "@/lib/orders";
import {
  checkRateLimit,
  getRequestIp,
  isSameOrigin,
  rateLimitKey,
} from "@/lib/rate-limit";
import { createOrderSchema } from "@/lib/validation";
import { notifyNewOrder } from "@/lib/telegram";
import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const db = getDb();
  const ip = getRequestIp(request.headers);

  const limited = await checkRateLimit(db, {
    key: rateLimitKey("orders:ip", ip),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });

  if (!limited.allowed) {
    return json(
      { error: "Слишком много заявок. Попробуйте позже." },
      429,
      { "Retry-After": String(limited.retryAfterSeconds) },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Не удалось прочитать отправку", 400);
  }

  const rawPayload = form.get("payload");
  if (typeof rawPayload !== "string") {
    return apiError("Нет данных заявки", 400);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawPayload);
  } catch {
    return apiError("Повреждённые данные заявки", 400);
  }

  const parsed = createOrderSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fields[path]) fields[path] = issue.message;
    }
    return apiError(
      parsed.error.issues[0]?.message ?? "Проверьте поля",
      400,
      { fields },
    );
  }

  const settings = await getSettings();

  const files: { itemIndex: number; file: File }[] = [];
  for (const [name, value] of form.entries()) {
    if (name.startsWith("photo:") && value instanceof File) {
      const index = Number(name.slice("photo:".length));
      if (!Number.isInteger(index)) continue;
      files.push({ itemIndex: index, file: value });
    }
  }

  if (files.length > settings.maxPhotosPerOrder) {
    return apiError(
      `Не больше ${settings.maxPhotosPerOrder} фото на заказ`,
      400,
      { fields: { photos: "Слишком много фото" } },
    );
  }

  const incoming: IncomingPhoto[] = [];
  for (const { itemIndex, file } of files) {
    if (file.size > MAX_FILE_BYTES) {
      return apiError(photoErrorMessage("too_large"), 400, {
        fields: { photos: "Файл больше 10 МБ" },
      });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const normalized = await normalizePhoto(buffer, MAX_FILE_BYTES);
    if ("error" in normalized) {
      return apiError(photoErrorMessage(normalized.error), 400, {
        fields: { photos: photoErrorMessage(normalized.error) },
      });
    }
    incoming.push({ itemIndex, photo: normalized });
  }

  try {
    const outcome = await createOrder(db, parsed.data, incoming, { settings });

    const notify = async () => {
      await notifyNewOrder(db, outcome.id);
    };

    try {
      after(notify);
    } catch {
      // Вне request-scope (например, юнит-тест) отправляем без after.
      void notify();
    }

    return json(
      {
        token: outcome.token,
        number: outcome.publicNumber,
        url: `/z/${outcome.token}`,
        created: outcome.created,
      },
      outcome.created ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof OrderValidationError) {
      return apiError(error.message, 400, { fields: { [error.field]: error.message } });
    }
    console.error(
      "order_create_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не получилось отправить заявку. Попробуйте ещё раз.", 500);
  }
}
