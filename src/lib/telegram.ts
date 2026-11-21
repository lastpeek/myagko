import { randomInt } from "node:crypto";

import { and, asc, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "@/lib/db";
import { orders, orderItems, telegramLinks } from "@/lib/db/schema";
import { formatRub } from "@/lib/format";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TELEGRAM_CODE_TTL_MINUTES = 15;
const TELEGRAM_TIMEOUT_MS = 3000;

export const TELEGRAM_TEXTS = {
  start: "Это бот уведомлений. Чтобы подключить, откройте кабинет → Компания → Уведомления и нажмите „Подключить Telegram“.",
  expired: "Код устарел. Сгенерируйте новый в кабинете.",
  success: "Готово. Заявки будут приходить сюда.",
  test: "Проверка: уведомления работают. Новые заявки будут приходить сюда.",
} as const;

export type TelegramLink = typeof telegramLinks.$inferSelect;

const EMPTY_LINK: TelegramLink = {
  id: 1,
  chatId: null,
  username: null,
  code: null,
  codeExpiresAt: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export function normalizeBotUsername(value: string | undefined): string | null {
  const username = value?.trim().replace(/^@/, "");
  return username ? username : null;
}

export function getBotUsername(): string | null {
  return normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME);
}

export function isTelegramConfigured(): boolean {
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_WEBHOOK_SECRET &&
      getBotUsername(),
  );
}

export function generateLinkCode(): string {
  return Array.from(
    { length: 8 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
  ).join("");
}

export function telegramDeepLink(code: string): string | null {
  const username = getBotUsername();
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

export async function getTelegramLink(db: Database): Promise<TelegramLink> {
  const rows = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.id, 1))
    .limit(1);
  return rows[0] ?? EMPTY_LINK;
}

export async function createTelegramLinkCode(
  db: Database,
): Promise<{ code: string; expiresAt: Date; url: string }> {
  const code = generateLinkCode();
  const expiresAt = new Date(
    Date.now() + TELEGRAM_CODE_TTL_MINUTES * 60 * 1000,
  );
  const url = telegramDeepLink(code);
  if (!url) throw new Error("TELEGRAM_BOT_USERNAME не задан");

  await db
    .insert(telegramLinks)
    .values({
      id: 1,
      code,
      codeExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramLinks.id,
      set: { code, codeExpiresAt: expiresAt, updatedAt: new Date() },
    });

  return { code, expiresAt, url };
}

export async function bindTelegramChat(
  db: Database,
  code: string,
  chatId: string,
  username: string | null,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(telegramLinks)
    .where(
      and(
        eq(telegramLinks.code, code.trim().toUpperCase()),
        gt(telegramLinks.codeExpiresAt, new Date()),
      ),
    )
    .limit(1);

  const link = rows[0];
  if (!link) return false;

  await db
    .update(telegramLinks)
    .set({
      chatId,
      username,
      code: null,
      codeExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(telegramLinks.id, link.id));

  return true;
}

export async function saveTelegramChatId(
  db: Database,
  chatId: string,
): Promise<void> {
  await db
    .insert(telegramLinks)
    .values({
      id: 1,
      chatId,
      username: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: telegramLinks.id,
      set: {
        chatId,
        username: null,
        code: null,
        codeExpiresAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function disconnectTelegram(db: Database): Promise<void> {
  await db
    .update(telegramLinks)
    .set({
      chatId: null,
      username: null,
      code: null,
      codeExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(telegramLinks.id, 1));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOrderNotification(input: {
  number: number;
  total: number | null;
  items: Array<{ label: string; variantLabel: string; quantity: number }>;
  adminUrl: string;
}): string {
  const composition = input.items
    .slice(0, 4)
    .map(
      (item) =>
        `${escapeHtml(item.label)} · ${escapeHtml(item.variantLabel)}${
          item.quantity > 1 ? ` × ${item.quantity}` : ""
        }`,
    )
    .join(", ");
  const more =
    input.items.length > 4 ? ` и ещё ${input.items.length - 4}` : "";
  const price =
    input.total === null
      ? "по фото"
      : `Предварительно: ${formatRub(input.total)}`;

  return [
    `<b>Новая заявка №${input.number}</b>`,
    price,
    `${composition}${more}`,
    `<a href="${escapeHtml(input.adminUrl)}">Открыть в кабинете</a>`,
  ].join("\n");
}

function telegramApiBase(): string {
  return (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(
    /\/$/,
    "",
  );
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;

  try {
    const response = await fetcher(
      `${telegramApiBase()}/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function setTelegramWebhook(
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!token || !secret || !siteUrl) return false;

  try {
    const response = await fetcher(
      `${telegramApiBase()}/bot${token}/setWebhook`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: `${siteUrl.replace(/\/$/, "")}/api/telegram/webhook`,
          secret_token: secret,
          allowed_updates: ["message"],
        }),
        signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function sendTestTelegramMessage(
  db: Database,
  fetcher: typeof fetch = fetch,
): Promise<boolean> {
  const link = await getTelegramLink(db);
  if (!link.chatId) return false;
  return sendTelegramMessage(link.chatId, TELEGRAM_TEXTS.test, fetcher);
}

export async function notifyNewOrder(
  db: Database,
  orderId: string,
): Promise<void> {
  if (!process.env.TELEGRAM_BOT_TOKEN) return;

  try {
    const link = await getTelegramLink(db);
    if (!link.chatId) return;

    // Атомарный флаг: повторная отправка при ретрае не дублирует сообщение.
    const claimed = await db
      .update(orders)
      .set({ notifiedAt: new Date() })
      .where(and(eq(orders.id, orderId), isNull(orders.notifiedAt)))
      .returning({ id: orders.id });

    if (claimed.length === 0) return;

    const orderRows = await db
      .select({
        id: orders.id,
        publicNumber: orders.publicNumber,
        estimatedTotal: orders.estimatedTotal,
        finalPrice: orders.finalPrice,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    const order = orderRows[0];
    if (!order) return;

    const items = await db
      .select({
        label: orderItems.label,
        variantLabel: orderItems.variantLabel,
        quantity: orderItems.quantity,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(asc(orderItems.sortOrder));

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
    ).replace(/\/$/, "");

    const text = buildOrderNotification({
      number: order.publicNumber,
      total: order.finalPrice ?? order.estimatedTotal,
      items,
      adminUrl: `${siteUrl}/admin/orders/${order.id}`,
    });

    const sent = await sendTelegramMessage(link.chatId, text);
    if (!sent) console.error("telegram_notify_failed");
  } catch (error) {
    console.error(
      "telegram_notify_error",
      error instanceof Error ? error.name : "unknown",
    );
  }
}
