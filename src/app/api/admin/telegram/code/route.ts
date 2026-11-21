import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import {
  createTelegramLinkCode,
  isTelegramConfigured,
  setTelegramWebhook,
  TELEGRAM_CODE_TTL_MINUTES,
} from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!isTelegramConfigured()) {
    return apiError(
      "Telegram-бот не настроен: задайте TELEGRAM_BOT_TOKEN и TELEGRAM_BOT_USERNAME",
      400,
    );
  }

  const link = await createTelegramLinkCode(getDb());

  if (!(await setTelegramWebhook())) {
    console.error("telegram_set_webhook_failed");
  }

  return json({ ...link, ttlMinutes: TELEGRAM_CODE_TTL_MINUTES });
}
