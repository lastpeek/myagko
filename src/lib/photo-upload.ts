"use client";

import { addPhoto, getItem } from "@/lib/cart-store";
import { preparePhoto } from "@/lib/client-image";
import { putPhoto } from "@/lib/photo-store";

/**
 * Общий путь загрузки: файл → сжатие → IndexedDB → метаданные в корзине.
 * Используется в корзине, на оформлении и на главной.
 */
export async function addFilesToItem(
  itemUid: string,
  files: FileList | File[],
  max: number,
): Promise<string | null> {
  const existing = getItem(itemUid);
  const existingCount = existing?.photos.length ?? 0;
  const remaining = max - existingCount;

  if (remaining <= 0) {
    return `К позиции можно приложить не больше ${max} фото.`;
  }

  const list = Array.from(files).slice(0, remaining);
  let lastError: string | null = null;

  for (const file of list) {
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      lastError = prepared.error;
      continue;
    }

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      await putPhoto({
        id,
        itemUid,
        blob: prepared.photo.blob,
        width: prepared.photo.width,
        height: prepared.photo.height,
        name: file.name,
        createdAt: Date.now(),
      });
      addPhoto(itemUid, {
        id,
        width: prepared.photo.width,
        height: prepared.photo.height,
        name: file.name,
      });
    } catch {
      lastError = "Не удалось сохранить фото в браузере. Попробуйте ещё раз.";
    }
  }

  if (Array.from(files).length > remaining) {
    lastError = `К позиции можно приложить не больше ${max} фото.`;
  }

  return lastError;
}
