import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import {
  disconnectTelegram,
  getBotUsername,
  getTelegramLink,
  isTelegramConfigured,
  saveTelegramChatId,
  setTelegramWebhook,
} from "@/lib/telegram";
import { telegramChatSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const settings = await getTelegramLink(getDb());

  return json({
    configured: isTelegramConfigured(),
    botUsername: getBotUsername(),
    connected: Boolean(settings.chatId),
    chatId: settings.chatId,
    username: settings.username,
  });
}

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return apiError("Telegram-бот не настроен на сервере", 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = telegramChatSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте chat_id", 400);
  }

  await saveTelegramChatId(getDb(), parsed.data.chatId);

  if (!(await setTelegramWebhook())) {
    console.error("telegram_set_webhook_failed");
  }

  return json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  await disconnectTelegram(getDb());
  return json({ ok: true });
}
