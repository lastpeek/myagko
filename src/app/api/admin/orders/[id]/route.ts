import { revalidatePath } from "next/cache";

import { apiError, json, requireAdmin } from "@/lib/api";
import { AdminOrderError, deleteOrder, updateOrder } from "@/lib/admin-orders";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import { orderUpdateSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = orderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400, {
      fields: Object.fromEntries(
        parsed.error.issues.map((issue) => [issue.path.join("."), issue.message]),
      ),
    });
  }

  try {
    await updateOrder(getDb(), id, parsed.data, guard.user.email);
    revalidatePath("/admin");
    revalidatePath(`/admin/orders/${id}`);
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AdminOrderError) {
      return apiError(
        error.message,
        400,
        error.field ? { fields: { [error.field]: error.message } } : {},
      );
    }
    console.error(
      "admin_order_update_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не удалось сохранить изменения", 500);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  try {
    await deleteOrder(getDb(), id);
    revalidatePath("/admin");
    return json({ ok: true });
  } catch (error) {
    if (error instanceof AdminOrderError) {
      return apiError(error.message, 404);
    }
    console.error(
      "admin_order_delete_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не удалось удалить заявку", 500);
  }
}
