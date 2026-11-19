import { createHash, randomBytes } from "node:crypto";

import { hash, verify } from "@node-rs/argon2";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { cookies } from "next/headers";

import type { Database } from "@/lib/db";
import { getDb } from "@/lib/db";
import { adminSessions, adminUsers } from "@/lib/db/schema";

// isolatedModules не даёт читать const enum из d.ts — значение Argon2id = 2.
const ARGON2ID = 2;

export const SESSION_COOKIE = "myagko_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type AdminUser = {
  id: string;
  email: string;
  mustChangePassword: boolean;
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, { algorithm: ARGON2ID });
}

export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: Database,
  userId: string,
): Promise<string> {
  const token = createSessionToken();
  await db.insert(adminSessions).values({
    tokenHash: hashSessionToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return token;
}

export async function findSessionUser(
  db: Database,
  token: string,
): Promise<AdminUser | null> {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const now = new Date();

  const rows = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      mustChangePassword: adminUsers.mustChangePassword,
      sessionId: adminSessions.id,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.invalidatedAt),
        gt(adminSessions.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db
    .update(adminSessions)
    .set({ lastSeenAt: now })
    .where(
      and(
        eq(adminSessions.id, row.sessionId),
        lt(adminSessions.lastSeenAt, new Date(now.getTime() - TOUCH_INTERVAL_MS)),
      ),
    );

  return {
    id: row.id,
    email: row.email,
    mustChangePassword: row.mustChangePassword,
  };
}

export async function destroySession(db: Database, token: string): Promise<void> {
  if (!token) return;
  await db
    .update(adminSessions)
    .set({ invalidatedAt: new Date() })
    .where(eq(adminSessions.tokenHash, hashSessionToken(token)));
}

export async function destroyAllUserSessions(
  db: Database,
  userId: string,
): Promise<void> {
  await db
    .update(adminSessions)
    .set({ invalidatedAt: new Date() })
    .where(
      and(eq(adminSessions.userId, userId), isNull(adminSessions.invalidatedAt)),
    );
}

/**
 * Сброс пароля владельца: смена по CLI всегда требует сменить пароль
 * при следующем входе и гасит все сессии.
 */
export async function setAdminPassword(
  db: Database,
  email: string,
  password: string,
  options: { mustChangePassword?: boolean } = {},
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const rows = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, normalized))
    .limit(1);

  const user = rows[0];
  if (!user) return false;

  const mustChangePassword = options.mustChangePassword ?? true;

  await db
    .update(adminUsers)
    .set({
      passwordHash: await hashPassword(password),
      mustChangePassword,
      passwordChangedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id));

  await destroyAllUserSessions(db, user.id);
  return true;
}

/** Текущий владелец по cookie. В API возвращает null, в страницах — редирект. */
export async function getAdminUser(): Promise<AdminUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionUser(getDb(), token);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
