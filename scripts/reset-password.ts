import "dotenv/config";

import { randomBytes } from "node:crypto";

import { closeDb, getDb } from "../src/lib/db";
import { setAdminPassword } from "../src/lib/auth";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}

async function main() {
  const email = (readArg("email") ?? process.env.ADMIN_EMAIL ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw new Error(
      "Укажите почту: npm run admin:reset -- --email=owner@example.ru",
    );
  }

  const provided = readArg("password");
  const password = provided ?? randomBytes(12).toString("base64url");

  if (password.length < 10) {
    throw new Error("Пароль короче 10 символов — не сохраняю.");
  }

  const updated = await setAdminPassword(getDb(), email, password, {
    mustChangePassword: true,
  });

  if (!updated) {
    throw new Error(`Пользователь ${email} не найден.`);
  }

  console.log(`Пароль для ${email} обновлён. Все старые сессии закрыты.`);
  if (!provided) {
    console.log(`Новый пароль: ${password}`);
    console.log("Сохраните его и передайте владельцу безопасным каналом.");
  }
  console.log("При следующем входе кабинет попросит сменить пароль.");

  await closeDb();
}

main().catch(async (error) => {
  console.error("Сброс не выполнен:", error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
