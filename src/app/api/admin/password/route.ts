import { eq } from "drizzle-orm";

import {
  createSession,
  destroyAllUserSessions,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { isSameOrigin } from "@/lib/rate-limit";
import { changePasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin({ allowPasswordChange: true });
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400, {
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      ),
    });
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.id, guard.user.id))
    .limit(1);
  const user = rows[0];
  if (!user) return apiError("Нужно войти заново", 401);

  const valid = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!valid) {
    return apiError("Текущий пароль не подошёл", 400, {
      fields: { currentPassword: "Текущий пароль не подошёл" },
    });
  }

  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return apiError("Новый пароль совпадает с текущим", 400, {
      fields: { newPassword: "Придумайте другой пароль" },
    });
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);

  await db
    .update(adminUsers)
    .set({
      passwordHash,
      mustChangePassword: false,
      passwordChangedAt: new Date(),
    })
    .where(eq(adminUsers.id, user.id));

  // Все старые сессии гасятся, текущее устройство получает новую.
  await destroyAllUserSessions(db, user.id);
  const token = await createSession(db, user.id);
  await setSessionCookie(token);

  return json({ ok: true });
}
