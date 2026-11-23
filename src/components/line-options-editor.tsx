"use client";

import { MinusIcon, PlusIcon } from "@/components/icons";
import type { CartOptionSelection } from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import type { PublicPriceOption } from "@/lib/ui-types";

function selectedQuantity(
  selections: CartOptionSelection[],
  id: string,
): number | null {
  return selections.find((selection) => selection.id === id)?.quantity ?? null;
}

export function LineOptionsEditor({
  options,
  selections,
  onChange,
  disabled = false,
}: {
  options: PublicPriceOption[];
  selections: CartOptionSelection[];
  onChange: (next: CartOptionSelection[]) => void;
  disabled?: boolean;
}) {
  const lineOptions = options.filter((option) => option.kind !== "fixed_order");

  if (lineOptions.length === 0) {
    return <p className="caption">У этого варианта нет доплат.</p>;
  }

  function toggle(option: PublicPriceOption) {
    const exists = selectedQuantity(selections, option.id) !== null;
    onChange(
      exists
        ? selections.filter((selection) => selection.id !== option.id)
        : [...selections, { id: option.id, quantity: 1 }],
    );
  }

  function setQuantity(option: PublicPriceOption, quantity: number) {
    const next = Math.min(99, Math.max(1, Math.trunc(quantity)));
    const exists = selections.some((selection) => selection.id === option.id);
    onChange(
      exists
        ? selections.map((selection) =>
            selection.id === option.id
              ? { ...selection, quantity: next }
              : selection,
          )
        : [...selections, { id: option.id, quantity: next }],
    );
  }

  return (
    <div className="grid gap-2">
      {lineOptions.map((option) => {
        const quantity = selectedQuantity(selections, option.id);
        const active = quantity !== null;

        if (option.kind === "percent") {
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(option)}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-[12px] border px-3.5 text-left text-[13px] transition-colors duration-[160ms] disabled:opacity-45 ${
                active
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line text-ink-2 hover:border-line-strong"
              }`}
            >
              <span>{option.label}</span>
              <span className="tabular font-semibold">+{option.value}%</span>
            </button>
          );
        }

        return (
          <div
            key={option.id}
            className={`rounded-[12px] border px-3.5 py-2.5 ${
              active
                ? "border-accent bg-accent-soft"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-pressed={active}
                disabled={disabled}
                onClick={() => toggle(option)}
                className="min-h-11 flex-1 text-left text-[13px] disabled:opacity-45"
              >
                <span className="block font-medium">{option.label}</span>
                <span className="caption">
                  {formatRub(option.value)} за штуку
                </span>
              </button>

              {active ? (
                <div className="inline-flex flex-none items-center rounded-[10px] border border-line bg-surface">
                  <button
                    type="button"
                    onClick={() => setQuantity(option, (quantity ?? 1) - 1)}
                    disabled={disabled || (quantity ?? 1) <= 1}
                    aria-label={`Уменьшить: ${option.label}`}
                    className="grid h-10 w-10 place-items-center text-ink-2 disabled:opacity-40"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="tabular min-w-7 text-center text-[13px] font-semibold">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity(option, (quantity ?? 1) + 1)}
                    disabled={disabled || (quantity ?? 1) >= 99}
                    aria-label={`Увеличить: ${option.label}`}
                    className="grid h-10 w-10 place-items-center text-ink-2 disabled:opacity-40"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
