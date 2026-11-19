"use client";

import { useRef, useState } from "react";

import { PlusIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/photo-thumb";
import { addPhoto, removePhoto, type PhotoMeta } from "@/lib/cart-store";
import { preparePhoto } from "@/lib/client-image";
import { deletePhoto, putPhoto } from "@/lib/photo-store";

/**
 * Плитки фото на оформлении: пустая плитка открывает выбор файла
 * именно для этой позиции. Пайплайн тот же, что в корзине:
 * браузер → IndexedDB → один пакет при отправке.
 */
export function CheckoutPhotoTiles({
  itemUid,
  label,
  photos,
  max,
}: {
  itemUid: string;
  label: string;
  photos: PhotoMeta[];
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    const remaining = max - photos.length;
    if (remaining <= 0) {
      setError(`К позиции можно приложить не больше ${max} фото.`);
      return;
    }

    setBusy(true);
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

    if (files.length > remaining) {
      lastError = `К позиции можно приложить не больше ${max} фото.`;
    }

    setError(lastError);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleRemove(id: string) {
    removePhoto(itemUid, id);
    void deletePhoto(id);
  }

  const addLabel = `Добавить фото к позиции «${label}»`;

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.map((photo) => (
          <PhotoThumb
            key={photo.id}
            id={photo.id}
            alt={`Фото: ${label}`}
            onRemove={() => handleRemove(photo.id)}
            size={72}
          />
        ))}

        {photos.length < max ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
            aria-label={addLabel}
            className="grid h-[72px] w-[72px] flex-none place-items-center overflow-hidden rounded-[12px] border border-dashed border-line-strong bg-surface text-ink-3 transition-colors duration-[180ms] hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-45"
          >
            {photos.length === 0 ? (
              <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap px-1 text-[11px] leading-4">
                без фото
              </span>
            ) : (
              <PlusIcon className="h-5 w-5" />
            )}
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label={`Файл фото: ${label}`}
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
          tabIndex={-1}
        />
      </div>

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
