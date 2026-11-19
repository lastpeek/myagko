import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * Готовит отдельную базу и папку фото для E2E.
 * Переменные окружения приходят из playwright.config.ts.
 */
fs.rmSync(".data/e2e", { recursive: true, force: true });
fs.rmSync(".data/e2e-uploads", { recursive: true, force: true });

execSync("npx tsx scripts/migrate.ts", { stdio: "inherit" });
execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
