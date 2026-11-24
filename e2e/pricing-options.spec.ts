import { expect, test } from "@playwright/test";

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("опции: использование, группы, фильтр и редактор варианта", async ({
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
  await expect(
    page.getByText(
      "Доплаты, которые можно включать в вариантах. Сами по себе ни на что не влияют.",
    ),
  ).toBeVisible();

  const optionCard = (label: string) =>
    page
      .getByTestId("option-card")
      .filter({ has: page.getByLabel(`Название опции: ${label}`) });

  const soiling = optionCard("Сильные загрязнения");
  await expect(soiling).toBeVisible();
  await expect(soiling).toContainText("Используется в:");
  await expect(soiling).toContainText("Диван · 2 места");
  await expect(soiling).toContainText("Диван · 3 места");
  await expect(soiling).toContainText("Диван · Угловой");
  await expect(soiling).toContainText(/и ещё \d+/);
  await expect(soiling.getByLabel("Значение опции: Сильные загрязнения")).toHaveValue(
    "30",
  );
  await expect(soiling.getByText("%", { exact: true })).toBeVisible();

  const unusedGroup = page.getByTestId("options-unused");
  await expect(
    unusedGroup.getByRole("button", { name: /Не используются/ }),
  ).toHaveAttribute("aria-expanded", "false");

  // Новая опция сразу попадает в «Не используются».
  await page.getByRole("button", { name: "Опция", exact: true }).click();
  const unusedList = page.getByTestId("unused-options-list");
  await expect(unusedList).toBeVisible();
  const newOption = unusedList.locator('[data-testid="option-card"]').last();
  await newOption.getByLabel(/^Название опции:/).fill("Тестовая опция");
  const testOption = optionCard("Тестовая опция");
  await testOption.getByRole("button", { name: "За штуку", exact: true }).click();
  await testOption.getByLabel(/^Значение опции:/).fill("200");
  await expect(testOption).toContainText("₽ за штуку");
  await testOption
    .getByRole("button", { name: "За заказ", exact: true })
    .click();
  await expect(testOption).toContainText("₽ за заказ");
  await expect(testOption).toContainText("Используется в: весь заказ");
  await testOption.getByRole("button", { name: "За штуку", exact: true }).click();
  await expect(testOption).toContainText(
    "Не используется ни в одном варианте",
  );

  // Фильтр по открытой категории.
  await page.getByRole("button", { name: "Открыть категорию: Матрасы" }).click();
  await expect(
    page.getByText("Показаны опции категории «Матрасы»"),
  ).toBeVisible();
  await expect(optionCard("Сильные загрязнения")).toBeVisible();
  await expect(optionCard("Сильные загрязнения")).toContainText(
    "Матрас · Односпальный",
  );
  await expect(optionCard("Сильные загрязнения")).not.toContainText(
    "Диван · 2 места",
  );
  await expect(optionCard("Вторая сторона")).toBeVisible();
  await expect(
    page.getByLabel("Название опции: Тестовая опция"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Показать все" }).click();
  await expect(
    page.getByLabel("Название опции: Тестовая опция"),
  ).toBeVisible();

  // Доплаты внутри варианта: убрать, добавить из справочника, создать новую.
  await page.getByRole("button", { name: "Открыть категорию: Матрасы" }).click();
  const mattressCategory = page
    .locator('[data-testid="category-card"]')
    .filter({ hasText: "Матрасы" })
    .first();
  await mattressCategory
    .getByRole("button", { name: "Открыть вариант: Односпальный" })
    .click();
  const variant = mattressCategory
    .locator('[data-testid="variant-card"]')
    .filter({ hasText: "Односпальный" })
    .first();
  await expect(variant.getByText("Доплаты этого варианта")).toBeVisible();
  await expect(variant.getByTestId("variant-options")).toContainText(
    "Сильные загрязнения",
  );
  await expect(variant.getByTestId("variant-options")).toContainText(
    "Вторая сторона",
  );

  await variant
    .getByRole("button", { name: "Убрать доплату: Вторая сторона" })
    .click();
  await expect(variant.getByTestId("variant-options")).not.toContainText(
    "Вторая сторона",
  );

  await variant.getByRole("button", { name: "Добавить из справочника" }).click();
  await variant.getByRole("button", { name: /^Вторая сторона/ }).click();
  await expect(variant.getByTestId("variant-options")).toContainText(
    "Вторая сторона",
  );

  await variant.getByRole("button", { name: "Создать новую" }).click();
  await variant.getByLabel("Название новой доплаты").fill("Пятна от чая");
  await variant.getByLabel("Значение новой доплаты").fill("15");
  await variant.getByRole("button", { name: "Создать и добавить" }).click();
  await expect(variant.getByTestId("variant-options")).toContainText(
    "Пятна от чая",
  );
  await expect(variant.getByTestId("variant-options")).toContainText("+15 %");

  const teaOption = optionCard("Пятна от чая");
  await expect(teaOption).toContainText("Используется в:");
  await expect(teaOption).toContainText("Матрас · Односпальный");

  await page.setViewportSize({ width: 1280, height: 900 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-options-1280-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/screens/admin-options-1280-dark.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-options-390-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-options-390-light.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Сохранить услуги и цены" }).click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Услуги и цены", level: 1 }),
  ).toBeVisible();

  // После перезагрузки «Не используются» снова свёрнуты, но новая опция на месте.
  const reopenedUnused = page.getByTestId("options-unused");
  await expect(
    reopenedUnused.getByRole("button", { name: /Не используются/ }),
  ).toHaveAttribute("aria-expanded", "false");
  await reopenedUnused
    .getByRole("button", { name: /Не используются/ })
    .click();
  const reopenedTestOption = optionCard("Тестовая опция");
  await expect(reopenedTestOption).toContainText(
    "Не используется ни в одном варианте",
  );
  await reopenedTestOption
    .getByRole("button", { name: "Удалить опцию: Тестовая опция" })
    .click();
  await expect(optionCard("Тестовая опция")).toHaveCount(0);

  // Используемую опцию удалить нельзя — только скрыть.
  await optionCard("Сильные загрязнения")
    .getByRole("button", { name: "Удалить опцию: Сильные загрязнения" })
    .click();
  await expect(page.getByText(/Опция используется в вариантах/)).toBeVisible();
  await expect(page.getByText(/Доступна для привязки/).first()).toBeVisible();
  await expect(optionCard("Сильные загрязнения")).toBeVisible();

  // Новая доплата варианта сохранилась вместе со связью.
  await page.getByRole("button", { name: "Открыть категорию: Матрасы" }).click();
  const reopenedCategory = page
    .locator('[data-testid="category-card"]')
    .filter({ hasText: "Матрасы" })
    .first();
  await reopenedCategory
    .getByRole("button", { name: "Открыть вариант: Односпальный" })
    .click();
  const reopenedVariant = reopenedCategory
    .locator('[data-testid="variant-card"]')
    .filter({ hasText: "Односпальный" })
    .first();
  await expect(reopenedVariant.getByTestId("variant-options")).toContainText(
    "Пятна от чая",
  );
  await expect(reopenedVariant.getByTestId("variant-options")).toContainText(
    "Вторая сторона",
  );
});
