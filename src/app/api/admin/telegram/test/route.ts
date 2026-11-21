import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import { sendTestTelegramMessage } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const sent = await sendTestTelegramMessage(getDb());
  if (!sent) {
    return apiError(
      "Telegram не ответил. Проверьте подключение и токен бота.",
      502,
    );
  }

  return json({ ok: true });
}
