"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckIcon, SpinnerIcon } from "@/components/icons";

export type TariffRow = {
  id: string;
  category: string;
  label: string;
  variantLabel: string;
  basePrice: number | null;
  isManual: boolean;
  isActive: boolean;
};

export type TariffSettingsValues = {
  minOrder: number;
  soilingPercent: number;
  secondSidePercent: number;
  outOfTownFee: number;
  roundingStep: number;
};

const GROUP_LABEL: Record<string, string> = {
  sofa: "Диваны",
  armchair: "Кресла",
  mattress: "Матрасы",
  chair: "Стулья",
  other: "Другое",
};

const GROUP_ORDER = ["sofa", "armchair", "mattress", "chair", "other"];

export function TariffForm({
  items,
  settings,
}: {
  items: TariffRow[];
  settings: TariffSettingsValues;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [values, setValues] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<null | { kind: "ok" | "error"; text: string }>(
    null,
  );

  function updateRow(id: string, patch: Partial<TariffRow>) {
    setRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/tariffs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: values,
          items: rows.map((row) => ({
            id: row.id,
            basePrice: row.isManual ? null : row.basePrice,
            isActive: row.isActive,
          })),
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice({ kind: "error", text: data?.error ?? "Не удалось сохранить" });
        setBusy(false);
        return;
      }

      setNotice({ kind: "ok", text: "Тарифы сохранены. Старые заявки не изменились." });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
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

      <section className="card overflow-hidden" aria-labelledby="prices-title">
        <div className="border-b border-line px-4 py-3.5 md:px-5">
          <h2 id="prices-title" className="h3">
            Цены позиций
          </h2>
          <p className="caption mt-1">
            Сумма в рублях. У «Другого» цена не задаётся — только по фото.
          </p>
        </div>

        <div className="divide-y divide-line">
          {GROUP_ORDER.map((category) => {
            const group = rows.filter((row) => row.category === category);
            if (group.length === 0) return null;
            return (
              <div key={category} className="px-4 py-3.5 md:px-5">
                <div className="kicker">{GROUP_LABEL[category]}</div>
                <div className="mt-2 grid gap-2">
                  {group.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-3"
                    >
                      <div className="min-w-0">
                        <label
                          htmlFor={`price-${row.id}`}
                          className="block text-[14px] font-medium"
                        >
                          {row.variantLabel}
                        </label>
                        <label className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-2">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            onChange={(event) =>
                              updateRow(row.id, { isActive: event.target.checked })
                            }
                            className="h-4 w-4 accent-[var(--accent)]"
                          />
                          Показывать на сайте
                        </label>
                      </div>
                      {row.isManual ? (
                        <span className="text-right text-[13px] text-ink-2">
                          По фото
                        </span>
                      ) : (
                        <div className="relative">
                          <input
                            id={`price-${row.id}`}
                            inputMode="numeric"
                            value={row.basePrice === null ? "" : String(row.basePrice)}
                            onChange={(event) =>
                              updateRow(row.id, {
                                basePrice:
                                  event.target.value === ""
                                    ? null
                                    : Number(
                                        event.target.value.replace(/\D/g, "").slice(0, 7),
                                      ),
                              })
                            }
                            disabled={!row.isActive}
                            aria-label={`Цена: ${row.label} ${row.variantLabel}`}
                            className="input tabular h-11 py-0 pr-8 text-right text-[13.5px]"
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-ink-2">
                            ₽
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card p-4 md:p-5" aria-labelledby="rules-title">
        <h2 id="rules-title" className="h3">
          Правила расчёта
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(
            [
              { key: "minOrder", label: "Минимальный заказ, ₽", hint: "Только чистка, без выезда" },
              { key: "soilingPercent", label: "Сильные загрязнения, %", hint: "К сумме позиции" },
              { key: "secondSidePercent", label: "Вторая сторона матраса, %", hint: "После загрязнений" },
              { key: "outOfTownFee", label: "Выезд за город, ₽", hint: "Фиксированно на заказ" },
              { key: "roundingStep", label: "Округление вверх, ₽", hint: "Один раз в конце" },
            ] as const
          ).map((field) => (
            <div key={field.key}>
              <label
                htmlFor={`setting-${field.key}`}
                className="label mb-1.5 block text-ink-2"
              >
                {field.label}
              </label>
              <input
                id={`setting-${field.key}`}
                inputMode="numeric"
                value={String(values[field.key])}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [field.key]: Number(
                      event.target.value.replace(/\D/g, "").slice(0, 6) || 0,
                    ),
                  }))
                }
                className="input tabular"
              />
              <p className="mt-1 text-[11.5px] leading-4 text-ink-3">{field.hint}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          aria-busy={busy}
          className="btn btn-primary w-auto px-6"
        >
          {busy ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
          {busy ? "Сохраняем…" : "Сохранить тарифы"}
        </button>
        <p className="caption max-w-[42ch]">
          Изменение прайса не трогает уже отправленные заявки: в них сохранён снимок
          тарифов.
        </p>
      </div>
    </div>
  );
}
