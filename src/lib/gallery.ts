import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db";
import { galleryPhotos } from "@/lib/db/schema";
import type { NormalizedPhoto } from "@/lib/image";
import { getStorage, type PhotoStorage } from "@/lib/storage";

export const GALLERY_LIMIT = 24;
export const GALLERY_CAPTION_MAX = 80;

export class GalleryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalleryError";
  }
}

export type GalleryPhoto = typeof galleryPhotos.$inferSelect;

export function isGalleryId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function listGalleryPhotos(
  db: Database,
  options: { visibleOnly?: boolean } = {},
): Promise<GalleryPhoto[]> {
  return db
    .select()
    .from(galleryPhotos)
    .where(options.visibleOnly ? eq(galleryPhotos.isVisible, true) : undefined)
    .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt));
}

export async function getGalleryPhoto(
  db: Database,
  id: string,
): Promise<GalleryPhoto | null> {
  if (!isGalleryId(id)) return null;
  const rows = await db
    .select()
    .from(galleryPhotos)
    .where(eq(galleryPhotos.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Только опубликованные — для публичного роута. */
export async function getPublicGalleryPhoto(
  db: Database,
  id: string,
): Promise<GalleryPhoto | null> {
  if (!isGalleryId(id)) return null;
  const rows = await db
    .select()
    .from(galleryPhotos)
    .where(and(eq(galleryPhotos.id, id), eq(galleryPhotos.isVisible, true)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createGalleryPhotos(
  db: Database,
  photos: NormalizedPhoto[],
  storage: PhotoStorage = getStorage(),
): Promise<GalleryPhoto[]> {
  if (photos.length === 0) {
    throw new GalleryError("Нет файлов для загрузки");
  }

  const stats = await db
    .select({
      count: sql<number>`count(*)::int`,
      maxOrder: sql<number>`coalesce(max(${galleryPhotos.sortOrder}), 0)`,
    })
    .from(galleryPhotos);

  const count = Number(stats[0]?.count ?? 0);
  let sortOrder = Number(stats[0]?.maxOrder ?? 0);

  if (count + photos.length > GALLERY_LIMIT) {
    throw new GalleryError(`Не больше ${GALLERY_LIMIT} фото в галерее`);
  }

  const storedKeys: string[] = [];
  const values: Array<{
    storageKey: string;
    caption: string;
    sortOrder: number;
    isVisible: boolean;
  }> = [];

  try {
    for (const photo of photos) {
      const key = `${randomUUID()}.webp`;
      await storage.put(key, photo.data, photo.mime);
      storedKeys.push(key);
      sortOrder += 10;
      values.push({
        storageKey: key,
        caption: "",
        sortOrder,
        isVisible: true,
      });
    }

    return await db.insert(galleryPhotos).values(values).returning();
  } catch (error) {
    await Promise.all(
      storedKeys.map((key) => storage.delete(key).catch(() => undefined)),
    );
    throw error;
  }
}

export async function setGalleryBeforePhoto(
  db: Database,
  id: string,
  photo: NormalizedPhoto,
  storage: PhotoStorage = getStorage(),
): Promise<boolean> {
  const existing = await getGalleryPhoto(db, id);
  if (!existing) return false;

  const key = `${randomUUID()}.webp`;
  await storage.put(key, photo.data, photo.mime);

  try {
    await db
      .update(galleryPhotos)
      .set({ beforeStorageKey: key })
      .where(eq(galleryPhotos.id, id));
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }

  if (existing.beforeStorageKey) {
    await storage.delete(existing.beforeStorageKey).catch(() => undefined);
  }

  return true;
}

export async function removeGalleryBeforePhoto(
  db: Database,
  id: string,
  storage: PhotoStorage = getStorage(),
): Promise<boolean> {
  const existing = await getGalleryPhoto(db, id);
  if (!existing?.beforeStorageKey) return false;

  await storage.delete(existing.beforeStorageKey);
  await db
    .update(galleryPhotos)
    .set({ beforeStorageKey: null })
    .where(eq(galleryPhotos.id, id));

  return true;
}

export async function updateGalleryPhoto(  db: Database,
  id: string,
  input: { caption?: string; isVisible?: boolean; move?: "up" | "down" },
): Promise<boolean> {
  const photo = await getGalleryPhoto(db, id);
  if (!photo) return false;

  const patch: { caption?: string; isVisible?: boolean } = {};
  if (input.caption !== undefined) {
    patch.caption = input.caption.trim().slice(0, GALLERY_CAPTION_MAX);
  }
  if (input.isVisible !== undefined) patch.isVisible = input.isVisible;

  if (Object.keys(patch).length > 0) {
    await db.update(galleryPhotos).set(patch).where(eq(galleryPhotos.id, id));
  }

  if (input.move) {
    await db.transaction(async (tx) => {
      const all = await tx
        .select({
          id: galleryPhotos.id,
          sortOrder: galleryPhotos.sortOrder,
          createdAt: galleryPhotos.createdAt,
        })
        .from(galleryPhotos)
        .orderBy(asc(galleryPhotos.sortOrder), asc(galleryPhotos.createdAt));

      const index = all.findIndex((row) => row.id === id);
      const target = input.move === "up" ? index - 1 : index + 1;
      if (index < 0 || target < 0 || target >= all.length) return;

      const reordered = [...all];
      [reordered[index], reordered[target]] = [
        reordered[target]!,
        reordered[index]!,
      ];

      for (const [position, row] of reordered.entries()) {
        await tx
          .update(galleryPhotos)
          .set({ sortOrder: (position + 1) * 10 })
          .where(eq(galleryPhotos.id, row.id));
      }
    });
  }

  return true;
}

export async function deleteGalleryPhoto(
  db: Database,
  id: string,
  storage: PhotoStorage = getStorage(),
): Promise<boolean> {
  const photo = await getGalleryPhoto(db, id);
  if (!photo) return false;

  // Сначала объекты, потом строка: не оставляем ссылки на удалённые файлы.
  const keys = [photo.storageKey, photo.beforeStorageKey].filter(
    (key): key is string => Boolean(key),
  );
  await Promise.all(keys.map((key) => storage.delete(key)));

  const deleted = await db
    .delete(galleryPhotos)
    .where(eq(galleryPhotos.id, id))
    .returning({ id: galleryPhotos.id });

  return deleted.length > 0;
}
