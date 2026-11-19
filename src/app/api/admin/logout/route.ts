import { cookies } from "next/headers";

import {
  clearSessionCookie,
  destroySession,
  SESSION_COOKIE,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await destroySession(getDb(), token);
  }
  await clearSessionCookie();

  return json({ ok: true });
}
