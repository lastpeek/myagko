import { revalidatePath } from "next/cache";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import {
  createGalleryPhotos,
  GALLERY_LIMIT,
  GalleryError,
  listGalleryPhotos,
} from "@/lib/gallery";
import { normalizePhoto, photoErrorMessage, type NormalizedPhoto } from "@/lib/image";
import { isSameOrigin } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Не удалось прочитать файлы", 400);
  }

  const files = form
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return apiError("Выберите хотя бы одно фото", 400);
  }

  if (files.length > GALLERY_LIMIT) {
    return apiError(`Не больше ${GALLERY_LIMIT} фото`, 400);
  }

  const db = getDb();
  const existing = await listGalleryPhotos(db);
  if (existing.length + files.length > GALLERY_LIMIT) {
    return apiError(
      `В галерее уже ${existing.length} фото. Всего можно ${GALLERY_LIMIT}.`,
      400,
    );
  }

  const normalized: NormalizedPhoto[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      return apiError(photoErrorMessage("too_large"), 400);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const photo = await normalizePhoto(buffer, MAX_FILE_BYTES);
    if ("error" in photo) {
      return apiError(photoErrorMessage(photo.error), 400);
    }
    normalized.push(photo);
  }

  try {
    const created = await createGalleryPhotos(db, normalized);
    revalidatePath("/");
    revalidatePath("/admin/gallery");
    return json({ ok: true, count: created.length }, 201);
  } catch (error) {
    if (error instanceof GalleryError) {
      return apiError(error.message, 400);
    }
    console.error(
      "gallery_upload_failed",
      error instanceof Error ? error.name : "unknown",
    );
    return apiError("Не удалось сохранить фото", 500);
  }
}
