import { NextResponse } from "next/server";

import { getAdminUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findPhotoById, findPhotoForOrderToken, isUuid } from "@/lib/orders";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Фото отдаётся либо владельцу (сессия), либо клиенту с токеном своей заявки.
 * Неверный id, чужой токен и отсутствие файла — одинаковый 404.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const notFound = new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });

  if (!isUuid(id)) return notFound;

  const db = getDb();
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";

  let photo: { storageKey: string; mime: string } | null = null;

  const admin = await getAdminUser();
  if (admin) {
    photo = await findPhotoById(db, id);
  } else if (token) {
    photo = await findPhotoForOrderToken(db, id, token);
  }

  if (!photo) return notFound;

  const object = await getStorage().get(photo.storageKey);
  if (!object) return notFound;

  return new NextResponse(new Uint8Array(object.data), {
    status: 200,
    headers: {
      "Content-Type": object.contentType || "image/webp",
      "Content-Length": String(object.data.length),
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
