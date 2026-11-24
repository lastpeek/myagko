import { expect, test } from "@playwright/test";

test("подписи стула, кресла и матраса совпадают на сайте и в кабинете", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");

  // Подписи карточек на главной
  await expect(page.getByText("Только сиденье или весь стул")).toBeVisible();
  await expect(page.getByText("Обычное или с откидной спинкой")).toBeVisible();
  await expect(page.getByText("С одной или двумя сторонами")).toBeVisible();

  // Варианты стула из БД
  await page.getByRole("button", { name: /^Стул/ }).click();
  await expect(
    page.getByRole("button", { name: "Только сиденье", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Сиденье и спинка", exact: true }),
  ).toBeVisible();

  // В корзине и на оформлении — та же формулировка и цена
  await page.getByRole("button", { name: "Сиденье и спинка", exact: true }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();

  await expect(
    page.getByRole("heading", { name: "Стул · Сиденье и спинка" }),
  ).toBeVisible();
  await expect(page.getByText("700 ₽").first()).toBeVisible();

  await page.getByRole("button", { name: "Оформить заявку" }).click();
  await expect(page.getByRole("heading", { name: "Оформление" })).toBeVisible();
  await expect(page.getByText("Стул · Сиденье и спинка")).toBeVisible();
  await expect(page.getByText("700 ₽").first()).toBeVisible();

  // Кабинет: те же названия вариантов и прежние цены
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.goto("/admin/tariffs");
  await expect(
    page.getByRole("heading", { name: "Услуги и цены", level: 1 }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Открыть категорию: Стулья" })
    .click();
  await page
    .getByRole("button", { name: "Открыть вариант: Только сиденье" })
    .click();
  await expect(page.getByLabel("Цена: Стул Только сиденье")).toHaveValue("500");
  await page
    .getByRole("button", { name: "Открыть вариант: Сиденье и спинка" })
    .click();
  await expect(page.getByLabel("Цена: Стул Сиденье и спинка")).toHaveValue("700");

  await page
    .getByRole("button", { name: "Открыть категорию: Кресла" })
    .click();
  await page
    .getByRole("button", { name: "Открыть вариант: Обычное" })
    .click();
  await expect(page.getByLabel("Цена: Кресло Обычное")).toHaveValue("1200");
  await page
    .getByRole("button", { name: "Открыть вариант: Реклайнер" })
    .click();
  await expect(page.getByLabel("Цена: Кресло Реклайнер")).toHaveValue("1800");

  await page
    .getByRole("button", { name: "Открыть категорию: Матрасы" })
    .click();
  await page
    .getByRole("button", { name: "Открыть вариант: Односпальный" })
    .click();
  await expect(page.getByLabel("Цена: Матрас Односпальный")).toHaveValue("1500");
  await page
    .getByRole("button", { name: "Открыть вариант: Двуспальный" })
    .click();
  await expect(page.getByLabel("Цена: Матрас Двуспальный")).toHaveValue("2400");

  await page
    .getByRole("button", { name: "Открыть категорию: Стулья" })
    .click();
  await expect(page.getByText("Только сиденье", { exact: true })).toBeVisible();
  await expect(page.getByText("Сиденье и спинка", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-tariffs-labels.png",
    fullPage: true,
  });

  // На главной цена стула осталась 500/700, подпись варианта — новая
  await page.goto("/");
  await page.getByRole("button", { name: /^Стул/ }).click();
  await expect(page.getByText("от 500 ₽").first()).toBeVisible();
  await expect(
    page.getByText("Стул · Только сиденье").filter({ visible: true }).first(),
  ).toBeVisible();
});
