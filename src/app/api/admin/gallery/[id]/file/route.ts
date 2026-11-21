import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { getGalleryPhoto } from "@/lib/gallery";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Превью в кабинете: доступно и для скрытых фото, но только с сессией. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const notFound = new NextResponse("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });

  const photo = await getGalleryPhoto(getDb(), id);
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
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
