import { expect, test } from "@playwright/test";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(1);
}

test("360px: главная, корзина, политика без горизонтального скролла", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "В корзину" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/home-360.png",
    fullPage: true,
  });

  await page.goto("/cart");
  await expect(page.getByText("Пока пусто")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Политика конфиденциальности" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("390 и 1280: вёрстка и тёмная тема", async ({ page }) => {
  await page.goto("/");
  await page.screenshot({
    path: "test-results/screens/home-390.png",
    fullPage: true,
  });
  await expectNoHorizontalScroll(page);

  // Тёмная тема
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(400);
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/home-390-dark.png",
    fullPage: true,
  });

  // Тёмная тема переживает перезагрузку
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/home-1280.png",
    fullPage: true,
  });

  await page.goto("/admin/login");
  await expectNoHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/login-1280.png",
    fullPage: true,
  });
});

test("prefers-reduced-motion не ломает страницу", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: /^Матрас/ }).click();
  await page.getByRole("button", { name: "Двуспальный" }).click();
  await expectNoHorizontalScroll(page);

  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await expectNoHorizontalScroll(page);
});

test("служебные маршруты и заголовки", async ({ request }) => {
  const health = await request.get("/api/health");  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ ok: true });
  expect(health.headers()["cache-control"]).toContain("no-store");

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const manifestJson = (await manifest.json()) as {
    name?: string;
    display?: string;
    icons?: unknown[];
  };
  expect(manifestJson.name).toContain("Мягко");
  expect(manifestJson.display).toBe("standalone");
  expect((manifestJson.icons ?? []).length).toBeGreaterThanOrEqual(3);

  const robots = await request.get("/robots.txt");
  const robotsText = await robots.text();
  expect(robotsText).toContain("Disallow: /admin");
  expect(robotsText).toContain("Sitemap:");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("/privacy");

  const privatePage = await request.get("/z/unknown-token-12345");
  expect(privatePage.status()).toBe(404);
  expect(privatePage.headers()["x-robots-tag"]).toContain("noindex");

  const offline = await request.get("/offline");
  expect(offline.status()).toBe(200);
  expect(await offline.text()).toContain("Нет соединения");
});

test("корзина: минимум в трёх состояниях", async ({ page }) => {
  // 1) Ниже минимума: кресло 1 200 → добавлено 1 300
  await page.goto("/");
  await page.getByRole("button", { name: /^Кресло/ }).click();
  await page.getByRole("button", { name: "Обычное", exact: true }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();

  await expect(
    page.getByText(/Минимальный заказ 2\s500\s₽ — добавлено 1\s300\s₽/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/cart-min-below.png",
    fullPage: true,
  });

  // 2) Равно минимуму: диван 2 места — 2 500, доплата не нужна
  await page.evaluate(() => localStorage.removeItem("myagko.cart.v1"));
  await page.goto("/");
  await page.getByRole("button", { name: /^Диван/ }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();

  await expect(
    page.getByText(/Минимальный заказ 2\s500\s₽ за чистку — выполнен/),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/cart-min-equal.png",
    fullPage: true,
  });

  // 3) Только «Другое»: про минимум не пишем вовсе
  await page.evaluate(() => localStorage.removeItem("myagko.cart.v1"));
  await page.goto("/");
  await page.getByRole("button", { name: /^Другое/ }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();

  await expect(page.getByText(/Минимальный заказ/)).toHaveCount(0);
  await expect(page.getByText("По фото").first()).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/cart-min-other.png",
    fullPage: true,
  });
});

test("оформление: фото «Другого» обязательно, плитка не переполняется на 360/390/414", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /^Другое/ }).click();
  await page.getByRole("button", { name: "В корзину" }).click();
  await page.getByRole("link", { name: /Корзина/ }).click();
  await page
    .getByLabel("Что почистить")
    .fill("Изголовье кровати и две подушки");
  await page.getByRole("button", { name: "Оформить заявку" }).click();

  await expect(page.getByRole("heading", { name: "Оформление" })).toBeVisible();
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(400);

  const warning = page.getByText(/У «Другого» нет фото/);
  await expect(warning).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить заявку" })).toBeDisabled();

  const tile = page.getByRole("button", {
    name: /Добавить фото к позиции «Другое/,
  });
  await expect(tile).toBeVisible();

  await page.screenshot({
    path: "test-results/screens/checkout-other-360-dark-before.png",
    fullPage: true,
  });

  for (const width of [360, 390, 414]) {
    await page.setViewportSize({ width, height: 800 });
    const metrics = await tile.evaluate((el) => {
      const span = el.querySelector("span") as HTMLElement;
      const style = getComputedStyle(span);
      return {
        buttonScroll: el.scrollWidth,
        buttonClient: el.clientWidth,
        spanScroll: span.scrollWidth,
        spanClient: span.clientWidth,
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        fontSize: style.fontSize,
      };
    });

    expect(metrics.whiteSpace).toBe("nowrap");
    expect(metrics.textOverflow).toBe("ellipsis");
    expect(metrics.buttonScroll).toBeLessThanOrEqual(metrics.buttonClient);
    expect(metrics.spanScroll).toBeLessThanOrEqual(metrics.spanClient);
    expect(["10px", "11px"]).toContain(metrics.fontSize);
    await expectNoHorizontalScroll(page);
  }

  await page.setViewportSize({ width: 360, height: 800 });

  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    tile.click(),
  ]);
  await chooser.setFiles(photoPath);

  await expect(page.getByText("Фото 1 / 3")).toBeVisible();
  await expect(warning).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Удалить фото" })).toBeVisible();
  await page.screenshot({
    path: "test-results/screens/checkout-other-360-dark.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "Удалить фото" }).click();
  await expect(warning).toBeVisible();
  await expect(tile.getByText("без фото")).toBeVisible();
  await expect(page.getByText("Фото 0 / 3")).toBeVisible();
});

test("service worker кеширует офлайн-экран", async ({ page }) => {
  await page.goto("/");

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          navigator.serviceWorker.getRegistrations().then((list) => list.length),
        ),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const cache = await caches.open("myagko-shell-v1");
          return Boolean(await cache.match("/offline"));
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
});
