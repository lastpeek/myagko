import { expect, test } from "@playwright/test";

const MOCK = "http://127.0.0.1:3210";

type MockRequest = {
  url: string;
  body: { chat_id?: string; text?: string; url?: string; secret_token?: string } | null;
};

async function mockRequests(
  request: import("@playwright/test").APIRequestContext,
): Promise<MockRequest[]> {
  const response = await request.get(`${MOCK}/requests`);
  expect(response.status()).toBe(200);
  return (await response.json()) as MockRequest[];
}

test("Telegram: код, webhook, тест, уведомление о заявке и отключение", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.request.delete(`${MOCK}/requests`);

  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.goto("/admin/company");
  await expect(page.getByRole("heading", { name: "Уведомления" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Подключить Telegram" }),
  ).toBeVisible();

  const html = await page.content();
  expect(html).not.toContain("e2e-fake-token");

  await page.getByRole("button", { name: "Подключить Telegram" }).click();

  const codeElement = page.locator("[data-telegram-code]");
  await expect(codeElement).toBeVisible();
  const code = await codeElement.getAttribute("data-telegram-code");
  expect(code).toMatch(/^[A-Z0-9]{8}$/);

  const openLink = page.getByRole("link", { name: "Открыть Telegram" });
  await expect(openLink).toHaveAttribute(
    "href",
    `https://t.me/myagko_e2e_bot?start=${code}`,
  );

  await expect
    .poll(
      async () =>
        (await mockRequests(page.request)).filter((item) =>
          item.url.includes("/setWebhook"),
        ).length,
      { timeout: 10_000 },
    )
    .toBe(1);

  const webhookRequest = (await mockRequests(page.request)).find((item) =>
    item.url.includes("/setWebhook"),
  );
  expect(webhookRequest?.body?.url).toBe(
    "http://localhost:3100/api/telegram/webhook",
  );
  expect(webhookRequest?.body?.secret_token).toBe("e2e-webhook-secret");

  const webhook = await page.request.post("/api/telegram/webhook", {
    headers: { "x-telegram-bot-api-secret-token": "e2e-webhook-secret" },
    data: {
      message: {
        text: `/start ${code}`,
        chat: { id: 123456789 },
        from: { username: "e2e_master" },
      },
    },
  });
  expect(webhook.status()).toBe(200);

  await expect(page.getByText("Подключено: @e2e_master")).toBeVisible({
    timeout: 20_000,
  });
  await page.screenshot({
    path: "test-results/screens/telegram-connected-390.png",
    fullPage: true,
  });

  // Тестовое сообщение
  await page.request.delete(`${MOCK}/requests`);
  await page.getByRole("button", { name: "Отправить тестовое сообщение" }).click();
  await expect(page.getByText("Тестовое сообщение отправлено")).toBeVisible();

  await expect
    .poll(
      async () =>
        (await mockRequests(page.request)).filter(
          (item) =>
            item.url.includes("/sendMessage") &&
            item.body?.text?.includes("Проверка"),
        ).length,
      { timeout: 10_000 },
    )
    .toBe(1);

  // Заявка при подключённом Telegram
  await page.request.delete(`${MOCK}/requests`);
  const key = `tg-${Date.now().toString(36)}aaaaaa`;
  const payload = {
    items: [
      {
        tariffId: "sofa-3",
        quantity: 1,
        heavySoiling: false,
        secondSide: false,
      },
    ],
    customer: {
      name: "Тест Telegram",
      phone: "+7 913 000-00-00",
      address: "Улица Ленина, 1",
      outOfTown: false,
    },
    consent: true,
    idempotencyKey: key,
  };

  const created = await page.request.post("/api/orders", {
    multipart: { payload: JSON.stringify(payload) },
    headers: { origin: "http://localhost:3100" },
  });
  expect(created.status()).toBe(201);
  const order = (await created.json()) as { number: number; token: string };

  await expect
    .poll(
      async () =>
        (await mockRequests(page.request)).filter(
          (item) =>
            item.url.includes("/sendMessage") &&
            item.body?.text?.includes("Новая заявка"),
        ).length,
      { timeout: 10_000 },
    )
    .toBe(1);

  const notification = (await mockRequests(page.request)).find(
    (item) =>
      item.url.includes("/sendMessage") &&
      item.body?.text?.includes("Новая заявка"),
  );
  expect(notification?.body?.chat_id).toBe("123456789");
  expect(notification?.body?.text).toContain(`Новая заявка №${order.number}`);
  expect(notification?.body?.text).toContain("Открыть в кабинете");
  expect(notification?.body?.text).not.toContain("Тест Telegram");
  expect(notification?.body?.text).not.toContain("+7 913");

  // Ретрай с тем же ключом не дублирует сообщение
  const retry = await page.request.post("/api/orders", {
    multipart: { payload: JSON.stringify(payload) },
    headers: { origin: "http://localhost:3100" },
  });
  expect(retry.status()).toBe(200);
  await page.waitForTimeout(800);
  const notifications = (await mockRequests(page.request)).filter(
    (item) =>
      item.url.includes("/sendMessage") &&
      item.body?.text?.includes(`Новая заявка №${order.number}`),
  );
  expect(notifications).toHaveLength(1);

  // Недоступный Telegram: заявка всё равно создаётся
  await page.request.post(`${MOCK}/fail-send?value=1`);
  await page.request.delete(`${MOCK}/requests`);
  const failedDelivery = await page.request.post("/api/orders", {
    multipart: {
      payload: JSON.stringify({
        ...payload,
        idempotencyKey: `tg-fail-${Date.now().toString(36)}aaaaaa`,
      }),
    },
    headers: { origin: "http://localhost:3100" },
  });
  expect(failedDelivery.status()).toBe(201);
  await expect
    .poll(
      async () =>
        (await mockRequests(page.request)).filter((item) =>
          item.url.includes("/sendMessage"),
        ).length,
      { timeout: 10_000 },
    )
    .toBe(1);
  await page.request.post(`${MOCK}/fail-send?value=0`);

  // Без привязки сообщение не уходит, заявка создаётся
  await page.getByRole("button", { name: "Отключить" }).click();
  await expect(
    page.getByRole("button", { name: "Подключить Telegram" }),
  ).toBeVisible();
  await page.request.delete(`${MOCK}/requests`);

  const disconnectedOrder = await page.request.post("/api/orders", {
    multipart: {
      payload: JSON.stringify({
        ...payload,
        idempotencyKey: `tg-off-${Date.now().toString(36)}aaaaaa`,
      }),
    },
    headers: { origin: "http://localhost:3100" },
  });
  expect(disconnectedOrder.status()).toBe(201);
  await page.waitForTimeout(800);
  expect(
    (await mockRequests(page.request)).filter((item) =>
      item.url.includes("/sendMessage"),
    ),
  ).toHaveLength(0);

  // Ручной chat_id как альтернатива
  await page.getByRole("button", { name: "Введите chat_id вручную" }).click();
  await page.getByLabel("chat_id", { exact: true }).fill("123456789");
  await page.getByRole("button", { name: "Сохранить chat_id" }).click();
  await expect(page.getByText("Подключено: chat_id 123456789")).toBeVisible();

  await page.getByRole("button", { name: "Отключить" }).click();
  await expect(
    page.getByRole("button", { name: "Подключить Telegram" }),
  ).toBeVisible();
});
