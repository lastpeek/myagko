import { expect, test } from "@playwright/test";

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("услуги и цены: свёрнутое дерево, 1280/390, светлая и тёмная тема", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.goto("/admin/tariffs");
  await expect(
    page.getByRole("heading", { name: "Услуги и цены", level: 1 }),
  ).toBeVisible();

  // По умолчанию дерево свёрнуто.
  await expect(page.getByRole("button", { name: /^Открыть услугу:/ })).toHaveCount(0);

  // В демо-данных в каждой категории одна услуга — отдельной строки нет.
  await page.getByRole("button", { name: /^Открыть категорию:/ }).first().click();
  await expect(page.locator('[data-testid="service-card"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="single-service-card"]')).toHaveCount(1);
  await page.getByRole("button", { name: /^Открыть вариант:/ }).first().click();
  await expect(page.getByText("Параметр", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Единица (шт / м² / м.п.)").first()).toBeVisible();

  // Свернуть и снова открыть.
  await page.getByRole("button", { name: /^Свернуть вариант:/ }).first().click();
  await expect(page.getByLabel("Единица (шт / м² / м.п.)")).toHaveCount(0);
  await page.getByRole("button", { name: /^Открыть вариант:/ }).first().click();

  await page.setViewportSize({ width: 1280, height: 900 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-pricing-1280-light.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/screens/admin-pricing-1280-dark.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-pricing-390-dark.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-pricing-390-light.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/admin-pricing-360-light.png",
    fullPage: true,
  });
});
