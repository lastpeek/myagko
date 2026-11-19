import fs from "node:fs/promises";
import path from "node:path";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSession,
  destroyAllUserSessions,
  findSessionUser,
  setAdminPassword,
} from "@/lib/auth";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { seedDatabase } from "@/lib/seed-data";

const DB_PATH = path.join(process.cwd(), ".data", "seed-test");
const EMAIL = "seed-owner@test.local";

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.AUTH_SECRET = "seed-test-secret-0123456789";
process.env.ADMIN_EMAIL = EMAIL;
process.env.ADMIN_PASSWORD = "Seed-password-2026";
delete process.env.ADMIN_MUST_CHANGE_PASSWORD;

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await runMigrations();
});

afterAll(async () => {
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
});

describe("сид владельца", () => {
  it("по умолчанию не требует смену пароля", async () => {
    const db = getDb();
    const result = await seedDatabase(db, { requireAdmin: true });
    expect(result.adminCreated).toBe(true);

    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, EMAIL));

    expect(rows[0]?.mustChangePassword).toBe(false);
    expect(rows[0]?.passwordChangedAt).not.toBeNull();
  });

  it("переменная ADMIN_MUST_CHANGE_PASSWORD включает требование смены", async () => {
    const db = getDb();
    process.env.ADMIN_MUST_CHANGE_PASSWORD = "true";
    process.env.ADMIN_EMAIL = "flagged-owner@test.local";

    const result = await seedDatabase(db, { requireAdmin: true });
    expect(result.adminCreated).toBe(true);

    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, "flagged-owner@test.local"));

    expect(rows[0]?.mustChangePassword).toBe(true);
    expect(rows[0]?.passwordChangedAt).toBeNull();

    delete process.env.ADMIN_MUST_CHANGE_PASSWORD;
    process.env.ADMIN_EMAIL = EMAIL;
  });
});

describe("сброс пароля через CLI-логику", () => {
  it("включает принудительную смену и гасит старые сессии", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, EMAIL));
    const userId = rows[0]!.id;

    const token = await createSession(db, userId);
    expect(await findSessionUser(db, token)).not.toBeNull();

    const updated = await setAdminPassword(db, EMAIL, "Reset-password-2026");
    expect(updated).toBe(true);

    const after = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, EMAIL));
    expect(after[0]?.mustChangePassword).toBe(true);
    expect(await findSessionUser(db, token)).toBeNull();
  });

  it("возвращает false для несуществующей почты", async () => {
    expect(
      await setAdminPassword(getDb(), "nobody@test.local", "password-12345"),
    ).toBe(false);
  });

  it("destroyAllUserSessions не падает на повторном вызове", async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, EMAIL));
    await destroyAllUserSessions(db, rows[0]!.id);
    await destroyAllUserSessions(db, rows[0]!.id);
    expect(true).toBe(true);
  });
});
