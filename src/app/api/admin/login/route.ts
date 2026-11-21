import { eq } from "drizzle-orm";

import {
  createSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import {
  checkRateLimit,
  getRequestIp,
  isSameOrigin,
  rateLimitKey,
} from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validation";
import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let dummyHash: Promise<string> | null = null;

function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing-only");
  return dummyHash;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("Проверьте почту и пароль", 400);
  }

  const db = getDb();
  const ip = getRequestIp(request.headers);

  const byIp = await checkRateLimit(db, {
    key: rateLimitKey("login:ip", ip),
    limit: 20,
    windowMs: 15 * 60 * 1000,
  });
  if (!byIp.allowed) {
    return json(
      { error: "Слишком много попыток. Подождите." },
      429,
      { "Retry-After": String(byIp.retryAfterSeconds) },
    );
  }

  const accountLimit = (() => {
    const value = Number(process.env.LOGIN_RATE_LIMIT ?? "5");
    return Number.isFinite(value) && value > 0 ? value : 5;
  })();

  const byAccount = await checkRateLimit(db, {
    key: rateLimitKey("login:account", `${ip}:${parsed.data.email}`),
    limit: accountLimit,
    windowMs: 15 * 60 * 1000,
  });
  if (!byAccount.allowed) {
    return json(
      { error: "Слишком много попыток. Подождите." },
      429,
      { "Retry-After": String(byAccount.retryAfterSeconds) },
    );
  }

  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, parsed.data.email))
    .limit(1);

  const user = rows[0];

  if (!user) {
    await verifyPassword(await getDummyHash(), parsed.data.password);
    return apiError("Неверная почта или пароль", 401);
  }

  const valid = await verifyPassword(user.passwordHash, parsed.data.password);
  if (!valid) {
    return apiError("Неверная почта или пароль", 401);
  }

  const token = await createSession(db, user.id);
  await setSessionCookie(token);

  return json({ ok: true, mustChangePassword: user.mustChangePassword });
}
