"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SpinnerIcon } from "@/components/icons";

export function ChangePasswordForm({
  gate = false,
}: {
  gate?: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setErrors({});
    setBanner(null);

    if (newPassword.length < 10) {
      setErrors({ newPassword: "Минимум 10 символов" });
      return;
    }
    if (newPassword !== repeatPassword) {
      setErrors({ repeatPassword: "Пароли не совпадают" });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, repeatPassword }),
      });
      const data = (await response.json().catch(() => null)) as
        | { fields?: Record<string, string>; error?: string }
        | null;

      if (!response.ok) {
        setErrors(data?.fields ?? {});
        setBanner(data?.error ?? "Не удалось сменить пароль");
        setBusy(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setRepeatPassword("");
      setBusy(false);
      if (gate) {
        router.replace("/admin");
      } else {
        setBanner("Пароль изменён. Остальные устройства вышли из кабинета.");
      }
      router.refresh();
    } catch {
      setBanner("Связь пропала. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      {banner ? (
        <div
          role="alert"
          className="rounded-[12px] border border-line bg-surface-2 px-3.5 py-3 text-[13px] leading-5"
        >
          {banner}
        </div>
      ) : null}

      <div>
        <label htmlFor="current-password" className="label mb-1.5 block text-ink-2">
          Текущий пароль
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          aria-invalid={errors.currentPassword ? "true" : undefined}
          className="input"
        />
        {errors.currentPassword ? (
          <p className="field-error">{errors.currentPassword}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="new-password" className="label mb-1.5 block text-ink-2">
          Новый пароль
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-invalid={errors.newPassword ? "true" : undefined}
          aria-describedby="new-password-hint"
          className="input"
        />
        <p id="new-password-hint" className="mt-1.5 text-[11.5px] leading-4 text-ink-3">
          Минимум 10 символов. После смены все старые сессии закрываются.
        </p>
        {errors.newPassword ? (
          <p className="field-error">{errors.newPassword}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="repeat-password" className="label mb-1.5 block text-ink-2">
          Повторите пароль
        </label>
        <input
          id="repeat-password"
          type="password"
          autoComplete="new-password"
          value={repeatPassword}
          onChange={(event) => setRepeatPassword(event.target.value)}
          aria-invalid={errors.repeatPassword ? "true" : undefined}
          className="input"
        />
        {errors.repeatPassword ? (
          <p className="field-error">{errors.repeatPassword}</p>
        ) : null}
      </div>

      <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary w-auto justify-self-start px-6">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
        {busy ? "Меняем…" : "Сменить пароль"}
      </button>
    </form>
  );
}
