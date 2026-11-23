import { apiError, json, requireAdmin } from "@/lib/api";
import { applyTariffsUpdate, TariffUpdateError } from "@/lib/admin-tariffs";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import { updateTariffsSchema } from "@/lib/validation";

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

  const parsed = updateTariffsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400);
  }

  try {
    await applyTariffsUpdate(getDb(), parsed.data);
  } catch (error) {
    if (error instanceof TariffUpdateError) {
      return apiError(error.message, 400);
    }
    throw error;
  }

  return json({ ok: true });
}
