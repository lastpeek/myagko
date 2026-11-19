"use client";

import { useRef, useState } from "react";

import { CameraIcon, PlusIcon } from "@/components/icons";
import { PhotoThumb } from "@/components/photo-thumb";
import { addPhoto, removePhoto, type PhotoMeta } from "@/lib/cart-store";
import { preparePhoto } from "@/lib/client-image";
import { deletePhoto, putPhoto } from "@/lib/photo-store";

export function PhotoUploader({
  itemUid,
  photos,
  max,
  required,
  compact = false,
}: {
  itemUid: string;
  photos: PhotoMeta[];
  max: number;
  required?: boolean;
  compact?: boolean;
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

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2.5">
        {photos.map((photo) => (
          <PhotoThumb
            key={photo.id}
            id={photo.id}
            alt={`Фото: ${photo.name}`}
            onRemove={() => handleRemove(photo.id)}
            size={compact ? 56 : 72}
          />
        ))}

        {photos.length < max ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
            className="flex min-h-11 items-center gap-2 rounded-[12px] border border-dashed border-line-strong bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-[180ms] hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-45"
          >
            <span className="grid h-6 w-6 place-items-center rounded-[8px] bg-accent-soft text-accent-ink">
              {photos.length === 0 ? (
                <CameraIcon className="h-4 w-4" />
              ) : (
                <PlusIcon className="h-4 w-4" />
              )}
            </span>
            {busy
              ? "Готовим фото…"
              : photos.length === 0
                ? required
                  ? "Добавить фото"
                  : "+ Фото"
                : "Ещё"}
            <span className="tabular text-ink-3">
              {photos.length} / {max}
            </span>
          </button>
        ) : (
          <span className="caption">
            Фото: {photos.length} / {max}
          </span>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(event) => void handleFiles(event.target.files)}
          tabIndex={-1}
        />
      </div>

      {required && photos.length === 0 ? (
        <p className="small mt-2 text-warn">
          Нужно хотя бы одно фото. Можно добавить здесь или на оформлении.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
