import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

const serverEnv = {
  DATABASE_URL: "pglite://.data/e2e",
  NEXT_PUBLIC_SITE_URL: baseURL,
  AUTH_SECRET: "e2e-secret-0123456789-abcdefghij",
  LOGIN_RATE_LIMIT: "20",
  ADMIN_EMAIL: "owner@myagko.ru",
  ADMIN_PASSWORD: "Myagko-demo-2026",
  PHOTO_STORAGE: "local",
  PHOTO_STORAGE_DIR: ".data/e2e-uploads",
  PORT: String(PORT),
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ru-RU",
    timezoneId: "Asia/Novosibirsk",
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "npm run build && npm run e2e:prepare && npm run start",
    url: baseURL,
    timeout: 300_000,
    reuseExistingServer: false,
    env: serverEnv,
    stdout: "pipe",
    stderr: "pipe",
  },
});
