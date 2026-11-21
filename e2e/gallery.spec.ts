import { expect, test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");
const uploadsDir = path.join(process.cwd(), ".data", "e2e-uploads");

function uploadCount(): number {
  return fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).length : 0;
}

async function expectNoHorizontalScroll(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("галерея работ: загрузка, порядок, скрытие, удаление, лайтбокс", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "Работы" }).click();
  await expect(page.getByRole("heading", { name: "Работы", level: 1 })).toBeVisible();
  await expect(page.getByText("Пока нет работ")).toBeVisible();
  await expect(
    page.getByText("Добавьте 3–5 фото — блок появится на сайте."),
  ).toBeVisible();

  const fileBuffer = fs.readFileSync(photoPath);
  await page.getByLabel("Загрузить фото работ").setInputFiles([
    { name: "work-1.png", mimeType: "image/png", buffer: fileBuffer },
    { name: "work-2.png", mimeType: "image/png", buffer: fileBuffer },
    { name: "work-3.png", mimeType: "image/png", buffer: fileBuffer },
  ]);

  const cards = page.locator("article[data-photo-id]");
  await expect(cards).toHaveCount(3);
  await expect(page.getByText("3 / 24")).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/admin-gallery-390.png",
    fullPage: true,
  });

  const captions = [
    "Диван после чистки",
    "Кресло после чистки",
    "Матрас после чистки",
  ];

  for (let index = 0; index < captions.length; index += 1) {
    const card = cards.nth(index);
    await card.getByLabel("Подпись", { exact: true }).fill(captions[index]!);
    await card.getByRole("button", { name: "Сохранить подпись" }).click();
    await expect(card.getByText("Подпись сохранена")).toBeVisible();
  }

  // Блок появился на главной с подписями
  await page.goto("/");
  await expect(page.getByText("Наши работы")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Мебель после чистки" }),
  ).toBeVisible();
  await expect(page.locator("[data-gallery-grid] figure")).toHaveCount(3);
  expect(await page.locator("[data-gallery-grid] figcaption").allTextContents()).toEqual(
    captions,
  );

  // Лайтбокс: стрелка, Esc, фон
  await page.getByRole("button", { name: /Открыть фото/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Просмотр работ" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("1 / 3")).toBeVisible();
  await expect(dialog.getByText("Диван после чистки")).toBeVisible();

  await dialog.getByRole("button", { name: "Следующее фото" }).click();
  await expect(dialog.getByText("2 / 3")).toBeVisible();
  await expect(dialog.getByText("Кресло после чистки")).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/gallery-lightbox-390.png",
    fullPage: false,
  });

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: /Открыть фото/ }).first().click();
  await page.mouse.click(30, 60);
  await expect(dialog).toHaveCount(0);

  // Свайп на телефоне переключает фото
  await page.getByRole("button", { name: /Открыть фото/ }).first().click();
  await page.evaluate(() => {
    const el = document.querySelector('[role="dialog"]');
    if (!el) return;
    const start = new Touch({
      identifier: 1,
      target: el,
      clientX: 320,
      clientY: 400,
    });
    const end = new Touch({
      identifier: 1,
      target: el,
      clientX: 80,
      clientY: 400,
    });
    el.dispatchEvent(
      new TouchEvent("touchstart", { touches: [start], bubbles: true }),
    );
    el.dispatchEvent(
      new TouchEvent("touchend", { changedTouches: [end], bubbles: true }),
    );
  });
  await expect(dialog.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("Escape");

  // Порядок: третье фото выше
  await page.goto("/admin/gallery");
  await expect(cards).toHaveCount(3);
  await cards.nth(2).getByRole("button", { name: "Поднять фото выше" }).click();
  await expect
    .poll(() =>
      page
        .locator("article[data-photo-id] input[id^='caption-']")
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLInputElement).value),
        ),
    )
    .toEqual([
      "Диван после чистки",
      "Матрас после чистки",
      "Кресло после чистки",
    ]);

  await page.goto("/");
  expect(await page.locator("[data-gallery-grid] figcaption").allTextContents()).toEqual(
    [
      "Диван после чистки",
      "Матрас после чистки",
      "Кресло после чистки",
    ],
  );

  // Скрытие убирает фото с сайта, публичный роут — 404
  await page.goto("/admin/gallery");
  const hiddenCard = cards.nth(2);
  const hiddenId = await hiddenCard.getAttribute("data-photo-id");
  expect(hiddenId).toBeTruthy();
  await hiddenCard.getByRole("button", { name: "Скрыть" }).click();
  await expect(hiddenCard.getByText("Скрыто", { exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.locator("[data-gallery-grid] figure")).toHaveCount(2);
  await expect(page.getByText("Кресло после чистки")).toHaveCount(0);

  const hiddenResponse = await page.request.get(`/api/gallery/${hiddenId}`);
  expect(hiddenResponse.status()).toBe(404);

  const visibleId = await page
    .locator("[data-gallery-grid] img")
    .first()
    .getAttribute("src");
  const visibleResponse = await page.request.get(visibleId!);
  expect(visibleResponse.status()).toBe(200);
  expect(visibleResponse.headers()["content-type"]).toContain("image/webp");

  const privateResponse = await page.request.get(`/api/photos/${hiddenId}`);
  expect(privateResponse.status()).toBe(404);

  // Удаление: строка, файл и фото на сайте
  await page.goto("/admin/gallery");
  const filesBefore = uploadCount();
  expect(filesBefore).toBe(3);

  const toDelete = page.locator("article[data-photo-id]").first();
  await toDelete.getByRole("button", { name: "Удалить фото" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Удалить", exact: true })
    .click();

  await expect(page.locator("article[data-photo-id]")).toHaveCount(2);
  expect(uploadCount()).toBe(filesBefore - 1);

  // Пустое состояние скрывает секцию
  for (let index = 0; index < 2; index += 1) {
    await page
      .locator("article[data-photo-id]")
      .first()
      .getByRole("button", { name: "Удалить фото" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await expect(page.locator("article[data-photo-id]")).toHaveCount(1 - index);
  }

  await expect(page.getByText("Пока нет работ")).toBeVisible();
  expect(uploadCount()).toBe(0);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Мебель после чистки" }),
  ).toHaveCount(0);
});

test("галерея: сетка 2/2/3 и обе темы без переполнения", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();
  await page.goto("/admin/gallery");

  // Тест не зависит от предыдущего: убираем оставшиеся фото, если есть
  while ((await page.locator("article[data-photo-id]").count()) > 0) {
    const before = await page.locator("article[data-photo-id]").count();
    await page
      .locator("article[data-photo-id]")
      .first()
      .getByRole("button", { name: "Удалить фото" })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Удалить", exact: true })
      .click();
    await expect(page.locator("article[data-photo-id]")).toHaveCount(before - 1);
  }

  const buffer = fs.readFileSync(photoPath);
  await page.getByLabel("Загрузить фото работ").setInputFiles([
    { name: "grid-1.png", mimeType: "image/png", buffer },
    { name: "grid-2.png", mimeType: "image/png", buffer },
    { name: "grid-3.png", mimeType: "image/png", buffer },
  ]);
  await expect(page.getByText("3 / 24")).toBeVisible();
  await expect(page.locator("article[data-photo-id]")).toHaveCount(3);

  await page.goto("/");
  const grid = page.locator("[data-gallery-grid]");

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expectNoHorizontalScroll(page);
    const columns = await grid.evaluate(
      (el) =>
        getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean)
          .length,
    );
    expect(columns).toBe(2);
  }

  await page.setViewportSize({ width: 768, height: 900 });
  await expectNoHorizontalScroll(page);
  expect(
    await grid.evaluate(
      (el) =>
        getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean)
          .length,
    ),
  ).toBe(2);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expectNoHorizontalScroll(page);
  expect(
    await grid.evaluate(
      (el) =>
        getComputedStyle(el).gridTemplateColumns.split(/\s+/).filter(Boolean)
          .length,
    ),
  ).toBe(3);
  await page.screenshot({
    path: "test-results/screens/gallery-1280.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(400);
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/gallery-390-dark.png",
    fullPage: true,
  });
});
