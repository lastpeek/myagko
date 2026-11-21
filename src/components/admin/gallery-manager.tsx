"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CameraIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
import { preparePhoto } from "@/lib/client-image";

export type GalleryAdminItem = {
  id: string;
  caption: string;
  isVisible: boolean;
  previewUrl: string;
  hasBefore: boolean;
  beforePreviewUrl: string | null;
  createdAt: string;
};

type Notice = { kind: "ok" | "error"; text: string } | null;

export function GalleryManager({
  photos,
  limit,
}: {
  photos: GalleryAdminItem[];
  limit: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    if (photos.length + files.length > limit) {
      setError(
        `Можно загрузить не больше ${limit} фото. Сейчас ${photos.length}.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    const tooBig = Array.from(files).find((file) => file.size > 10 * 1024 * 1024);
    if (tooBig) {
      setError("Файл больше 10 МБ. Сожмите или выберите другой.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setBusy(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files)) {
        const prepared = await preparePhoto(file);
        if (!prepared.ok) {
          setError(prepared.error);
          return;
        }
        form.append(
          "files",
          prepared.photo.blob,
          `${file.name.replace(/\.[^.]+$/, "")}.webp`,
        );
      }
      const response = await fetch("/api/admin/gallery", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Не удалось загрузить фото");
      } else {
        router.refresh();
      }
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const full = photos.length >= limit;

  return (
    <div className="grid gap-3">
      <section className="card p-4 md:p-5" aria-labelledby="gallery-upload-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="gallery-upload-title" className="h3">
              Фотографии
            </h2>
            <p className="caption mt-1">
              JPG, PNG, WebP · до 10 МБ · до {limit} фото
            </p>
          </div>
          <span className="tabular text-[12.5px] leading-4 text-ink-2">
            {photos.length} / {limit}
          </span>
        </div>

        <p className="small mt-2 max-w-[62ch] text-ink-2">
          Не публикуйте лица клиентов и адреса. Подпись и порядок можно изменить
          под каждым фото.
        </p>
        <p className="small mt-1 max-w-[62ch] text-ink-2">
          Снимите мебель с одного ракурса и с одинаковым светом — иначе сравнение
          выглядит нечестно.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || full}
          aria-busy={busy}
          className="btn btn-secondary mt-3 w-auto px-4"
        >
          {busy ? <SpinnerIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {busy ? "Загружаем…" : full ? `Лимит ${limit} фото` : "Загрузить фото"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Загрузить фото работ"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => void upload(event.target.files)}
        />

        {error ? (
          <p role="alert" className="field-error">
            {error}
          </p>
        ) : null}
      </section>

      {photos.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
            <CameraIcon className="h-6 w-6" />
          </span>
          <h2 className="h3 mt-4">Пока нет работ</h2>
          <p className="small mt-1.5 max-w-[38ch] text-ink-2">
            Добавьте 3–5 фото — блок появится на сайте.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((photo, index) => (
            <GalleryCard
              key={photo.id}
              photo={photo}
              index={index}
              total={photos.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({
  photo,
  index,
  total,
}: {
  photo: GalleryAdminItem;
  index: number;
  total: number;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(photo.caption);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState(false);
  const beforeInputRef = useRef<HTMLInputElement>(null);

  const dirty = caption.trim() !== photo.caption;
  const label = photo.caption || `Фото ${index + 1}`;

  useEffect(() => {
    if (!confirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirm(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [confirm]);

  async function patch(
    body: Record<string, unknown>,
    successText: string,
  ): Promise<boolean> {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/gallery/${photo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: data?.error ?? "Не удалось сохранить",
        });
        return false;
      }

      setNotice({ kind: "ok", text: successText });
      router.refresh();
      return true;
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/gallery/${photo.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setNotice({ kind: "error", text: data?.error ?? "Не удалось удалить" });
        setBusy(false);
        setConfirm(false);
        return;
      }
      setConfirm(false);
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
      setBusy(false);
      setConfirm(false);
    }
  }

  async function uploadBefore(files: FileList | null) {
    if (!files || files.length === 0) return;

    setNotice(null);
    setBusy(true);
    try {
      const prepared = await preparePhoto(files[0]!);
      if (!prepared.ok) {
        setNotice({ kind: "error", text: prepared.error });
        return;
      }

      const form = new FormData();
      form.append("file", prepared.photo.blob, "before.webp");

      const response = await fetch(
        `/api/admin/gallery/${photo.id}/before`,
        { method: "POST", body: form },
      );
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: data?.error ?? "Не удалось загрузить фото до",
        });
        return;
      }

      setNotice({ kind: "ok", text: "Фото до добавлено" });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
      if (beforeInputRef.current) beforeInputRef.current.value = "";
    }
  }

  async function removeBefore() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(
        `/api/admin/gallery/${photo.id}/before`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: data?.error ?? "Не удалось убрать фото до",
        });
        return;
      }

      setNotice({ kind: "ok", text: "Фото до убрано" });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <article
      data-photo-id={photo.id}
      className="card overflow-hidden"
      aria-label={label}
    >
      <div className="px-3 pt-3 label text-ink-2">Фото после чистки</div>

      <div className="relative mx-3 mt-1.5 aspect-square overflow-hidden rounded-[12px] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl}
          alt={label}
          loading="lazy"
          className={`h-full w-full object-cover ${
            photo.isVisible ? "" : "opacity-60"
          }`}
        />
        {!photo.isVisible ? (
          <span className="badge badge-muted absolute left-2 top-2">Скрыто</span>
        ) : null}
        {photo.hasBefore ? (
          <span className="badge absolute right-2 top-2">до/после</span>
        ) : null}
      </div>

      <div className="mt-3 border-t border-line px-3 py-3">
        <div className="label text-ink-2">
          Фото до чистки — необязательно
        </div>

        {photo.hasBefore && photo.beforePreviewUrl ? (
          <div className="mt-2 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.beforePreviewUrl}
              alt={`Фото до: ${label}`}
              loading="lazy"
              className="h-[72px] w-[72px] flex-none rounded-[12px] border border-line object-cover"
            />
            <button
              type="button"
              onClick={() => void removeBefore()}
              disabled={busy}
              className="btn btn-ghost min-h-11 w-auto px-3 text-[12.5px]"
            >
              Убрать фото до
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => beforeInputRef.current?.click()}
              disabled={busy}
              className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-[180ms] hover:border-accent hover:bg-accent-soft hover:text-accent-ink disabled:opacity-45"
            >
              <PlusIcon className="h-4 w-4" />
              Добавить фото до
            </button>
            <input
              ref={beforeInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Загрузить фото до"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void uploadBefore(event.target.files)}
            />
          </>
        )}
      </div>

      <div className="grid gap-2.5 border-t border-line p-3">
        <div>
          <label
            htmlFor={`caption-${photo.id}`}
            className="label mb-1.5 block text-ink-2"
          >
            Подпись
          </label>
          <div className="flex gap-2">
            <input
              id={`caption-${photo.id}`}
              value={caption}
              maxLength={80}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Необязательно"
              className="input h-11 min-w-0 flex-1 py-0 text-[13.5px]"
            />
            <button
              type="button"
              onClick={() => void patch({ caption: caption.trim() }, "Подпись сохранена")}
              disabled={!dirty || busy}
              aria-label="Сохранить подпись"
              className="btn-small flex-none"
            >
              {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : "Сохранить"}
            </button>
          </div>
          <p className="caption mt-1">{caption.trim().length} / 80</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void patch({ move: "up" }, "Порядок обновлён")}
            disabled={index === 0 || busy}
            aria-label="Поднять фото выше"
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void patch({ move: "down" }, "Порядок обновлён")}
            disabled={index === total - 1 || busy}
            aria-label="Опустить фото ниже"
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <ArrowDownIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              void patch(
                { isVisible: !photo.isVisible },
                photo.isVisible ? "Фото скрыто" : "Фото опубликовано",
              )
            }
            disabled={busy}
            className="min-h-11 rounded-[10px] border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
          >
            {photo.isVisible ? "Скрыть" : "Показать"}
          </button>

          <button
            type="button"
            onClick={() => setConfirm(true)}
            disabled={busy}
            aria-label="Удалить фото"
            className="ml-auto grid h-11 w-11 place-items-center rounded-[10px] text-ink-3 hover:bg-surface-2 hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        {notice ? (
          <p
            role="status"
            aria-live="polite"
            className={`text-[12px] leading-4 ${
              notice.kind === "ok" ? "text-accent-ink" : "text-danger"
            }`}
          >
            {notice.text}
          </p>
        ) : null}
      </div>

      {confirm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(25,23,20,0.45)] p-5"
          role="presentation"
          onClick={() => setConfirm(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`delete-gallery-${photo.id}`}
            className="w-full max-w-[420px] rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={`delete-gallery-${photo.id}`} className="h3">
              Удалить фото?
            </h2>
            <p className="small mt-2 text-ink-2">
              {photo.caption
                ? `«${photo.caption}» исчезнет с сайта и из хранилища.`
                : "Фото исчезнет с сайта и из хранилища."}
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                autoFocus
                className="btn btn-secondary w-full sm:w-auto"
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy}
                className="btn btn-danger w-full sm:w-auto"
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
