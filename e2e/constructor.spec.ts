import { expect, test } from "@playwright/test";

test("новая услуга из кабинета считается на сайте и не меняет старую заявку", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.goto("/admin/tariffs");
  await expect(
    page.getByRole("heading", { name: "Услуги и цены", level: 1 }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Категория" }).click();
  const categoryCard = page.locator('[data-testid="category-card"]').last();
  await categoryCard
    .locator('input[aria-label^="Название категории"]')
    .fill("Потолки E2E");

  await categoryCard.getByRole("button", { name: "Добавить услугу" }).click();
  await expect(categoryCard.locator('[data-testid="service-card"]')).toHaveCount(0);
  const singleService = categoryCard.locator('[data-testid="single-service-card"]');
  await singleService
    .locator('input[aria-label^="Название услуги"]')
    .fill("Потолок E2E");

  await categoryCard.getByRole("button", { name: "Вариант" }).click();
  const variantCard = categoryCard.locator('[data-testid="variant-card"]').last();
  await variantCard.getByLabel("Название").fill("Матовый E2E");
  await variantCard.getByLabel("Единица (шт / м² / м.п.)").fill("м²");
  await variantCard.getByLabel("Подпись параметра").fill("Площадь");
  await variantCard.getByLabel(/^Цена:/).fill("300");
  await variantCard.getByLabel("Мин").fill("1");
  await variantCard.getByLabel("Макс").fill("1000");
  await variantCard.getByLabel("Шаг").fill("0.1");

  // Вторая услуга включает обычное дерево с отдельными строками.
  await categoryCard.getByRole("button", { name: "Добавить услугу" }).click();
  await expect(categoryCard.locator('[data-testid="service-card"]')).toHaveCount(2);
  await expect(
    categoryCard.getByRole("button", { name: /^(Открыть|Свернуть) услугу:/ }),
  ).toHaveCount(2);
  await categoryCard
    .getByRole("button", { name: "Удалить услугу: Новая услуга" })
    .click();
  await expect(categoryCard.locator('[data-testid="service-card"]')).toHaveCount(0);

  const categoryCards = page.locator('[data-testid="category-card"]');
  await categoryCards
    .last()
    .locator('[data-testid="drag-handle"]')
    .first()
    .dragTo(categoryCards.first());
  await expect(
    categoryCards
      .first()
      .locator('input[aria-label^="Название категории"]'),
  ).toHaveValue("Потолки E2E");

  await page
    .getByRole("button", { name: "Сохранить услуги и цены" })
    .click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();

  await page
    .locator("#test-variant")
    .selectOption({ label: "Потолок E2E · Матовый E2E" });
  await page.locator("#test-value").fill("20.5");
  await expect(page.getByText("6 150 ₽").first()).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: /^Потолки E2E/ }).click();
  await expect(page.getByText("Потолок E2E").first()).toBeVisible();
  await page.getByRole("button", { name: "Матовый E2E" }).click();
  await page.getByLabel("Площадь").fill("20.5");
  await expect(page.getByText("6 150 ₽").first()).toBeVisible();
  await page.getByRole("button", { name: "В корзину" }).click();

  await page.getByRole("link", { name: /Корзина/ }).click();
  await expect(
    page.getByRole("heading", { name: "Потолок E2E · Матовый E2E" }),
  ).toBeVisible();
  await expect(page.getByText("6 150 ₽").first()).toBeVisible();
  await page.getByRole("button", { name: "Оформить заявку" }).click();

  await page.getByLabel("Как вас зовут").fill("Тест Конструктор");
  await page.getByLabel("Телефон").fill("+7 913 555-33-22");
  await page.getByLabel("Адрес", { exact: true }).fill("Улица Тестовая, 7");
  await page.getByLabel(/Согласен на обработку/).check();
  await page.getByRole("button", { name: "Отправить заявку" }).click();

  await expect(page.getByText("Заявка отправлена")).toBeVisible({
    timeout: 30_000,
  });
  const orderUrl = page.url().replace(/\?.*$/, "");
  await expect(page.getByText("6 150 ₽").first()).toBeVisible();

  await page.goto("/admin/tariffs");
  await page
    .getByRole("button", { name: "Открыть категорию: Потолки E2E" })
    .click();
  const persistedVariant = page
    .locator('[data-testid="variant-card"]', { hasText: "Матовый E2E" })
    .first();
  await persistedVariant
    .getByRole("button", { name: "Открыть вариант: Матовый E2E" })
    .click();
  await persistedVariant.getByLabel(/^Цена:/).fill("350");
  await page
    .getByRole("button", { name: "Сохранить услуги и цены" })
    .click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("от 350 ₽").first()).toBeVisible();

  await page.goto(orderUrl);
  await expect(page.getByText("6 150 ₽").first()).toBeVisible();
});
