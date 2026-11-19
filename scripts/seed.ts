import "dotenv/config";

import { closeDb, getDb } from "../src/lib/db";
import { seedDatabase } from "../src/lib/seed-data";

async function main() {
  const result = await seedDatabase(getDb(), { requireAdmin: true });

  if (result.adminCreated) {
    console.log(`Создан владелец ${process.env.ADMIN_EMAIL}. Пароль — из ADMIN_PASSWORD.`);
  } else {
    console.log("Владелец уже существует, пароль не меняю.");
  }

  console.log("Сид выполнен: компания, тарифы, доступ.");
  await closeDb();
}

main().catch(async (error) => {
  console.error("Сид не выполнен:", error instanceof Error ? error.message : error);
  await closeDb();
  process.exit(1);
});
