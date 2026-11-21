import { revalidatePath } from "next/cache";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import {
  removeGalleryBeforePhoto,
  setGalleryBeforePhoto,
} from "@/lib/gallery";
import { normalizePhoto, photoErrorMessage } from "@/lib/image";
import { isSameOrigin } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Не удалось прочитать файл", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return apiError("Выберите фото", 400);
  }
  if (file.size > MAX_FILE_BYTES) {
    return apiError(photoErrorMessage("too_large"), 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const photo = await normalizePhoto(buffer, MAX_FILE_BYTES);
  if ("error" in photo) {
    return apiError(photoErrorMessage(photo.error), 400);
  }

  const updated = await setGalleryBeforePhoto(getDb(), id, photo);
  if (!updated) return apiError("Фото не найдено", 404);

  revalidatePath("/");
  revalidatePath("/admin/gallery");
  return json({ ok: true }, 201);
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
    const removed = await removeGalleryBeforePhoto(getDb(), id);
    if (!removed) return apiError("Фото «до» не найдено", 404);

    revalidatePath("/");
    revalidatePath("/admin/gallery");
    return json({ ok: true });
  } catch (error) {
    console.error(
      "gallery_before_delete_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не удалось удалить фото «до»", 500);
  }
}
