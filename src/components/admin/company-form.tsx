"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CheckIcon, SpinnerIcon } from "@/components/icons";
import { syncTerritoryCity } from "@/lib/company-text";
import type { CompanySettings } from "@/lib/db/schema";

export function CompanyForm({ company }: { company: CompanySettings }) {
  const router = useRouter();
  const [values, setValues] = useState(company);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<null | { kind: "ok" | "error"; text: string }>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) {
    setValues((current) => {
      if (key === "city") {
        const nextCity = String(value);
        return {
          ...current,
          city: nextCity,
          territory: syncTerritoryCity(current.city, nextCity, current.territory),
        };
      }
      return { ...current, [key]: value };
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setNotice(null);

    try {
      const response = await fetch("/api/admin/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string; fields?: Record<string, string> }
        | null;

      if (!response.ok) {
        setErrors(data?.fields ?? {});
        setNotice({ kind: "error", text: data?.error ?? "Не удалось сохранить" });
        setBusy(false);
        return;
      }

      setNotice({
        kind: "ok",
        text: "Сохранено. Цвет и тексты обновились на всех страницах.",
      });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  }

  function field(
    key: keyof CompanySettings,
    label: string,
    options: {
      hint?: string;
      type?: string;
      textarea?: boolean;
      rows?: number;
      maxLength?: number;
    } = {},
  ) {
    const id = `company-${key}`;
    const error = errors[key as string];
    const value = String(values[key] ?? "");

    return (
      <div className={options.textarea ? "sm:col-span-2" : ""}>
        <label htmlFor={id} className="label mb-1.5 block text-ink-2">
          {label}
        </label>
        {options.textarea ? (
          <textarea
            id={id}
            rows={options.rows ?? 3}
            value={value}
            onChange={(event) => set(key, event.target.value as never)}
            aria-invalid={error ? "true" : undefined}
            maxLength={options.maxLength}
            className="input resize-none"
          />
        ) : (
          <input
            id={id}
            type={options.type ?? "text"}
            value={value}
            onChange={(event) => set(key, event.target.value as never)}
            aria-invalid={error ? "true" : undefined}
            maxLength={options.maxLength}
            className="input"
          />
        )}
        {options.hint ? (
          <p className="mt-1 text-[11.5px] leading-4 text-ink-3">{options.hint}</p>
        ) : null}
        {error ? <p className="field-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-3" noValidate>
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

      <section className="card p-4 md:p-5">
        <h2 className="h3">Компания</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("name", "Название")}
          {field("browserTitle", "Заголовок вкладки браузера", {
            maxLength: 60,
            hint: "Необязательно. Пусто — «Название — услуги на выезде в Город»",
          })}
          {field("city", "Город")}
          {field("phone", "Телефон", { hint: "Показывается на сайте и в подвале" })}
          {field("email", "Почта")}
          {field("territory", "Территория выезда", {
            textarea: true,
            rows: 2,
            hint: "Где работаете и сколько стоит выезд. Если начинается с города, обновится вместе с ним",
          })}
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="h3">Первый экран</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {field("heroTitle", "Заголовок", {
            hint: "Вопрос о деле: «Что почистим?»",
          })}
          {field("heroSubtitle", "Подпись под заголовком", { textarea: true, rows: 2 })}
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <h2 className="h3">Акцентный цвет</h2>
        <p className="caption mt-1">
          Один цвет для кнопок и ссылок. Проверяем контраст с фоном и белым текстом.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            type="color"
            aria-label="Акцентный цвет"
            value={values.accentColor}
            onChange={(event) => set("accentColor", event.target.value.toUpperCase())}
            className="h-11 w-14 cursor-pointer rounded-[10px] border border-line bg-surface p-1"
          />
          <input
            value={values.accentColor}
            onChange={(event) => set("accentColor", event.target.value.toUpperCase())}
            aria-label="Акцентный цвет, HEX"
            aria-invalid={errors.accentColor ? "true" : undefined}
            className="input tabular w-[130px]"
            maxLength={7}
          />
          <span
            className="inline-flex h-11 items-center rounded-[12px] px-4 text-[13.5px] font-semibold text-white"
            style={{ background: values.accentColor }}
          >
            Кнопка
          </span>
          {errors.accentColor ? (
            <p className="field-error">{errors.accentColor}</p>
          ) : null}
        </div>
      </section>

      <section className="card p-4 md:p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={values.otherRequiresPhoto}
            onChange={(event) => set("otherRequiresPhoto", event.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--accent)]"
          />
          <span>
            <span className="block text-[14px] font-medium">
              «Другое» требует фото
            </span>
            <span className="caption block">
              Без фото такая позиция не уйдёт в заявку. Если выключить — мастер
              оценит по описанию.
            </span>
          </span>
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          aria-busy={busy}
          className="btn btn-primary w-auto px-6"
        >
          {busy ? <SpinnerIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
          {busy ? "Сохраняем…" : "Сохранить"}
        </button>
        <p className="caption max-w-[44ch]">
          Название и контакты из базы. Конфиг в коде — только значения для первого
          запуска.
        </p>
      </div>
    </form>
  );
}
