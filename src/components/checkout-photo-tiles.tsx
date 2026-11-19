"use client";

import { useRef, useState } from "react";

import { PlusIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/photo-thumb";
import { removePhoto, type PhotoMeta } from "@/lib/cart-store";
import { addFilesToItem } from "@/lib/photo-upload";
import { deletePhoto } from "@/lib/photo-store";

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
    setBusy(true);

    const uploadError = await addFilesToItem(itemUid, files, max);
    setError(uploadError);

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
