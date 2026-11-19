"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { SpinnerIcon, TrashIcon } from "@/components/icons";
import type { OrderStatus } from "@/lib/db/schema";
import { formatRub } from "@/lib/format";
import { isValidDate, isValidTime, isPastDate } from "@/lib/time";

export type EditableOrder = {
  id: string;
  publicNumber: number;
  status: OrderStatus;
  finalPrice: number | null;
  agreedDate: string | null;
  agreedTimeFrom: string | null;
  agreedTimeTo: string | null;
  ownerNote: string;
};

type Notice = { kind: "ok" | "error"; text: string } | null;

export function OrderEditor({ order }: { order: EditableOrder }) {
  const router = useRouter();

  const [price, setPrice] = useState(
    order.finalPrice === null ? "" : String(order.finalPrice),
  );
  const [date, setDate] = useState(order.agreedDate ?? "");
  const [from, setFrom] = useState(order.agreedTimeFrom ?? "");
  const [to, setTo] = useState(order.agreedTimeTo ?? "");
  const [note, setNote] = useState(order.ownerNote);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [confirm, setConfirm] = useState<null | "delete" | "cancel">(null);

  const editable = order.status === "new" || order.status === "agreed";

  useEffect(() => {
    if (!confirm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirm(null);
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
      const response = await fetch(`/api/admin/orders/${order.id}`, {
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

  function collect() {
    const parsedPrice = price.trim() === "" ? null : Number(price.replace(/\D/g, ""));
    return {
      finalPrice:
        parsedPrice !== null && Number.isFinite(parsedPrice) ? parsedPrice : null,
      agreedDate: date || null,
      agreedTimeFrom: from || null,
      agreedTimeTo: to || null,
      ownerNote: note,
    };
  }

  async function save() {
    const values = collect();
    await patch(values, "Изменения сохранены");
  }

  async function changeStatus(status: OrderStatus) {
    const values = collect();

    if (status === "agreed") {
      if (values.finalPrice === null) {
        setNotice({ kind: "error", text: "Поставьте итоговую цену" });
        return;
      }
      if (!values.agreedDate || !values.agreedTimeFrom || !values.agreedTimeTo) {
        setNotice({ kind: "error", text: "Заполните дату и время визита" });
        return;
      }
      if (!isValidDate(values.agreedDate) || isPastDate(values.agreedDate)) {
        setNotice({ kind: "error", text: "Проверьте дату визита" });
        return;
      }
      if (
        !isValidTime(values.agreedTimeFrom) ||
        !isValidTime(values.agreedTimeTo) ||
        values.agreedTimeFrom >= values.agreedTimeTo
      ) {
        setNotice({ kind: "error", text: "Проверьте интервал времени" });
        return;
      }
    }

    if (status === "cancelled" && confirm !== "cancel") {
      setConfirm("cancel");
      return;
    }

    setConfirm(null);
    const done = await patch({ ...values, status }, "Статус обновлён");
    if (done) setNotice({ kind: "ok", text: "Статус обновлён" });
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setNotice({ kind: "error", text: data?.error ?? "Не удалось удалить" });
        setBusy(false);
        setConfirm(null);
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
      setBusy(false);
      setConfirm(null);
    }
  }

  return (
    <div className="grid gap-3">
      {notice ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-[12px] border px-3.5 py-2.5 text-[13px] leading-5 ${
            notice.kind === "ok"
              ? "border-line bg-accent-soft text-accent-ink"
              : "border-[var(--danger)] text-danger"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <div className="card p-4">
        <label htmlFor="final-price" className="label block text-ink-2">
          Итоговая цена
        </label>
        <div className="relative mt-2">
          <input
            id="final-price"
            inputMode="numeric"
            value={price}
            onChange={(event) =>
              setPrice(event.target.value.replace(/[^\d]/g, "").slice(0, 7))
            }
            disabled={!editable}
            placeholder="Например, 5960"
            className="input tabular pr-9"
            aria-describedby="final-price-hint"
          />
          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-ink-2">
            ₽
          </span>
        </div>
        <p id="final-price-hint" className="caption mt-1.5">
          {price
            ? `Клиент увидит ${formatRub(Number(price || 0))}`
            : "Пока пусто — клиент видит предварительную сумму"}
        </p>
      </div>

      <div className="card p-4">
        <h2 className="label text-ink-2">Согласованное время</h2>
        <div className="mt-2 grid gap-2">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            disabled={!editable}
            aria-label="Дата визита"
            className="input"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="agreed-from"
                className="label mb-1 block text-ink-2"
              >
                с
              </label>
              <input
                id="agreed-from"
                type="time"
                step={300}
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                disabled={!editable}
                aria-label="Время с"
                className="input"
              />
            </div>
            <div>
              <label htmlFor="agreed-to" className="label mb-1 block text-ink-2">
                по
              </label>
              <input
                id="agreed-to"
                type="time"
                step={300}
                value={to}
                onChange={(event) => setTo(event.target.value)}
                disabled={!editable}
                aria-label="Время по"
                className="input"
              />
            </div>
          </div>
        </div>
        <p className="caption mt-1.5">
          Одна дата и интервал «с–по». Нужны для статуса «Согласована».
        </p>
      </div>

      <div className="card p-4">
        <label htmlFor="owner-note" className="label block text-ink-2">
          Заметка владельца
        </label>
        <textarea
          id="owner-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={!editable}
          placeholder="Видно только в кабинете"
          className="input mt-2 resize-none"
        />
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={busy || !editable}
        aria-busy={busy}
        className="btn btn-primary w-full"
      >
        {busy ? <SpinnerIcon className="h-4 w-4" /> : null}
        {busy ? "Сохраняем…" : "Сохранить"}
      </button>

      {!editable ? (
        <p className="caption">
          {order.status === "done"
            ? "Завершённую заявку нельзя изменить."
            : "Отменённую заявку нельзя изменить, пока не вернёте её в новые."}
        </p>
      ) : null}

      <div className="mt-1 grid gap-2">
        {order.status === "new" ? (
          <button
            type="button"
            onClick={() => void changeStatus("agreed")}
            disabled={busy}
            className="btn btn-secondary w-full"
          >
            Согласовать
          </button>
        ) : null}

        {order.status === "agreed" ? (
          <button
            type="button"
            onClick={() => void changeStatus("done")}
            disabled={busy}
            className="btn btn-secondary w-full"
          >
            Завершить
          </button>
        ) : null}

        {order.status === "cancelled" ? (
          <button
            type="button"
            onClick={() => void changeStatus("new")}
            disabled={busy}
            className="btn btn-secondary w-full"
          >
            Вернуть в новые
          </button>
        ) : null}

        {editable ? (
          <button
            type="button"
            onClick={() => void changeStatus("cancelled")}
            disabled={busy}
            className="btn btn-ghost w-full text-danger"
          >
            Отменить заявку
          </button>
        ) : null}
      </div>

      <div className="mt-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setConfirm("delete")}
          disabled={busy}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium text-danger hover:bg-surface-2"
        >
          <TrashIcon className="h-4 w-4" />
          Удалить заявку
        </button>
      </div>

      {confirm ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[rgba(25,23,20,0.45)] p-5"
          role="presentation"
          onClick={() => setConfirm(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="w-full max-w-[420px] rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title" className="h3">
              {confirm === "delete"
                ? `Удалить заявку №${order.publicNumber}?`
                : "Отменить заявку?"}
            </h2>
            <p className="small mt-2 text-ink-2">
              {confirm === "delete"
                ? "Фото, история и данные клиента удалятся безвозвратно. Номер заявки не переиспользуется."
                : "Клиент увидит статус «Отменена». Вернуть заявку можно в новые."}
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                autoFocus
                className="btn btn-secondary w-full sm:w-auto"
              >
                Оставить
              </button>
              <button
                type="button"
                onClick={() =>
                  confirm === "delete" ? void remove() : void changeStatus("cancelled")
                }
                disabled={busy}
                className="btn btn-danger w-full sm:w-auto"
              >
                {confirm === "delete" ? "Удалить" : "Отменить заявку"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
