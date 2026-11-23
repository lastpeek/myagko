"use client";

import { CheckIcon } from "@/components/icons";
import { formatRub } from "@/lib/format";
import type { PublicPriceOption } from "@/lib/ui-types";

export function OrderOptionsEditor({
  options,
  selectedIds,
  onChange,
  disabled = false,
}: {
  options: PublicPriceOption[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  if (options.length === 0) return null;

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((optionId) => optionId !== id)
        : [...selectedIds, id],
    );
  }

  return (
    <section className="card p-4 md:p-5" aria-labelledby="order-options-title">
      <h2 id="order-options-title" className="h3">
        Дополнительно к заказу
      </h2>
      <p className="caption mt-1">
        Эти доплаты добавляются один раз на весь заказ.
      </p>
      <div className="mt-3 grid gap-2">
        {options.map((option) => {
          const active = selectedIds.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(option.id)}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-[12px] border px-3.5 text-left text-[13px] transition-colors duration-[160ms] disabled:opacity-45 ${
                active
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`grid h-4 w-4 place-items-center rounded-[4px] border ${
                    active ? "border-accent bg-accent text-white" : "border-line"
                  }`}
                  aria-hidden="true"
                >
                  {active ? <CheckIcon className="h-3 w-3" /> : null}
                </span>
                {option.label}
              </span>
              <span className="tabular font-semibold">
                +{formatRub(option.value)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
