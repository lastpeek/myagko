import { revalidatePath } from "next/cache";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { deleteGalleryPhoto, updateGalleryPhoto } from "@/lib/gallery";
import { isSameOrigin } from "@/lib/rate-limit";
import { galleryUpdateSchema } from "@/lib/validation";

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

  const parsed = galleryUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? "Проверьте поля", 400);
  }

  const updated = await updateGalleryPhoto(getDb(), id, parsed.data);
  if (!updated) return apiError("Фото не найдено", 404);

  revalidatePath("/");
  revalidatePath("/admin/gallery");
  return json({ ok: true });
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
    const deleted = await deleteGalleryPhoto(getDb(), id);
    if (!deleted) return apiError("Фото не найдено", 404);

    revalidatePath("/");
    revalidatePath("/admin/gallery");
    return json({ ok: true });
  } catch (error) {
    console.error(
      "gallery_delete_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не удалось удалить фото", 500);
  }
}
