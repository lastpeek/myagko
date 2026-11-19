import "dotenv/config";

import { closeDb, runMigrations } from "../src/lib/db";

async function main() {
  await runMigrations();
  await closeDb();
  console.log("Миграции применены.");
}

main().catch((error) => {
  console.error("Не удалось применить миграции:", error);
  process.exit(1);
});
