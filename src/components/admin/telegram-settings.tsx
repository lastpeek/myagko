"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SpinnerIcon } from "@/components/icons";

export type TelegramInitialState = {
  configured: boolean;
  botUsername: string | null;
  connected: boolean;
  chatId: string | null;
  username: string | null;
};

type LinkCode = {
  code: string;
  url: string;
  ttlMinutes: number;
};

export function TelegramSettings({
  initial,
}: {
  initial: TelegramInitialState;
}) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [link, setLink] = useState<LinkCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [testNotice, setTestNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!link) return;

    let active = true;
    const tick = async () => {
      try {
        const response = await fetch("/api/admin/telegram", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as {
          connected?: boolean;
          username?: string | null;
          chatId?: string | null;
        };
        if (active && data.connected) {
          setState((current) => ({
            ...current,
            connected: true,
            username: data.username ?? null,
            chatId: data.chatId ?? null,
          }));
          setLink(null);
          router.refresh();
        }
      } catch {
        // сеть пропала — попробуем на следующем тике
      }
    };

    void tick();
    const timer = window.setInterval(tick, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [link, router]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/telegram/code", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { code?: string; url?: string; ttlMinutes?: number; error?: string }
        | null;

      if (!response.ok || !data?.code || !data.url) {
        setError(data?.error ?? "Не удалось создать код подключения");
        return;
      }

      setLink({
        code: data.code,
        url: data.url,
        ttlMinutes: data.ttlMinutes ?? 15,
      });
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    setTestNotice(null);
    try {
      const response = await fetch("/api/admin/telegram", {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error ?? "Не удалось отключить Telegram");
        return;
      }
      setState((current) => ({
        ...current,
        connected: false,
        username: null,
        chatId: null,
      }));
      setLink(null);
      router.refresh();
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setTestNotice(null);
    try {
      const response = await fetch("/api/admin/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: manual.trim() }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Проверьте chat_id");
        return;
      }

      setState((current) => ({
        ...current,
        connected: true,
        username: null,
        chatId: manual.trim(),
      }));
      setLink(null);
      setManualOpen(false);
      router.refresh();
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setTestNotice(null);
    try {
      const response = await fetch("/api/admin/telegram/test", {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setError(data?.error ?? "Telegram не ответил");
        return;
      }

      setTestNotice("Тестовое сообщение отправлено");
    } catch {
      setError("Связь пропала. Попробуйте ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-4 md:p-5" aria-labelledby="telegram-title">
      <h2 id="telegram-title" className="h3">
        Уведомления
      </h2>
      <p className="small mt-1.5 max-w-[62ch] text-ink-2">
        Новая заявка придёт в Telegram сразу после записи. Так мастер на выезде
        узнает о ней, не открывая кабинет.
      </p>

      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}

      {state.connected ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge">
              Подключено:{" "}
              {state.username ? `@${state.username}` : `chat_id ${state.chatId}`}
            </span>
            <button
              type="button"
              onClick={() => void sendTest()}
              disabled={busy}
              className="btn btn-ghost min-h-11 w-auto px-4 text-[13px]"
            >
              {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : null}
              Отправить тестовое сообщение
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={busy}
              className="btn btn-ghost min-h-11 w-auto px-4 text-[13px]"
            >
              Отключить
            </button>
          </div>
          {testNotice ? (
            <p role="status" className="mt-2 text-[12px] text-accent-ink">
              {testNotice}
            </p>
          ) : null}
        </div>
      ) : !state.configured ? (
        <p className="mt-4 rounded-[12px] bg-surface-2 px-3.5 py-3 text-[12.5px] leading-5 text-ink-2">
          Telegram-бот не настроен на сервере. Задайте{" "}
          <code className="font-mono">TELEGRAM_BOT_TOKEN</code> и{" "}
          <code className="font-mono">TELEGRAM_BOT_USERNAME</code> — после этого
          здесь появится подключение.
        </p>
      ) : (
        <div className="mt-4">
          {link ? (
            <div className="rounded-[14px] border border-line bg-surface p-4">
              <p className="small text-ink-2">
                Код:{" "}
                <span className="font-mono text-ink" data-telegram-code={link.code}>
                  {link.code}
                </span>{" "}
                · действует {link.ttlMinutes} минут
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-secondary w-auto px-4"
                >
                  Открыть Telegram
                </a>
                <button
                  type="button"
                  onClick={() => void connect()}
                  disabled={busy}
                  className="btn btn-ghost min-h-11 w-auto px-4 text-[13px]"
                >
                  Новый код
                </button>
              </div>
              <p className="caption mt-3">
                Нажмите Start в боте. Эта страница обновится сама.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              aria-busy={busy}
              className="btn btn-secondary w-auto px-4"
            >
              {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
              Подключить Telegram
            </button>
          )}

          <div className="mt-4 border-t border-line pt-3">
            <button
              type="button"
              onClick={() => setManualOpen((value) => !value)}
              aria-expanded={manualOpen}
              className="text-[12.5px] font-medium text-ink-2 underline underline-offset-2"
            >
              Введите chat_id вручную
            </button>

            {manualOpen ? (
              <form onSubmit={saveManual} className="mt-2 flex flex-wrap items-end gap-2">
                <div className="min-w-[180px] flex-1">
                  <label htmlFor="telegram-chat-id" className="label mb-1.5 block text-ink-2">
                    chat_id
                  </label>
                  <input
                    id="telegram-chat-id"
                    value={manual}
                    onChange={(event) => setManual(event.target.value)}
                    inputMode="numeric"
                    placeholder="Например, 123456789"
                    className="input h-11 py-0 text-[13.5px]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !manual.trim()}
                  className="btn-small"
                >
                  Сохранить chat_id
                </button>
                <p className="caption w-full">
                  Узнать chat_id можно у @userinfobot в Telegram. Для группы
                  chat_id начинается с минуса.
                </p>
              </form>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
