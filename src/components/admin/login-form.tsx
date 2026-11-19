"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SpinnerIcon } from "@/components/icons";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(
          response.status === 429
            ? "Слишком много попыток. Подождите 15 минут."
            : (data?.error ?? "Не удалось войти"),
        );
        setBusy(false);
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      {error ? (
        <div
          role="alert"
          className="rounded-[12px] border border-[var(--danger)] px-3.5 py-3 text-[13px] leading-5 text-danger"
        >
          {error}
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="label mb-1.5 block text-ink-2">
          Почта
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="input"
          placeholder="owner@example.ru"
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="label mb-1.5 block text-ink-2">
          Пароль
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="input"
          required
        />
      </div>

      <button type="submit" disabled={busy} aria-busy={busy} className="btn btn-primary mt-1">
        {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
        {busy ? "Проверяем…" : "Войти"}
      </button>
    </form>
  );
}
