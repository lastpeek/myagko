import { eq } from "drizzle-orm";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { company } from "@/lib/db/schema";
import { isSameOrigin } from "@/lib/rate-limit";
import { validateAccent } from "@/lib/theme";
import { updateCompanySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = updateCompanySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400, {
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      ),
    });
  }

  const accent = validateAccent(parsed.data.accentColor);
  if (!accent.ok) {
    return apiError(accent.reason, 400, {
      fields: { accentColor: accent.reason },
    });
  }

  await getDb()
    .update(company)
    .set({
      name: parsed.data.name,
      city: parsed.data.city,
      phone: parsed.data.phone,
      email: parsed.data.email,
      territory: parsed.data.territory,
      accentColor: accent.theme.light.accent,
      heroTitle: parsed.data.heroTitle,
      heroSubtitle: parsed.data.heroSubtitle,
      otherRequiresPhoto: parsed.data.otherRequiresPhoto,
      updatedAt: new Date(),
    })
    .where(eq(company.id, 1));

  return json({ ok: true });
}
