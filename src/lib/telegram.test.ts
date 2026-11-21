import fs from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { POST as telegramWebhook } from "@/app/api/telegram/webhook/route";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import { orderItems, orders, telegramLinks } from "@/lib/db/schema";
import {
  bindTelegramChat,
  buildOrderNotification,
  createTelegramLinkCode,
  disconnectTelegram,
  getTelegramLink,
  isTelegramConfigured,
  notifyNewOrder,
  saveTelegramChatId,
  sendTelegramMessage,
  sendTestTelegramMessage,
  setTelegramWebhook,
  TELEGRAM_TEXTS,
} from "@/lib/telegram";

const DB_PATH = path.join(process.cwd(), ".data", "telegram-test");

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_BOT_USERNAME = "@myagko_test_bot";
process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
process.env.TELEGRAM_API_BASE = "http://telegram.test";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

const okFetch = vi.fn(async () => ({ ok: true }) as Response);

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await runMigrations();
  vi.stubGlobal("fetch", okFetch);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
});

describe("подключение Telegram", () => {
  it("генерирует 8-символьный код, ссылку и хранит код с TTL", async () => {
    const link = await createTelegramLinkCode(getDb());

    expect(link.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(link.url).toBe(
      `https://t.me/myagko_test_bot?start=${link.code}`,
    );
    expect(link.expiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

    const settings = await getTelegramLink(getDb());
    expect(settings.code).toBe(link.code);
    expect(settings.codeExpiresAt?.getTime()).toBe(link.expiresAt.getTime());
  });

  it("привязывает chat_id по коду один раз", async () => {
    const { code } = await createTelegramLinkCode(getDb());

    expect(await bindTelegramChat(getDb(), "WRONG123", "1", null)).toBe(false);
    expect(
      await bindTelegramChat(getDb(), code, "123456789", "master"),
    ).toBe(true);

    const settings = await getTelegramLink(getDb());
    expect(settings.chatId).toBe("123456789");
    expect(settings.username).toBe("master");
    expect(settings.code).toBeNull();

    expect(
      await bindTelegramChat(getDb(), code, "999999999", "other"),
    ).toBe(false);
  });

  it("не принимает истёкший код", async () => {
    const { code } = await createTelegramLinkCode(getDb());
    await getDb()
      .update(telegramLinks)
      .set({ codeExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(telegramLinks.id, 1));

    expect(
      await bindTelegramChat(getDb(), code, "123456789", "master"),
    ).toBe(false);
  });

  it("сохраняет chat_id вручную и отключает", async () => {
    await saveTelegramChatId(getDb(), "-1001234567890");
    let settings = await getTelegramLink(getDb());
    expect(settings.chatId).toBe("-1001234567890");
    expect(settings.username).toBeNull();

    await disconnectTelegram(getDb());
    settings = await getTelegramLink(getDb());
    expect(settings.chatId).toBeNull();
    expect(settings.username).toBeNull();
  });

  it("конфиг считается полным только с токеном и username", () => {
    expect(isTelegramConfigured()).toBe(true);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    expect(isTelegramConfigured()).toBe(false);
    process.env.TELEGRAM_BOT_TOKEN = token;
  });

  it("webhook привязывает чат по /start и отвечает 200", async () => {
    const { code } = await createTelegramLinkCode(getDb());
    okFetch.mockClear();
    const response = await telegramWebhook(
      new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "test-webhook-secret",
        },
        body: JSON.stringify({
          message: {
            text: `/start ${code}`,
            chat: { id: 555000111 },
            from: { username: "owner_tg" },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const settings = await getTelegramLink(getDb());
    expect(settings.chatId).toBe("555000111");
    expect(settings.username).toBe("owner_tg");
    expect(settings.code).toBeNull();

    const [, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toBe(TELEGRAM_TEXTS.success);
  });

  it("webhook подсказывает, как подключиться, если /start без кода", async () => {
    okFetch.mockClear();
    const response = await telegramWebhook(
      new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "test-webhook-secret",
        },
        body: JSON.stringify({
          message: { text: "/start", chat: { id: 555000111 } },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const [, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toBe(TELEGRAM_TEXTS.start);
  });

  it("webhook отвечает на устаревший код", async () => {
    okFetch.mockClear();
    const response = await telegramWebhook(
      new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "test-webhook-secret",
        },
        body: JSON.stringify({
          message: {
            text: "/start EXPIRED1",
            chat: { id: 555000111 },
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    const [, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toBe(TELEGRAM_TEXTS.expired);
  });

  it("webhook отклоняет неверный секрет", async () => {
    const response = await telegramWebhook(
      new Request("http://localhost:3000/api/telegram/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "wrong",
        },
        body: JSON.stringify({}),
      }),
    );
    expect(response.status).toBe(401);
  });
});

describe("сообщение о заявке", () => {
  it("собирает текст без имени и телефона клиента", () => {
    const text = buildOrderNotification({
      number: 1042,
      total: 5960,
      items: [
        { label: "Диван", variantLabel: "3 места", quantity: 1 },
        { label: "Кресло", variantLabel: "Реклайнер", quantity: 2 },
      ],
      adminUrl: "http://localhost:3000/admin/orders/abc",
    });

    expect(text).toContain("Новая заявка №1042");
    expect(text).toMatch(/5\s960/);
    expect(text).toContain("Кресло · Реклайнер × 2");
    expect(text).toContain("http://localhost:3000/admin/orders/abc");
    expect(text).not.toContain("Анна");
    expect(text).not.toContain("+7");
  });

  it("экранирует HTML в подписях", () => {
    const text = buildOrderNotification({
      number: 1,
      total: null,
      items: [{ label: "<Диван>", variantLabel: "3 & 2", quantity: 1 }],
      adminUrl: "http://localhost:3000/admin/orders/abc",
    });
    expect(text).toContain("&lt;Диван&gt;");
    expect(text).toContain("3 &amp; 2");
    expect(text).toContain("по фото");
  });

  it("отправляет уведомление после записи заявки", async () => {
    const db = getDb();
    await saveTelegramChatId(db, "777888999");

    const inserted = await db
      .insert(orders)
      .values({
        publicNumber: 2001,
        token: "telegram-test-token",
        name: "Анна К.",
        phone: "+79130000000",
        address: "Улица Ленина, 1",
        consentAt: new Date(),
        consentVersion: "2026-11-19",
        estimatedTotal: 5960,
        priceSnapshot: {
          capturedAt: new Date().toISOString(),
          rules: {
            minOrder: 2500,
            soilingPercent: 30,
            secondSidePercent: 50,
            outOfTownFee: 500,
            roundingStep: 10,
          },
          tariff: [],
          otherRequiresPhoto: true,
        },
        breakdown: {
          lines: [],
          itemsSubtotal: 5960,
          minimumAdjustment: 0,
          outOfTownFee: 0,
          roundingAdjustment: 0,
          total: 5960,
          hasManualItems: false,
          manualItemsCount: 0,
          minOrder: 2500,
        },
      })
      .returning({ id: orders.id });

    await db.insert(orderItems).values({
      orderId: inserted[0]!.id,
      category: "sofa",
      label: "Диван",
      variantLabel: "3 места",
      quantity: 1,
      unitBasePrice: 3200,
      lineTotal: 4160,
      formula: "3 200 × 1.3 = 4 160 ₽",
      sortOrder: 0,
    });

    okFetch.mockClear();
    await notifyNewOrder(db, inserted[0]!.id);

    expect(okFetch).toHaveBeenCalledTimes(1);
    const [url, init] = okFetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("bottest-token/sendMessage");
    const body = JSON.parse(String(init.body)) as {
      chat_id: string;
      text: string;
    };
    expect(body.chat_id).toBe("777888999");
    expect(body.text).toContain("Новая заявка №2001");
    expect(body.text).toContain("Диван · 3 места");
    expect(body.text).not.toContain("Анна");

    const afterFirst = await db
      .select({ notifiedAt: orders.notifiedAt })
      .from(orders)
      .where(eq(orders.id, inserted[0]!.id));
    expect(afterFirst[0]?.notifiedAt).not.toBeNull();

    // Повторный вызов не дублирует сообщение
    await notifyNewOrder(db, inserted[0]!.id);
    expect(okFetch).toHaveBeenCalledTimes(1);
  });

  it("отправляет тестовое сообщение в подключённый чат", async () => {
    const db = getDb();
    await saveTelegramChatId(db, "321654987");
    okFetch.mockClear();

    expect(await sendTestTelegramMessage(db)).toBe(true);
    const [, init] = okFetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { text: string };
    expect(body.text).toBe(TELEGRAM_TEXTS.test);
  });

  it("регистрирует webhook с URL и секретом", async () => {
    const fetcher = vi.fn(async () => ({ ok: true }) as Response);
    expect(await setTelegramWebhook(fetcher)).toBe(true);

    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toContain("bottest-token/setWebhook");
    const body = JSON.parse(String(init.body)) as {
      url: string;
      secret_token: string;
      allowed_updates: string[];
    };
    expect(body.url).toBe("http://localhost:3000/api/telegram/webhook");
    expect(body.secret_token).toBe("test-webhook-secret");
    expect(body.allowed_updates).toEqual(["message"]);
  });

  it("sendTelegramMessage возвращает false при ошибке сети", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await sendTelegramMessage("123", "hi", failing)).toBe(false);
  });
});
