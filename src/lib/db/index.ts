import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

import * as schema from "./schema";

/**
 * Один экземпляр приложения — одна база.
 *
 * `DATABASE_URL=postgresql://…` — обычный Postgres (VPS, Neon).
 * `DATABASE_URL=pglite://.data/dev` — Postgres в WASM для локальной разработки
 * и тестов, чтобы не требовать Docker. Диалект и миграции те же.
 *
 * Тип намеренно один: у pg- и pglite-драйверов Drizzle общий базовый API.
 */
export type Database = NodePgDatabase<typeof schema>;

type GlobalWithDb = typeof globalThis & {
  __myagkoDb?: Database;
  __myagkoClient?: { close: () => Promise<void> };
};

const globalForDb = globalThis as GlobalWithDb;

function createDb(): { db: Database; close: () => Promise<void> } {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL не задан. Скопируйте .env.example в .env и заполните.",
    );
  }

  if (url.startsWith("pglite://")) {
    const client = new PGlite(pgliteTarget(url));
    const db = drizzlePglite(client, { schema }) as unknown as Database;
    return {
      db,
      close: async () => {
        await client.close();
      },
    };
  }

  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    close: async () => {
      await pool.end();
    },
  };
}

export function getDb(): Database {
  if (!globalForDb.__myagkoDb) {
    const { db, close } = createDb();
    globalForDb.__myagkoDb = db;
    globalForDb.__myagkoClient = { close };
  }
  return globalForDb.__myagkoDb;
}

/** Накатывает миграции из ./drizzle на базу из DATABASE_URL. */
export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL не задан.");
  }

  const migrationsFolder = path.join(process.cwd(), "drizzle");

  if (url.startsWith("pglite://")) {
    const client = new PGlite(pgliteTarget(url));
    try {
      await migratePglite(drizzlePglite(client, { schema }), {
        migrationsFolder,
      });
    } finally {
      await client.close();
    }
    return;
  }

  const pool = new Pool({ connectionString: url, max: 2 });
  try {
    await migratePg(drizzlePg(pool, { schema }), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

export async function closeDb(): Promise<void> {
  await globalForDb.__myagkoClient?.close();
  delete globalForDb.__myagkoDb;
  delete globalForDb.__myagkoClient;
}

export function isPglite(): boolean {
  return (process.env.DATABASE_URL ?? "").startsWith("pglite://");
}

/** Путь PGlite; родительскую папку создаём, memory:// оставляем в памяти. */
function pgliteTarget(url: string): string | undefined {
  const target = url.slice("pglite://".length);
  if (!target || target === "memory" || target === "memory://") {
    return undefined;
  }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  return target;
}

export { schema };
export * from "./schema";
