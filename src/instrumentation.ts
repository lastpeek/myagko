/**
 * Миграции и первый сид при старте контейнера на VPS.
 * На Vercel переменные RUN_MIGRATIONS / SEED_ON_START не задаются:
 * там миграции запускают вручную.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.RUN_MIGRATIONS !== "1" && process.env.SEED_ON_START !== "1") {
    return;
  }

  const { runMigrations, getDb } = await import("@/lib/db");

  if (process.env.RUN_MIGRATIONS === "1") {
    await runMigrations();
  }

  if (process.env.SEED_ON_START === "1") {
    const { seedDatabase } = await import("@/lib/seed-data");
    const result = await seedDatabase(getDb(), { requireAdmin: false });
    if (result.adminMissing) {
      console.warn(
        "seed_skipped_admin: задайте ADMIN_EMAIL и ADMIN_PASSWORD, чтобы создать владельца.",
      );
    }
  }
}
