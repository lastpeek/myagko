import { expect, test } from "@playwright/test";
import path from "node:path";

const photoPath = path.join(process.cwd(), "e2e", "fixtures", "photo.png");

async function noHorizontalScroll(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("брендинг: логотип, favicon, PWA, заголовок вкладки и OG", async ({
  page,
}) => {
  test.setTimeout(240_000);

  await page.goto("/admin/login");
  await page.getByLabel("Почта").fill("owner@myagko.ru");
  await page.getByLabel("Пароль").fill("Myagko-demo-2026");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Заявки", level: 1 })).toBeVisible();

  await page.goto("/admin/company");
  const manager = page.getByTestId("logo-manager");
  await expect(manager.getByRole("img", { name: "Логотип" })).toHaveCount(0);

  // SVG отклоняем до отправки.
  await manager.getByLabel("Загрузить логотип").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    ),
  });
  await expect(
    manager.getByText("SVG не поддерживаем, загрузите PNG."),
  ).toBeVisible();
  await expect(manager.getByRole("img", { name: "Логотип" })).toHaveCount(0);
  expect((await page.request.get("/api/logo")).status()).toBe(404);

  // Сервер тоже отклоняет SVG, даже если тип файла подменён.
  const svgResponse = await page.request.post("/api/admin/logo", {
    headers: { Origin: "http://localhost:3100" },
    multipart: {
      file: {
        name: "logo.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
        ),
      },
    },
  });
  expect(svgResponse.status()).toBe(400);
  expect((await svgResponse.json()).error).toBe(
    "SVG не поддерживаем, загрузите PNG.",
  );
  expect((await page.request.get("/api/logo")).status()).toBe(404);

  // PNG загружается, превью 48×48 и кнопки замены/удаления.
  await manager.getByLabel("Загрузить логотип").setInputFiles(photoPath);
  const preview = manager.getByRole("img", { name: "Логотип" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", /^\/api\/logo\?v=/);
  const previewBox = await preview.boundingBox();
  expect(Math.round(previewBox!.width)).toBe(48);
  expect(Math.round(previewBox!.height)).toBe(48);
  await expect(manager.getByRole("button", { name: "Заменить" })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Заменить" })).toBeEnabled();
  await expect(manager.getByRole("button", { name: "Убрать" })).toBeVisible();

  const firstLogoUrl = await preview.getAttribute("src");
  const chooserPromise = page.waitForEvent("filechooser");
  await manager.getByRole("button", { name: "Заменить" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(photoPath);
  await expect(preview).toHaveAttribute("src", /^\/api\/logo\?v=/);
  await expect
    .poll(() => preview.getAttribute("src"))
    .not.toBe(firstLogoUrl);
  await expect(manager.getByRole("button", { name: "Заменить" })).toBeEnabled();

  // Публичные файлы: основной и иконки.
  const logoResponse = await page.request.get("/api/logo");
  expect(logoResponse.status()).toBe(200);
  expect(logoResponse.headers()["content-type"]).toContain("image/webp");
  expect(logoResponse.headers()["cache-control"]).toContain("max-age=3600");
  for (const size of [180, 192, 512]) {
    const response = await page.request.get(`/api/logo/${size}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  }

  // Шапка сайта 32×32, шапка кабинета 24×24.
  await page.goto("/");
  const siteLogo = page.locator("header [data-brand-logo]");
  await expect(siteLogo).toHaveCount(1);
  await expect(siteLogo).toHaveAttribute("src", /^\/api\/logo\?v=/);
  const siteBox = await siteLogo.boundingBox();
  expect(Math.round(siteBox!.width)).toBe(32);
  expect(Math.round(siteBox!.height)).toBe(32);
  await expect(page.locator('link[rel="icon"][href*="/api/logo/192"]')).toHaveCount(
    1,
  );

  await page.goto("/admin/company");
  const adminLogo = page.locator("header [data-brand-logo]");
  await expect(adminLogo).toHaveCount(1);
  const adminBox = await adminLogo.boundingBox();
  expect(Math.round(adminBox!.width)).toBe(24);
  expect(Math.round(adminBox!.height)).toBe(24);

  // Пока поле пустое — старый заголовок и старое имя manifest.
  await page.goto("/");
  const defaultTitle = "Мягко — услуги на выезде в Новосибирск";
  await expect(page).toHaveTitle(defaultTitle);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    defaultTitle,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /\/api\/logo\?v=/,
  );

  let manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe(defaultTitle);
  expect(manifest.short_name).toBe("Мягко");
  expect(manifest.icons.map((icon: { src: string }) => icon.src)).toEqual([
    expect.stringContaining("/api/logo/192"),
    expect.stringContaining("/api/logo/512"),
  ]);

  // Пользовательский заголовок — ровно как введён.
  await page.goto("/admin/company");
  await page
    .getByLabel("Заголовок вкладки браузера")
    .fill("Химчистка мебели в Красноярске");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();

  await page.goto("/");
  await expect(page).toHaveTitle("Химчистка мебели в Красноярске");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    "Химчистка мебели в Красноярске",
  );
  manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.name).toBe("Химчистка мебели в Красноярске");
  expect(manifest.short_name).toBe("Мягко");

  // 1280/390, обе темы.
  await page.setViewportSize({ width: 1280, height: 900 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/branding-1280-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "test-results/screens/branding-1280-dark.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/branding-390-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: "test-results/screens/branding-390-light.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 360, height: 800 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/branding-360-light.png",
    fullPage: true,
  });

  // Кабинет: логотип и заголовок на 1280/390 в обеих темах.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/company");
  await expect(page.getByTestId("logo-manager")).toBeVisible();
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/branding-company-1280-light.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "test-results/screens/branding-company-1280-dark.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await noHorizontalScroll(page);
  await page.screenshot({
    path: "test-results/screens/branding-company-390-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Сменить тему" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.waitForTimeout(250);
  await page.screenshot({
    path: "test-results/screens/branding-company-390-light.png",
    fullPage: true,
  });

  // Убираем логотип — возвращается иконка по умолчанию.
  await page.getByTestId("logo-manager").getByRole("button", { name: "Убрать" }).click();
  await expect(
    page.getByTestId("logo-manager").getByRole("img", { name: "Логотип" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/logo")).status()).toBe(404);
  expect((await page.request.get("/api/logo/192")).status()).toBe(404);

  await page.goto("/");
  await expect(page.locator("header [data-brand-logo]")).toHaveCount(0);
  await expect(page.locator('link[rel="icon"][href*="/api/logo"]')).toHaveCount(0);
  await expect(
    page.locator('link[rel="icon"][href*="/icons/icon"]'),
  ).toHaveCount(3);

  // Пустой заголовок возвращает старый шаблон.
  await page.goto("/admin/company");
  await page.getByLabel("Заголовок вкладки браузера").fill("");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(/Сохранено/)).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveTitle(defaultTitle);
});
