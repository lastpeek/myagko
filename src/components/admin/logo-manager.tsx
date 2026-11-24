"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SpinnerIcon } from "@/components/icons";
import { Logo } from "@/components/logo";

export function LogoManager({
  initialLogoUrl,
}: {
  initialLogoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const [logo, setLogo] = useState(initialLogoUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function clearPreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreview(null);
  }

  async function upload(file: File) {
    setError(null);
    if (inputRef.current) inputRef.current.value = "";

    if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
      setError("SVG не поддерживаем, загрузите PNG.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Нужен PNG, JPEG или WebP. SVG не поддерживаем, загрузите PNG.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Файл больше 2 МБ. Сожмите или выберите другой.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    previewRef.current = objectUrl;
    setPreview(objectUrl);
    setBusy(true);

    try {
      const form = new FormData();
      form.append("file", file, file.name);
      const response = await fetch("/api/admin/logo", {
        method: "POST",
        body: form,
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; logoUrl?: string }
        | null;

      if (!response.ok || !data?.logoUrl) {
        setError(data?.error ?? "Не удалось сохранить логотип");
        clearPreview();
        return;
      }

      setLogo(data.logoUrl);
      clearPreview();
      router.refresh();
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
      clearPreview();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/logo", { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setError(data?.error ?? "Не удалось убрать логотип");
        return;
      }
      clearPreview();
      setLogo(null);
      router.refresh();
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const shown = preview ?? logo;

  return (
    <section
      className="card p-4 md:p-5"
      aria-labelledby="logo-title"
      data-testid="logo-manager"
    >
      <h2 id="logo-title" className="h3">
        Логотип
      </h2>
      <p className="caption mt-1 max-w-[62ch]">
        PNG, JPEG или WebP · до 2 МБ · рекомендуется квадрат не меньше 512×512.
        SVG не поддерживаем.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Logo src={shown} alt="Логотип" size={48} radius={14} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-busy={busy}
            className="btn btn-secondary h-10 w-auto px-4 text-[13px]"
          >
            {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
            {shown ? "Заменить" : "Загрузить"}
          </button>
          {logo ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="btn btn-ghost h-10 w-auto px-4 text-[13px]"
            >
              Убрать
            </button>
          ) : null}
        </div>
        {busy ? (
          <span className="caption" role="status" aria-live="polite">
            Сохраняем…
          </span>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Загрузить логотип"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {error ? (
        <p role="alert" className="field-error mt-2">
          {error}
        </p>
      ) : null}
    </section>
  );
}
