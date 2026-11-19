import { createHmac } from "node:crypto";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { Database } from "@/lib/db";
import { rateLimitHits } from "@/lib/db/schema";

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET не задан — в продакшене это недопустимо.");
  }
  return "dev-only-secret-change-me";
}

/** IP и телефон в базу не пишем: только HMAC. */
export function rateLimitKey(scope: string, identifier: string): string {
  return createHmac("sha256", authSecret())
    .update(`${scope}:${identifier}`)
    .digest("hex");
}

export function getRequestIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export async function checkRateLimit(
  db: Database,
  args: { key: string; limit: number; windowMs: number },
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = new Date(now - args.windowMs);

  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
      oldest: sql<Date | null>`min(${rateLimitHits.createdAt})`,
    })
    .from(rateLimitHits)
    .where(
      and(
        eq(rateLimitHits.key, args.key),
        gte(rateLimitHits.createdAt, windowStart),
      ),
    );

  const count = Number(rows[0]?.count ?? 0);

  if (count >= args.limit) {
    const oldest = rows[0]?.oldest ? new Date(rows[0].oldest).getTime() : now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + args.windowMs - now) / 1000),
    );
    return { allowed: false, retryAfterSeconds };
  }

  await db.insert(rateLimitHits).values({ key: args.key });

  // Чистим редкие старые записи, чтобы таблица не росла бесконечно.
  if (Math.random() < 0.02) {
    await db
      .delete(rateLimitHits)
      .where(lt(rateLimitHits.createdAt, new Date(now - 24 * 60 * 60 * 1000)));
  }

  return { allowed: true };
}

/** Проверка Origin для мутаций: чужой сайт не должен слать формы от имени клиента. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const allowed = new Set<string>();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      allowed.add(new URL(siteUrl).origin);
    } catch {
      // некорректный env — проверим по Host
    }
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const isLocal =
      host.startsWith("localhost") ||
      host.startsWith("127.0.0.1") ||
      host.startsWith("[::1]");
    if (isLocal) {
      allowed.add(`http://${host}`);
      allowed.add(`https://${host}`);
    } else {
      allowed.add(`https://${host}`);
    }
  }

  return allowed.has(origin);
}
