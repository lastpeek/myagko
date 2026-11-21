import { timingSafeEqual } from "node:crypto";

import { json } from "@/lib/api";
import { getDb } from "@/lib/db";
import { bindTelegramChat, sendTelegramMessage, TELEGRAM_TEXTS } from "@/lib/telegram";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(header: string | null, secret: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Webhook Telegram. Секрет проверяется по заголовку, который Telegram
 * присылает, если webhook зарегистрирован с secret_token.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || !secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return json({ ok: false }, secret ? 401 : 503);
  }

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return json({ ok: false }, 503);
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return json({ ok: false }, 400);
  }

  const message = (update as {
    message?: {
      text?: string;
      chat?: { id?: number | string };
      from?: { username?: string };
    };
  }).message;

  const chatId = message?.chat?.id;
  const text = message?.text;
  if (chatId === undefined || typeof text !== "string") {
    return json({ ok: true });
  }

  const start = /^\/start(?:@\w+)?(?:\s+(\S+))?/i.exec(text.trim());
  if (!start) return json({ ok: true });

  const code = start[1]?.toUpperCase() ?? "";

  if (!code) {
    await sendTelegramMessage(String(chatId), TELEGRAM_TEXTS.start);
    return json({ ok: true });
  }

  const username = message?.from?.username ?? null;
  const bound = await bindTelegramChat(
    getDb(),
    code,
    String(chatId),
    username,
  );

  await sendTelegramMessage(
    String(chatId),
    bound ? TELEGRAM_TEXTS.success : TELEGRAM_TEXTS.expired,
  );

  return json({ ok: true });
}
