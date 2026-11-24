import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();
}

test.describe("тема по умолчанию", () => {
  test.use({ colorScheme: "dark" });

  test("светлая даже при тёмной системе, выбор запоминается", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--paper")
          .trim()
          .toLowerCase(),
      ),
    ).toBe("#f7f4ef");

    await page.getByRole("button", { name: "Сменить тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.getByRole("button", { name: "Сменить тему" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});

test("контакты: tel/mailto, копирование почты и территория за городом", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/");
  const footer = page.locator("footer");
  await expect(footer.locator('a[href^="tel:"]')).toHaveCount(1);
  await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(1);
  await expect(
    footer.getByRole("button", { name: "Скопировать почту" }),
  ).toBeVisible();

  const email = (await footer.locator('a[href^="mailto:"]').getAttribute("href"))!
    .replace(/^mailto:/, "");
  await footer.getByRole("button", { name: "Скопировать почту" }).click();
  await expect(
    footer.getByRole("button", { name: "Скопировать почту" }),
  ).toContainText("Скопировано");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(email);

  await login(page);
  await page.goto("/admin/company");
  const oldCity = await page.getByLabel("Город").inputValue();
  const oldTerritory = await page.getByLabel("Территория выезда").inputValue();

  try {
    await page.getByLabel("Город").fill("Красноярск");
    await expect(page.getByLabel("Территория выезда")).toHaveValue(
      /^Красноярск/,
    );
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText(/Сохранено/)).toBeVisible();

    await page.goto("/");
    await expect(page.locator("footer")).toContainText("Красноярск");
    await expect(page.locator("footer")).not.toContainText("Новосибирск");
    await expect(
      page.getByText(/Красноярск\. Пишите/),
    ).toHaveCount(0);
  } finally {
    await page.goto("/admin/company");
    await page.getByLabel("Город").fill(oldCity);
    await page.getByLabel("Территория выезда").fill(oldTerritory);
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText(/Сохранено/)).toBeVisible();
  }
});
