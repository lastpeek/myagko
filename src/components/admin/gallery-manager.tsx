"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CameraIcon,
  CloseIcon,
  PlusIcon,
  SpinnerIcon,
} from "@/components/icons";
import { preparePhoto } from "@/lib/client-image";
import {
  deleteGalleryDraft,
  listGalleryDrafts,
  putGalleryDraft,
  type GalleryDraft,
} from "@/lib/gallery-drafts";

export type GalleryAdminItem = {
  id: string;
  caption: string;
  isVisible: boolean;
  previewUrl: string;
  hasBefore: boolean;
  beforePreviewUrl: string | null;
  createdAt: string;
};

type Toast = {
  kind: "ok" | "error";
  text: string;
  retry?: () => void;
};

type PendingUpload = {
  id: string;
  fileName: string;
  previewUrl: string;
  status: "preparing" | "queued" | "uploading" | "error";
  progress: number;
  error: string | null;
  file: File;
  prepared: Blob | null;
};

type UploadTask = {
  promise: Promise<Record<string, unknown> | null>;
  abort: () => void;
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function uploadName(fileName: string): string {
  return `${fileName.replace(/\.[^.]+$/, "")}.webp`;
}

function requestUpload(
  url: string,
  field: string,
  blob: Blob,
  fileName: string,
  onProgress: (percent: number) => void,
): UploadTask {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Record<string, unknown> | null>(
    (resolve, reject) => {
      xhr.open("POST", url);
      xhr.responseType = "json";
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total === 0) return;
        onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.onload = () => {
        const data = (xhr.response ?? null) as
          | { error?: string; [key: string]: unknown }
          | null;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }
        reject(new Error(data?.error ?? "Не удалось загрузить фото"));
      };
      xhr.onerror = () => reject(new Error("Связь пропала. Попробуйте ещё раз."));
      xhr.onabort = () =>
        reject(new DOMException("Загрузка отменена", "AbortError"));

      const form = new FormData();
      form.append(field, blob, fileName);
      xhr.send(form);
    },
  );

  return { promise, abort: () => xhr.abort() };
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function actionError(error: unknown, fallback: string): string {
  if (!(error instanceof Error) || !error.message) return fallback;
  if (/failed to fetch|networkerror|load failed/i.test(error.message)) {
    return fallback;
  }
  return error.message;
}

export function GalleryManager({
  photos,
  limit,
}: {
  photos: GalleryAdminItem[];
  limit: number;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState(photos);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const previewUrls = useRef(new Map<string, string>());
  const aborts = useRef(new Map<string, () => void>());
  const cancelled = useRef(new Set<string>());
  const resumed = useRef(false);
  const uploadQueue = useRef<Promise<void>>(Promise.resolve());

  function showToast(next: Toast) {
    setToast(next);
  }

  function updatePending(id: string, patch: Partial<PendingUpload>) {
    setPending((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  }

  function removePending(id: string) {
    const previewUrl = previewUrls.current.get(id);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(id);
    }
    setPending((current) => current.filter((entry) => entry.id !== id));
  }

  async function uploadPrepared(id: string, blob: Blob, fileName: string) {
    if (cancelled.current.has(id)) return;
    updatePending(id, { status: "uploading", progress: 0, error: null });
    const task = requestUpload(
      "/api/admin/gallery",
      "files",
      blob,
      uploadName(fileName),
      (progress) => updatePending(id, { progress }),
    );
    aborts.current.set(id, task.abort);

    try {
      const data = (await task.promise) as
        | { photos?: GalleryAdminItem[]; error?: string }
        | null;
      const created = data?.photos?.[0];
      if (!created) throw new Error(data?.error ?? "Сервер не вернул фото");
      if (cancelled.current.has(id)) return;

      removePending(id);
      setItems((current) => [...current, created]);
      void deleteGalleryDraft(id).catch(() => undefined);
      router.refresh();
    } catch (error) {
      if (cancelled.current.has(id) || isAbortError(error)) return;
      updatePending(id, {
        status: "error",
        progress: 0,
        error:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить фото. Попробуйте ещё раз.",
      });
    } finally {
      aborts.current.delete(id);
    }
  }

  function enqueueUpload(id: string, blob: Blob, fileName: string) {
    uploadQueue.current = uploadQueue.current
      .then(() => uploadPrepared(id, blob, fileName))
      .catch(() => undefined);
  }

  async function prepareAndUpload(id: string, file: File, fileName: string) {
    if (cancelled.current.has(id)) return;
    updatePending(id, { status: "preparing", progress: 0, error: null });

    const prepared = await preparePhoto(file);
    if (cancelled.current.has(id)) return;
    if (!prepared.ok) {
      updatePending(id, { status: "error", error: prepared.error });
      return;
    }

    updatePending(id, { prepared: prepared.photo.blob, status: "queued" });
    enqueueUpload(id, prepared.photo.blob, fileName);
  }

  function startUpload(
    file: File,
    draftId = makeId(),
    createdAt = Date.now(),
  ) {
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.set(draftId, previewUrl);
    setPending((current) => [
      ...current,
      {
        id: draftId,
        fileName: file.name,
        previewUrl,
        status: "preparing",
        progress: 0,
        error: null,
        file,
        prepared: null,
      },
    ]);

    void putGalleryDraft({
      id: draftId,
      file,
      fileName: file.name,
      createdAt,
    })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled.current.has(draftId)) {
          void prepareAndUpload(draftId, file, file.name);
        }
      });
  }

  function cancelPending(id: string) {
    cancelled.current.add(id);
    aborts.current.get(id)?.();
    removePending(id);
    void deleteGalleryDraft(id).catch(() => undefined);
  }

  function retryPending(entry: PendingUpload) {
    cancelled.current.delete(entry.id);
    if (entry.prepared) {
      enqueueUpload(entry.id, entry.prepared, entry.fileName);
      return;
    }
    void prepareAndUpload(entry.id, entry.file, entry.fileName);
  }

  function pickFiles(files: FileList | null) {
    const list = files ? Array.from(files) : [];
    if (inputRef.current) inputRef.current.value = "";
    if (list.length === 0) return;

    const room = limit - items.length - pending.length;
    if (room <= 0) {
      showToast({
        kind: "error",
        text: `Можно загрузить не больше ${limit} фото.`,
      });
      return;
    }
    if (list.length > room) {
      showToast({
        kind: "error",
        text: `Свободно ещё ${room} из ${limit}. Выберите меньше файлов.`,
      });
      return;
    }

    const createdAt = Date.now();
    list.forEach((file, index) =>
      startUpload(file, undefined, createdAt + index),
    );
  }

  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;

    void (async () => {
      let drafts: GalleryDraft[] = [];
      try {
        drafts = await listGalleryDrafts();
      } catch {
        return;
      }

      const room = Math.max(0, limit - photos.length);
      for (const draft of drafts.slice(0, room)) {
        if (cancelled.current.has(draft.id)) continue;
        const file =
          draft.file instanceof File
            ? draft.file
            : new File([draft.file], draft.fileName, {
                type: draft.file.type || "image/jpeg",
              });
        const previewUrl = URL.createObjectURL(file);
        previewUrls.current.set(draft.id, previewUrl);
        setPending((current) => [
          ...current,
          {
            id: draft.id,
            fileName: draft.fileName,
            previewUrl,
            status: "preparing",
            progress: 0,
            error: null,
            file,
            prepared: null,
          },
        ]);
        void prepareAndUpload(draft.id, file, draft.fileName);
      }
    })();
    // Черновики читаем один раз при открытии страницы.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patchPhoto(
    item: GalleryAdminItem,
    body: Record<string, unknown>,
    optimistic: Partial<GalleryAdminItem>,
  ): Promise<boolean> {
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? { ...entry, ...optimistic } : entry,
      ),
    );

    try {
      const response = await fetch(`/api/admin/gallery/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Не удалось сохранить");
      }
      router.refresh();
      return true;
    } catch (error) {
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? item : entry)),
      );
      showToast({
        kind: "error",
        text: actionError(
          error,
          "Не удалось сохранить. Связь пропала, попробуйте ещё раз.",
        ),
      });
      return false;
    }
  }

  function movePhoto(item: GalleryAdminItem, direction: -1 | 1) {
    const index = items.findIndex((entry) => entry.id === item.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;

    const snapshot = items;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);

    void (async () => {
      try {
        const response = await fetch(`/api/admin/gallery/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            move: direction === -1 ? "up" : "down",
          }),
        });
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!response.ok) {
          throw new Error(data?.error ?? "Не удалось изменить порядок");
        }
        router.refresh();
      } catch (error) {
        setItems(snapshot);
        showToast({
          kind: "error",
          text: actionError(error, "Не удалось изменить порядок"),
        });
      }
    })();
  }

  async function deletePhotoRequest(item: GalleryAdminItem, index: number) {
    try {
      const response = await fetch(`/api/admin/gallery/${item.id}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error ?? "Не удалось удалить фото");
      }
      router.refresh();
    } catch (error) {
      setItems((current) => {
        if (current.some((entry) => entry.id === item.id)) return current;
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, item);
        return next;
      });
      showToast({
        kind: "error",
        text: actionError(
          error,
          "Не удалось удалить фото. Связь пропала, попробуйте ещё раз.",
        ),
        retry: () => {
          setItems((current) => current.filter((entry) => entry.id !== item.id));
          void deletePhotoRequest(item, index);
        },
      });
    }
  }

  function deletePhoto(item: GalleryAdminItem) {
    const index = items.findIndex((entry) => entry.id === item.id);
    if (index < 0) return;
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    void deletePhotoRequest(item, index);
  }

  const total = items.length + pending.length;
  const full = total >= limit;

  return (
    <div className="grid gap-3">
      {toast ? (
        <div
          role="alert"
          className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-[560px] items-center gap-3 rounded-[14px] border border-line bg-surface p-3 shadow-[var(--shadow)]"
        >
          <span className="min-w-0 flex-1 text-[13px] leading-5">
            {toast.text}
          </span>
          {toast.retry ? (
            <button
              type="button"
              onClick={() => {
                const retry = toast.retry;
                setToast(null);
                retry?.();
              }}
              className="btn-small flex-none"
            >
              Повторить
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Закрыть уведомление"
            className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      ) : null}

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
            {total} / {limit}
          </span>
        </div>

        <p className="small mt-2 max-w-[62ch] text-ink-2">
          Фото сжимается в браузере до 1600 px, поэтому загрузка идёт в фоне.
          Можно закрыть страницу — черновик продолжится при следующем заходе.
        </p>
        <p className="small mt-1 max-w-[62ch] text-ink-2">
          Снимите мебель с одного ракурса и с одинаковым светом — иначе сравнение
          выглядит нечестно.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={full}
          className="btn btn-secondary mt-3 w-auto px-4"
        >
          <PlusIcon className="h-4 w-4" />
          {full ? `Лимит ${limit} фото` : "Загрузить фото"}
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          aria-label="Загрузить фото работ"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => pickFiles(event.target.files)}
        />
      </section>

      {items.length === 0 && pending.length === 0 ? (
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
          {items.map((photo, index) => (
            <GalleryCard
              key={photo.id}
              photo={photo}
              index={index}
              total={items.length}
              onPatch={patchPhoto}
              onMove={movePhoto}
              onDelete={deletePhoto}
              onToast={showToast}
            />
          ))}
          {pending.map((entry) => (
            <PendingCard
              key={entry.id}
              entry={entry}
              onCancel={() => cancelPending(entry.id)}
              onRetry={() => retryPending(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PendingCard({
  entry,
  onCancel,
  onRetry,
}: {
  entry: PendingUpload;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <article
      data-upload-id={entry.id}
      className="card overflow-hidden"
      aria-label={`Загрузка фото: ${entry.fileName}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <span className="label text-ink-2">Фото после чистки</span>
        <span className="caption">Загрузка</span>
      </div>

      <div className="relative mx-3 mt-1.5 aspect-[4/3] overflow-hidden rounded-[12px] bg-surface-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.previewUrl}
          alt={entry.fileName}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 grid place-items-center bg-[rgba(20,19,17,0.42)] p-4 text-center text-white">
          {entry.status === "error" ? (
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--danger)] text-[18px] font-semibold">
              !
            </span>
          ) : (
            <span>
              <SpinnerIcon className="mx-auto h-6 w-6" />
              <span className="mt-2 block text-[12px] font-medium">
                {entry.status === "preparing"
                  ? "Сжимаем фото…"
                  : entry.status === "queued"
                    ? "В очереди"
                    : `${entry.progress}%`}
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="p-3">
        {entry.status === "error" ? (
          <p role="alert" className="field-error">
            {entry.error}
          </p>
        ) : (
          <div
            role="progressbar"
            aria-label="Загрузка фото"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={entry.progress}
            className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-150"
              style={{
                width: `${
                  entry.status === "preparing" || entry.status === "queued"
                    ? 8
                    : entry.progress
                }%`,
              }}
            />
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {entry.status === "error" ? (
            <button
              type="button"
              onClick={onRetry}
              className="btn-small flex-none"
            >
              Повторить
            </button>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-ghost min-h-9 w-auto px-3 text-[12.5px]"
          >
            {entry.status === "error" ? "Убрать" : "Отменить"}
          </button>
        </div>
      </div>
    </article>
  );
}

type BeforeState = {
  url: string;
  pending: boolean;
  progress: number;
};

function GalleryCard({
  photo,
  index,
  total,
  onPatch,
  onMove,
  onDelete,
  onToast,
}: {
  photo: GalleryAdminItem;
  index: number;
  total: number;
  onPatch: (
    photo: GalleryAdminItem,
    body: Record<string, unknown>,
    optimistic: Partial<GalleryAdminItem>,
  ) => Promise<boolean>;
  onMove: (photo: GalleryAdminItem, direction: -1 | 1) => void;
  onDelete: (photo: GalleryAdminItem) => void;
  onToast: (toast: Toast) => void;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(photo.caption);
  const [savingCaption, setSavingCaption] = useState(false);
  const [notice, setNotice] = useState<Toast | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [before, setBefore] = useState<BeforeState | null>(
    photo.beforePreviewUrl
      ? { url: photo.beforePreviewUrl, pending: false, progress: 100 }
      : null,
  );
  const beforeInputRef = useRef<HTMLInputElement>(null);
  const beforeAbortRef = useRef<(() => void) | null>(null);
  const beforeCancelledRef = useRef(false);

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

  async function saveCaption() {
    setSavingCaption(true);
    setNotice(null);
    const value = caption.trim();
    const ok = await onPatch(photo, { caption: value }, { caption: value });
    setSavingCaption(false);
    if (ok) {
      setNotice({ kind: "ok", text: "Подпись сохранена" });
      window.setTimeout(() => setNotice(null), 2500);
    }
  }

  async function uploadBeforeFile(file: File) {
    const previous = before;
    const previewUrl = URL.createObjectURL(file);
    beforeCancelledRef.current = false;
    setBefore({ url: previewUrl, pending: true, progress: 0 });
    setNotice(null);

    try {
      const prepared = await preparePhoto(file);
      if (beforeCancelledRef.current) {
        setBefore(previous);
        return;
      }
      if (!prepared.ok) throw new Error(prepared.error);

      const task = requestUpload(
        `/api/admin/gallery/${photo.id}/before`,
        "file",
        prepared.photo.blob,
        uploadName(file.name),
        (progress) =>
          setBefore((current) =>
            current ? { ...current, progress } : current,
          ),
      );
      beforeAbortRef.current = task.abort;
      await task.promise;

      setBefore({ url: previewUrl, pending: false, progress: 100 });
      setNotice({ kind: "ok", text: "Фото до добавлено" });
      router.refresh();
    } catch (error) {
      setBefore(previous);
      if (!isAbortError(error)) {
        onToast({
          kind: "error",
          text: actionError(error, "Не удалось загрузить фото до"),
          retry: () => void uploadBeforeFile(file),
        });
      }
    } finally {
      beforeAbortRef.current = null;
      if (beforeInputRef.current) beforeInputRef.current.value = "";
    }
  }

  async function removeBefore() {
    const previous = before;
    setBefore(null);
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
        throw new Error(data?.error ?? "Не удалось убрать фото до");
      }
      setNotice({ kind: "ok", text: "Фото до убрано" });
      router.refresh();
    } catch (error) {
      setBefore(previous);
      onToast({
        kind: "error",
        text: actionError(error, "Не удалось убрать фото до"),
        retry: () => void removeBefore(),
      });
    }
  }

  return (
    <article
      data-photo-id={photo.id}
      className="card overflow-hidden"
      aria-label={label}
    >
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="label text-ink-2">Фото после чистки</span>
          <span className="caption">Обязательно</span>
        </div>

        <div className="relative mt-1.5 aspect-[4/3] overflow-hidden rounded-[12px] bg-surface-2">
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
            <span className="badge badge-muted absolute left-2 top-2">
              Скрыто
            </span>
          ) : null}
          {before && !before.pending ? (
            <span className="badge absolute bottom-2 left-2">до/после</span>
          ) : null}
          <button
            type="button"
            onClick={() => setConfirm(true)}
            aria-label="Удалить фото"
            title="Удалить фото"
            className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full border border-white/40 bg-[rgba(20,19,17,0.55)] text-white transition-colors hover:bg-[var(--danger)]"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="label text-ink-2">
            Фото до чистки — необязательно
          </span>
          {before?.pending ? (
            <button
              type="button"
              onClick={() => {
                beforeCancelledRef.current = true;
                beforeAbortRef.current?.();
              }}
              className="btn-small flex-none"
            >
              Отменить
            </button>
          ) : before ? (
            <button
              type="button"
              onClick={() => void removeBefore()}
              aria-label="Убрать фото до"
              title="Убрать фото до"
              className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {before ? (
          <div className="relative mt-1.5 aspect-[4/3] overflow-hidden rounded-[12px] bg-surface-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={before.url}
              alt={`Фото до: ${label}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
            {before.pending ? (
              <div className="absolute inset-0 grid place-items-center bg-[rgba(20,19,17,0.42)] text-white">
                <span className="text-center">
                  <SpinnerIcon className="mx-auto h-6 w-6" />
                  <span className="mt-2 block text-[12px] font-medium">
                    {before.progress > 0
                      ? `${before.progress}%`
                      : "Сжимаем фото…"}
                  </span>
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => beforeInputRef.current?.click()}
            className="mt-1.5 flex min-h-14 w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-line-strong bg-surface px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-[180ms] hover:border-accent hover:bg-accent-soft hover:text-accent-ink"
          >
            <PlusIcon className="h-4 w-4" />
            Добавить фото до
          </button>
        )}

        <input
          ref={beforeInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Загрузить фото до"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadBeforeFile(file);
          }}
        />
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
              onClick={() => void saveCaption()}
              disabled={!dirty || savingCaption}
              aria-label="Сохранить подпись"
              className="btn-small flex-none"
            >
              {savingCaption ? (
                <SpinnerIcon className="h-3.5 w-3.5" />
              ) : (
                "Сохранить"
              )}
            </button>
          </div>
          <p className="caption mt-1">{caption.trim().length} / 80</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onMove(photo, -1)}
            disabled={index === 0}
            aria-label="Поднять фото выше"
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(photo, 1)}
            disabled={index === total - 1}
            aria-label="Опустить фото ниже"
            className="grid h-11 w-11 place-items-center rounded-[10px] border border-line text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <ArrowDownIcon className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() =>
              void onPatch(
                photo,
                { isVisible: !photo.isVisible },
                { isVisible: !photo.isVisible },
              )
            }
            className="min-h-11 rounded-[10px] border border-line px-3 text-[12.5px] font-medium text-ink-2 hover:border-line-strong hover:text-ink"
          >
            {photo.isVisible ? "Скрыть" : "Показать"}
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
                onClick={() => {
                  setConfirm(false);
                  onDelete(photo);
                }}
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
