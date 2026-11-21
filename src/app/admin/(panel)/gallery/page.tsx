import type { Metadata } from "next";

import { GalleryManager } from "@/components/admin/gallery-manager";
import { getDb } from "@/lib/db";
import { GALLERY_LIMIT, listGalleryPhotos } from "@/lib/gallery";

export const metadata: Metadata = {
  title: "Работы",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminGalleryPage() {
  const photos = await listGalleryPhotos(getDb());

  return (
    <div>
      <h1 className="h2">Работы</h1>
      <p className="small mt-1.5 max-w-[60ch] text-ink-2">
        Фото появятся на главной в блоке «Наши работы». Скрытые фото на сайте не
        показываются, но остаются здесь.
      </p>

      <div className="mt-4">
        <GalleryManager
          limit={GALLERY_LIMIT}
          photos={photos.map((photo) => ({
            id: photo.id,
            caption: photo.caption,
            isVisible: photo.isVisible,
            previewUrl: `/api/admin/gallery/${photo.id}/file`,
            hasBefore: Boolean(photo.beforeStorageKey),
            beforePreviewUrl: photo.beforeStorageKey
              ? `/api/admin/gallery/${photo.id}/before/file`
              : null,
            createdAt: photo.createdAt.toISOString(),
          }))}
        />
      </div>
    </div>
  );
}
