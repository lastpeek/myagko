import { expect, test } from "@playwright/test";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");

async function expectNoHorizontalScroll(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("фото с главной: добавление, повтор без дубля, отмена, лимит, «Другое»", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const photoButton = page.getByRole("button", { name: "Добавить фото" });
  await expect(photoButton).toBeVisible();
  await expect(photoButton.locator("span")).toHaveText("Добавить фото");

  const primary = page.getByRole("button", { name: "В корзину" });
  const primaryBox = await primary.boundingBox();
  const photoBox = await photoButton.boundingBox();
  expect(photoBox!.height).toBeGreaterThanOrEqual(54);
  expect(Math.abs(primaryBox!.y - photoBox!.y)).toBeLessThan(3);
  expect(photoBox!.width).toBeGreaterThan(54);
  expect(primaryBox!.width).toBeGreaterThan(photoBox!.width);
  await page.screenshot({
    path: "test-results/screens/home-photo-390.png",
    fullPage: true,
  });

  // Первый тап: позиция в корзине + выбор файла
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    photoButton.click(),
  ]);
  await expect(
    page.getByRole("link", { name: /Корзина, позиций: 1/ }),
  ).toBeVisible();
  await chooser.setFiles(photoPath);

  await expect(page.getByText("фото 1 / 3")).toBeVisible();
  const moreButton = page.getByRole("button", { name: "Добавить фото" });
  await expect(moreButton.locator("span")).toHaveText("Ещё фото");
  await expect(
    page.getByRole("link", { name: /Корзина, позиций: 1/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/home-photo-390-1.png",
    fullPage: true,
  });

  // Повторный тап не добавляет вторую позицию; отмена выбора ничего не ломает
  const [cancelChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    moreButton.click(),
  ]);
  await cancelChooser.setFiles([]);
  await expect(
    page.getByRole("link", { name: /Корзина, позиций: 1/ }),
  ).toBeVisible();
  await expect(page.getByText("фото 1 / 3")).toBeVisible();

  // Неверный тип файла: ошибка у панели, позиция и фото на месте
  const [badChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Добавить фото" }).click(),
  ]);
  await badChooser.setFiles({
    name: "note.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("не фото"),
  });
  await expect(page.getByText("Нужен JPG, PNG, WebP.")).toBeVisible();
  await expect(page.getByText("фото 1 / 3")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Корзина, позиций: 1/ }),
  ).toBeVisible();

  // Добираем до трёх
  for (const expected of [2, 3]) {
    const [nextChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Добавить фото" }).click(),
    ]);
    await nextChooser.setFiles(photoPath);
    await expect(page.getByText(`фото ${expected} / 3`)).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Добавить фото" })).toHaveCount(0);
  await expect(page.getByText("фото 3 / 3")).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/home-photo-390-full.png",
    fullPage: true,
  });

  // В корзине та же позиция и те же три фото
  await page.getByRole("link", { name: /Корзина/ }).click();
  await expect(page.getByRole("heading", { name: "Заявка", level: 1 })).toBeVisible();
  await expect(page.getByText("1 позиция")).toBeVisible();
  await expect(page.getByText("Фото: 3 / 3")).toBeVisible();
  await expect(page.locator('article img[alt^="Фото:"]')).toHaveCount(3);

  // На оформлении — те же фото
  await page.getByRole("button", { name: "Оформить заявку" }).click();
  await expect(page.getByRole("heading", { name: "Оформление" })).toBeVisible();
  await expect(page.getByText("Фото 3 / 3")).toBeVisible();
  await expect(page.locator('img[alt^="Фото:"]')).toHaveCount(3);

  // 360: вторичная кнопка — квадрат 54×54 без текста, без переполнения
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Кресло/ }).click();

  const square = page.getByRole("button", { name: "Добавить фото" });
  await expect(square).toBeVisible();
  const squareBox = await square.boundingBox();
  expect(squareBox!.width).toBe(54);
  expect(squareBox!.height).toBe(54);
  await expect(square.locator("span")).toBeHidden();
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/home-photo-360.png",
    fullPage: true,
  });

  // 414: текст возвращается, кнопки в ряд
  await page.setViewportSize({ width: 414, height: 900 });
  await expect(square.locator("span")).toBeVisible();
  const wideBox = await square.boundingBox();
  expect(wideBox!.width).toBeGreaterThan(54);
  await expectNoHorizontalScroll(page);
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(400);
  await expect(square).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/home-photo-414-dark.png",
    fullPage: true,
  });

  // «Другое»: кнопки фото на главной нет, подпись прежняя
  await page.getByRole("button", { name: /^Другое/ }).click();
  await expect(page.getByRole("button", { name: "Добавить фото" })).toHaveCount(0);
  await expect(page.getByText("Цену назовёт мастер")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
