"use client";

import { useEffect, useState } from "react";

import { CloseIcon } from "@/components/icons";
import { getPhoto } from "@/lib/photo-store";

export function PhotoThumb({
  id,
  alt,
  onRemove,
  size = 72,
}: {
  id: string;
  alt: string;
  onRemove?: () => void;
  size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    getPhoto(id).then((photo) => {
      if (!active || !photo) return;
      objectUrl = URL.createObjectURL(photo.blob);
      setUrl(objectUrl);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return (
    <div
      className="relative flex-none overflow-hidden rounded-[12px] border border-line bg-surface-2"
      style={{ width: size, height: size }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="skeleton block h-full w-full" />
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Удалить фото"
          className="absolute right-0.5 top-0.5 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-paper bg-ink text-paper"
        >
          <CloseIcon className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
