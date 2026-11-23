import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");
const uploadsDir = path.join(process.cwd(), ".data", "e2e-uploads");

function dateIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

test.describe.configure({ mode: "serial" });

test("брошенная корзина не оставляет файлов на сервере", async ({ page }) => {
  const filesBefore = fs.existsSync(uploadsDir)
    ? fs.readdirSync(uploadsDir).length
    : 0;

  await page.goto("/");
  await page.getByRole("button", { name: /^Диван/ }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();
  await expect(page.getByRole("heading", { name: "Заявка", level: 1 })).toBeVisible();

  await page
    .locator("article")
    .first()
    .locator('input[type="file"]')
    .setInputFiles(photoPath);
  await expect(page.getByText("1 / 3").first()).toBeVisible();

  await page.reload();
  await expect(page.getByText("1 / 3").first()).toBeVisible();

  // Уходим, не отправляя заявку. На сервере не должно появиться файлов.
  await page.goto("/");
  await page.waitForTimeout(500);

  const files = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir) : [];
  expect(files.length).toBe(filesBefore);
});

test("клиент собирает заказ, владелец согласует, клиент видит изменения", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Что почистим?", level: 1 }),
  ).toBeVisible();

  // Диван 3 места
  await page.getByRole("button", { name: /^Диван/ }).click();
  await page.getByRole("button", { name: "3 места", exact: true }).click();
  await page.getByRole("button", { name: "В корзину" }).click();

  // Кресло-реклайнер
  await page.getByRole("button", { name: /^Кресл/ }).click();
  await page.getByRole("button", { name: "Реклайнер", exact: true }).click();
  await page.getByRole("button", { name: "В корзину" }).click();

  await page.getByRole("link", { name: /Корзина/ }).click();
  await expect(page.getByRole("heading", { name: "Заявка", level: 1 })).toBeVisible();

  // Сильные загрязнения у дивана: 3200 × 1.3 = 4160, плюс кресло 1800
  await page.getByRole("button", { name: /Сильные загрязнения/ }).first().click();
  await expect(page.getByText("5 960 ₽").first()).toBeVisible();

  // Неверный тип файла
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.first().setInputFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("это не фото"),
  });
  await expect(page.getByText("Нужен JPG, PNG, WebP.")).toBeVisible();

  // Превышение размера
  await fileInputs
    .first()
    .setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(11 * 1024 * 1024),
    });
  await expect(page.getByText(/Файл больше 10 МБ/)).toBeVisible();

  // Валидное фото
  await fileInputs.first().setInputFiles(photoPath);
  await expect(page.getByText("1 / 3").first()).toBeVisible();

  // Черновик переживает перезагрузку
  await page.reload();
  await expect(page.getByRole("heading", { name: "Заявка", level: 1 })).toBeVisible();
  await expect(page.getByText("5 960 ₽").first()).toBeVisible();
  await expect(page.getByText("1 / 3").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/cart-390.png",
    fullPage: true,
  });

  // Удаление с возвратом
  await page.getByRole("button", { name: "Удалить: Кресло Реклайнер" }).click();
  await expect(page.getByText(/Удалено: кресло/)).toBeVisible();
  await page.getByRole("button", { name: "Вернуть" }).click();
  await expect(page.getByRole("heading", { name: "Кресло · Реклайнер" })).toBeVisible();

  // Оформление
  await page.getByRole("button", { name: "Оформить заявку" }).click();
  await expect(page.getByRole("heading", { name: "Оформление" })).toBeVisible();

  await page.getByLabel("Как вас зовут").fill("Анна К.");
  await page.getByLabel("Телефон").fill("+7 913 000-00-00");
  await page.getByLabel("Адрес", { exact: true }).fill("Улица Ленина, 1, кв. 2");
  await page.getByLabel("Дата").fill(dateIn(3));
  await page.getByLabel("Время с").fill("14:00");
  await page.getByLabel("Время по").fill("16:00");
  await page.getByLabel("Комментарий").fill("Код домофона 12");
  await page.getByLabel(/Согласен на обработку/).check();

  // Черновик формы переживает перезагрузку
  await page.reload();
  await expect(page.getByLabel("Как вас зовут")).toHaveValue("Анна К.");
  await expect(page.getByLabel("Адрес", { exact: true })).toHaveValue(
    "Улица Ленина, 1, кв. 2",
  );
  await expect(page.getByLabel(/Согласен на обработку/)).toBeChecked();

  await page.screenshot({
    path: "test-results/screens/checkout-390.png",
    fullPage: true,
  });

  // Тёмная тема: плитки фото на оформлении
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(400);

  const armchairRow = page.locator("li", { hasText: "Кресло · Реклайнер" });
  await expect(armchairRow.getByText("без фото")).toBeVisible();
  await expect(armchairRow.getByText("Фото 0 / 3")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Добавить ещё" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "test-results/screens/checkout-390-dark-before.png",
    fullPage: true,
  });

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    armchairRow
      .getByRole("button", { name: /Добавить фото к позиции «Кресло/ })
      .click(),
  ]);
  await chooser.setFiles(photoPath);

  await expect(armchairRow.getByText("Фото 1 / 3")).toBeVisible();
  await expect(
    armchairRow.getByRole("button", { name: "Удалить фото" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/checkout-390-dark-with-photo.png",
    fullPage: true,
  });

  await armchairRow.getByRole("button", { name: "Удалить фото" }).click();
  await expect(armchairRow.getByText("без фото")).toBeVisible();
  await expect(armchairRow.getByText("Фото 0 / 3")).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/checkout-390-dark-no-photo.png",
    fullPage: true,
  });

  // Возвращаем светлую тему для остальных проверок
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Отправить заявку" }).click();

  await expect(page.getByText("Заявка отправлена")).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/z\/[A-Za-z0-9_-]+/);

  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  const match = heading?.match(/№(\d+)/);
  expect(match).toBeTruthy();
  const orderNumber = match![1];
  const clientUrl = page.url().replace(/\?.*$/, "");

  await expect(page.getByText("Новая", { exact: true }).first()).toBeVisible();

  // Клиентская страница открыта до действий владельца — проверим автообновление
  const clientPage = await context.newPage();
  await clientPage.goto(clientUrl);
  await expect(clientPage.getByText("Предварительная цена")).toBeVisible();
  await expect(
    clientPage.locator('meta[name="robots"]'),
  ).toHaveAttribute("content", /noindex/);

  // После успешной отправки черновик очищен
  await page.goto("/cart");
  await expect(page.getByText("Пока пусто")).toBeVisible();

  // Кабинет: после сида вход сразу ведёт в заявки
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  // Заявка №1001 с доплатой за грязь: в списке именно «грязь», не «без доплат»
  await expect(
    page.getByText(/фото 1 · грязь/).filter({ visible: true }).first(),
  ).toBeVisible();

  await page.screenshot({
    path: "test-results/screens/admin-390.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Анна К." }).click();
  await expect(
    page.getByRole("heading", { name: `Заявка №${orderNumber}` }),
  ).toBeVisible();

  // Владелец видит расшифровку процентов
  await expect(
    page.getByText(/3\s200 ₽ × 1\.3 = 4\s160 ₽/),
  ).toBeVisible();

  // Подписи «с» и «по» видны на 360px в обеих темах
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('label[for="agreed-from"]')).toHaveText("с");
  await expect(page.locator('label[for="agreed-to"]')).toHaveText("по");
  await expect(page.locator('label[for="agreed-from"]')).toBeVisible();
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('label[for="agreed-from"]')).toBeVisible();
  await expect(page.locator('label[for="agreed-to"]')).toBeVisible();
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByLabel("Итоговая цена").fill("5960");
  await page.getByLabel("Дата визита").fill(dateIn(3));
  await page.getByLabel("Время с").fill("14:00");
  await page.getByLabel("Время по").fill("16:00");
  await page
    .getByLabel("Заметка владельца")
    .fill("Проверить пятно у подлокотника");
  await page.getByRole("button", { name: "Согласовать" }).click();

  await expect(page.getByText("Согласована", { exact: true }).first()).toBeVisible();

  await page.screenshot({
    path: "test-results/screens/admin-order-390.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 1280, height: 900 });

  // Та же заявка в таблице на десктопе
  await page.goto("/admin");
  await expect(
    page.getByText(/фото 1 · грязь/).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-1280.png",
    fullPage: true,
  });

  await page.goto("/admin/tariffs");
  await expect(
    page.getByRole("heading", { name: "Услуги и цены", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Правила расчёта")).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-tariffs-1280.png",
    fullPage: true,
  });

  await page.goto("/admin/company");
  await expect(page.getByRole("heading", { name: "Компания", level: 1 })).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-company-1280.png",
    fullPage: true,
  });

  await page.goto("/admin/access");
  await expect(page.getByRole("heading", { name: "Доступ", level: 1 })).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-access-1280.png",
    fullPage: true,
  });

  // Правка тарифа доходит до публичной страницы
  await page.goto("/admin/tariffs");
  const sofaVariant = page
    .locator('[data-testid="variant-card"]', { hasText: "2 места" })
    .first();
  await sofaVariant.locator("summary").click();
  await sofaVariant.getByLabel("Цена: Диван 2 места").fill("2600");
  await page.getByRole("button", { name: "Сохранить услуги и цены" }).click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("от 2 600 ₽").first()).toBeVisible();

  // Клиент видит изменения по приватной ссылке без перезагрузки
  await clientPage.bringToFront();
  await expect(clientPage.getByText("Согласованная цена")).toBeVisible({
    timeout: 45_000,
  });
  await expect(clientPage.getByText("5 960 ₽").first()).toBeVisible();
  await expect(clientPage.getByText("Согласована", { exact: true }).first()).toBeVisible();
  await expect(
    clientPage.getByText("Проверить пятно у подлокотника"),
  ).toHaveCount(0);
  const photo = clientPage.locator('img[alt^="Фото:"]').first();
  await expect(photo).toBeVisible();
  const loaded = await photo.evaluate(
    (element) => (element as HTMLImageElement).naturalWidth > 0,
  );
  expect(loaded).toBe(true);
  await clientPage.screenshot({
    path: "test-results/screens/order-390.png",
    fullPage: true,
  });

  // Кнопка «Обновить» работает
  await clientPage.getByRole("button", { name: "Обновить" }).click();
  await expect(clientPage.getByText(/Обновлено в \d{2}:\d{2}/)).toBeVisible();

  // Чужие/закрытые адреса
  const fresh = await context.browser()?.newContext();
  if (fresh) {
    const adminResponse = await fresh.request.get("/admin", {
      maxRedirects: 0,
    });
    expect(adminResponse.status()).toBe(307);
    await fresh.close();
  }

  const randomPhoto = await page.request.get(
    "/api/photos/00000000-0000-4000-8000-000000000000",
  );
  expect(randomPhoto.status()).toBe(404);

  const wrongOrder = await page.request.get("/api/orders/definitely-not-a-token");
  expect(wrongOrder.status()).toBe(404);

  const wrongPage = await page.goto("/z/definitely-not-a-token");
  expect(wrongPage?.status()).toBe(404);
});

test("повторная отправка с тем же ключом не создаёт дубль", async ({
  request,
  browser,
}) => {
  const key = `e2e-idempotency-${Date.now()}`;
  const payload = {
    items: [
      {
        tariffId: "sofa-2",
        quantity: 1,
        heavySoiling: false,
        secondSide: false,
      },
    ],
    customer: {
      name: "Дмитрий П.",
      phone: "+7 923 111-22-33",
      address: "Улица Мира, 5",
      outOfTown: false,
    },
    consent: true,
    idempotencyKey: key,
  };

  const first = await request.post("/api/orders", {
    multipart: { payload: JSON.stringify(payload) },
    headers: { origin: "http://localhost:3100" },
  });
  expect(first.status()).toBe(201);
  const a = (await first.json()) as { token: string };

  const second = await request.post("/api/orders", {
    multipart: { payload: JSON.stringify(payload) },
    headers: { origin: "http://localhost:3100" },
  });
  expect(second.status()).toBe(200);
  const b = (await second.json()) as { token: string };

  expect(a.token).toBe(b.token);

  // Заявка без флагов показывает «без доплат»
  const context = await browser.newContext({
    baseURL: "http://localhost:3100",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();

  const card = page.getByRole("link", { name: /Дмитрий П\./ });
  await expect(card).toBeVisible();
  await expect(card.getByText(/фото 0 · без доплат/)).toBeVisible();

  await context.close();
});
