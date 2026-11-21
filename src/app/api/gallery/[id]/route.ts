import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getPublicGalleryPhoto } from "@/lib/gallery";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Публичная отдача фото работ: без токена заявки, только опубликованные.
 * Скрытое или несуществующее фото — одинаковый 404.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const notFound = new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

  const photo = await getPublicGalleryPhoto(getDb(), id);
  if (!photo) return notFound;

  const object = await getStorage().get(photo.storageKey);
  if (!object) return notFound;

  return new NextResponse(new Uint8Array(object.data), {
    status: 200,
    headers: {
      "Content-Type": object.contentType || "image/webp",
      "Content-Length": String(object.data.length),
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
