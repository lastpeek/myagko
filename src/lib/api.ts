import { NextResponse } from "next/server";

import { getAdminUser, type AdminUser } from "@/lib/auth";

export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });
}

export function apiError(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
): NextResponse {
  return json({ error: message, ...extra }, status);
}

export type AdminGuard =
  | { ok: true; user: AdminUser }
  | { ok: false; response: NextResponse };

export async function requireAdmin(options?: {
  allowPasswordChange?: boolean;
}): Promise<AdminGuard> {
  const user = await getAdminUser();
  if (!user) {
    return { ok: false, response: apiError("Нужно войти", 401) };
  }
  if (user.mustChangePassword && !options?.allowPasswordChange) {
    return {
      ok: false,
      response: apiError("Сначала смените пароль", 403),
    };
  }
  return { ok: true, user };
}
