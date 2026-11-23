import fs from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    requireAdmin: async () => ({
      ok: true,
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "owner@test.local",
        mustChangePassword: false,
      },
    }),
  };
});

import { closeDb, getDb, runMigrations } from "@/lib/db";
import { seedDatabase } from "@/lib/seed-data";
import { DELETE, PATCH } from "./route";

const DB_PATH = path.join(process.cwd(), ".data", "catalog-route-test");

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.AUTH_SECRET = "catalog-route-test-secret-0123456789";
delete process.env.ADMIN_EMAIL;
delete process.env.ADMIN_PASSWORD;

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await runMigrations();
  await seedDatabase(getDb(), { requireAdmin: false });
});

afterAll(async () => {
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
});

function requestWith(body: unknown, method = "DELETE"): Request {
  return new Request("http://localhost:3000/api/admin/catalog", {
    method,
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/admin/catalog", () => {
  it("отвечает 409, если услуга ещё используется", async () => {
    const response = await DELETE(
      requestWith({ kind: "service", id: "chair-stul" }),
    );
    expect(response.status).toBe(409);
  });

  it("удаляет вариант без ссылок", async () => {
    const response = await DELETE(
      requestWith({ kind: "variant", id: "chair-seat" }),
    );
    expect(response.status).toBe(200);
  });

  it("скрывает услугу через is_active", async () => {
    const response = await PATCH(
      requestWith(
        { kind: "service", id: "chair-stul", isActive: false },
        "PATCH",
      ),
    );
    expect(response.status).toBe(200);
  });

  it("отвечает 400 на неизвестный тип", async () => {
    const response = await DELETE(
      requestWith({ kind: "something", id: "chair-seat" }),
    );
    expect(response.status).toBe(400);
  });

  it("отвечает 400 на PATCH без isActive", async () => {
    const response = await PATCH(
      requestWith({ kind: "service", id: "chair-stul" }, "PATCH"),
    );
    expect(response.status).toBe(400);
  });
});
