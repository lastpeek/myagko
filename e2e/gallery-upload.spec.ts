import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");

test("загрузка фото: превью сразу, прогресс, отмена и черновик после закрытия", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();
  await page.goto("/admin/gallery");

  while ((await page.locator("article[data-photo-id]").count()) > 0) {
    const count = await page.locator("article[data-photo-id]").count();
    await page
      .locator("article[data-photo-id]")
      .first()
      .getByRole("button", { name: "Удалить фото" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await expect(page.locator("article[data-photo-id]")).toHaveCount(count - 1);
  }

  // Задерживаем ответ сервера, чтобы увидеть превью и прогресс.
  let release: (() => void) | null = null;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/gallery", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    await gate;
    await route.abort("failed").catch(() => undefined);
  });

  const buffer = fs.readFileSync(photoPath);
  await page.getByLabel("Загрузить фото работ").setInputFiles({
    name: "cancel-me.png",
    mimeType: "image/png",
    buffer,
  });

  const pending = page.locator("article[data-upload-id]");
  await expect(pending).toHaveCount(1);
  await expect(pending.getByRole("progressbar")).toBeVisible();
  await expect(pending.locator("img")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("1 / 24")).toBeVisible();

  await pending.getByRole("button", { name: "Отменить" }).click();
  await expect(pending).toHaveCount(0);
  release?.();
  await page.waitForTimeout(200);
  await page.unroute("**/api/admin/gallery");

  // Обрыв связи: карточка показывает ошибку, черновик остаётся в браузере.
  await page.route("**/api/admin/gallery", (route) => route.abort("failed"));
  await page.getByLabel("Загрузить фото работ").setInputFiles({
    name: "draft.png",
    mimeType: "image/png",
    buffer,
  });
  await expect(pending.getByText("Повторить")).toBeVisible();
  await expect(pending.getByText("Связь пропала. Попробуйте ещё раз.")).toBeVisible();
  await page.unroute("**/api/admin/gallery");

  // Закрываем страницу и открываем заново: черновик продолжает загрузку.
  const context = page.context();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto("/admin/gallery");
  await expect(reopened.locator("article[data-photo-id]")).toHaveCount(1);

  // Удаление исчезает сразу; при ошибке карточка возвращается и есть «Повторить».
  let failedDelete = false;
  await reopened.route("**/api/admin/gallery/*", async (route) => {
    if (route.request().method() === "DELETE" && !failedDelete) {
      failedDelete = true;
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.abort("failed").catch(() => undefined);
      return;
    }
    await route.continue();
  });

  await reopened
    .locator("article[data-photo-id]")
    .first()
    .getByRole("button", { name: "Удалить фото" })
    .click();
  await reopened
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить", exact: true })
    .click();
  await expect(reopened.locator("article[data-photo-id]")).toHaveCount(0);
  await expect(
    reopened
      .getByRole("alert")
      .filter({ hasText: "Не удалось удалить фото" }),
  ).toBeVisible();
  await expect(reopened.locator("article[data-photo-id]")).toHaveCount(1);

  await reopened.getByRole("button", { name: "Повторить" }).click();
  await expect(reopened.locator("article[data-photo-id]")).toHaveCount(0);
  await expect(reopened.getByText("Пока нет работ")).toBeVisible();
  await reopened.unroute("**/api/admin/gallery/*");
});
