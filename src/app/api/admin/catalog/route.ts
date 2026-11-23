import { apiError, json, requireAdmin } from "@/lib/api";
import {
  CatalogDeleteError,
  deleteCatalogEntity,
  setCatalogEntityActive,
} from "@/lib/catalog-delete";
import { getDb } from "@/lib/db";
import { isSameOrigin } from "@/lib/rate-limit";
import { catalogActiveSchema, catalogDeleteSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBody(request: Request): Promise<unknown> {
  return request.json();
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await parseBody(request);
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = catalogDeleteSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400);
  }

  try {
    await deleteCatalogEntity(getDb(), parsed.data.kind, parsed.data.id);
  } catch (error) {
    if (error instanceof CatalogDeleteError) {
      return apiError(error.message, error.status);
    }
    throw error;
  }

  return json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await parseBody(request);
  } catch {
    return apiError("Проверьте данные", 400);
  }

  const parsed = catalogActiveSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400);
  }

  try {
    await setCatalogEntityActive(
      getDb(),
      parsed.data.kind,
      parsed.data.id,
      parsed.data.isActive,
    );
  } catch (error) {
    if (error instanceof CatalogDeleteError) {
      return apiError(error.message, error.status);
    }
    throw error;
  }

  return json({ ok: true });
}
