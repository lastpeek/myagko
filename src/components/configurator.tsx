"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  ArmchairIcon,
  ChairIcon,
  CheckIcon,
  ChevronRightIcon,
  MattressIcon,
  OtherIcon,
  SofaIcon,
} from "@/components/icons";
import { addItem } from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import type { PublicTariff } from "@/lib/ui-types";

const CATEGORY_ORDER = ["sofa", "armchair", "mattress", "chair", "other"] as const;

const CATEGORY_ICON = {
  sofa: SofaIcon,
  armchair: ArmchairIcon,
  mattress: MattressIcon,
  chair: ChairIcon,
  other: OtherIcon,
};

const CATEGORY_HINT = {
  sofa: "2, 3 места, угловой",
  armchair: "Обычное или реклайнер",
  mattress: "Одна или две стороны",
  chair: "Сиденье или со спинкой",
  other: "Опишите и приложите фото",
};

export function Configurator({
  tariffs,
  heroTitle,
  heroSubtitle,
  minOrder,
}: {
  tariffs: PublicTariff[];
  heroTitle: string;
  heroSubtitle: string;
  minOrder: number;
}) {
  const categories = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => {
        const variants = tariffs.filter((item) => item.category === category);
        return { category, variants };
      }).filter((entry) => entry.variants.length > 0),
    [tariffs],
  );

  const [selectedCategory, setSelectedCategory] = useState<string>(
    categories[0]?.category ?? "sofa",
  );
  const [selectedId, setSelectedId] = useState<string>(
    categories[0]?.variants[0]?.id ?? "",
  );
  const [added, setAdded] = useState<{ id: number; label: string } | null>(null);
  const sequence = useRef(0);

  const selected = tariffs.find((item) => item.id === selectedId) ?? null;

  function pickCategory(category: string) {
    const group = categories.find((entry) => entry.category === category);
    setSelectedCategory(category);
    if (group?.variants[0] && !group.variants.some((v) => v.id === selectedId)) {
      setSelectedId(group.variants[0].id);
    }
  }

  function addToCart() {
    if (!selected) return;
    addItem({
      tariffId: selected.id,
      category: selected.category,
      label: selected.label,
      variantLabel: selected.variantLabel,
      quantity: 1,
    });
    sequence.current += 1;
    setAdded({
      id: sequence.current,
      label: `${selected.label} · ${selected.variantLabel}`,
    });
    window.setTimeout(() => setAdded(null), 4000);
  }

  const priceLabel = selected
    ? selected.isManual
      ? "По фото"
      : formatRub(selected.basePrice)
    : "";

  return (
    <section className="relative" aria-labelledby="configurator-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8 lg:px-10">
        <h1 id="configurator-title" className="display max-w-[16ch]">
          {heroTitle}
        </h1>
        <p className="body mt-2 max-w-[46ch] text-ink-2">{heroSubtitle}</p>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div>
            <div className="grid gap-2.5">
              {categories.map(({ category, variants }) => {
                const active = selectedCategory === category;
                const Icon = CATEGORY_ICON[category];
                const prices = variants
                  .map((variant) => variant.basePrice)
                  .filter((price): price is number => price !== null);
                const from = prices.length ? Math.min(...prices) : null;
                const manual = variants.every((variant) => variant.isManual);
                const label = variants[0]?.label ?? "";

                return (
                  <div key={category}>
                    <button
                      type="button"
                      onClick={() => pickCategory(category)}
                      aria-pressed={active}
                      className={`grid w-full grid-cols-[46px_minmax(0,1fr)_auto_16px] items-center gap-x-3 gap-y-0.5 rounded-[20px] border p-4 text-left transition-[border-color,background-color] duration-[180ms] ${
                        active
                          ? "border-accent bg-accent-soft"
                          : "border-line bg-surface hover:border-line-strong"
                      }`}
                    >
                      <span
                        className={`row-span-2 grid h-[46px] w-[46px] place-items-center self-center rounded-[13px] ${
                          active ? "bg-surface" : "bg-surface-2"
                        }`}
                      >
                        <Icon className="h-6 w-6 text-ink" />
                      </span>
                      <span className="min-w-0 truncate text-[15px] font-semibold leading-6 tracking-[-0.01em]">
                        {label}
                      </span>
                      <span className="tabular col-start-3 justify-self-end whitespace-nowrap text-[14px] font-semibold">
                        {manual
                          ? "по фото"
                          : from !== null
                            ? `от ${formatRub(from)}`
                            : "—"}
                      </span>
                      <ChevronRightIcon className="col-start-4 row-span-2 h-4 w-4 self-center text-ink-3" />
                      <span className="col-span-2 col-start-2 row-start-2 text-[12.5px] leading-4 text-ink-2">
                        {CATEGORY_HINT[category]}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {active && variants.length > 0 ? (
                        <motion.div
                          key={category}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                          className="pt-3"
                        >
                          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                            {variants.map((variant) => (
                              <button
                                key={variant.id}
                                type="button"
                                aria-pressed={selectedId === variant.id}
                                onClick={() => setSelectedId(variant.id)}
                                className="pill"
                              >
                                {variant.variantLabel}
                              </button>
                            ))}
                          </div>
                          {category === "other" ? (
                            <p className="small mt-2 text-ink-2">
                              Для «Другого» нужно фото — без него заявка не уйдёт.
                            </p>
                          ) : null}
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="hidden lg:block" aria-hidden="true">
            <div className="card p-6">
              <div className="kicker">Как считается цена</div>
              <p className="body mt-3 text-ink-2">
                Базовая цена варианта, количество, доплаты за сильные загрязнения и
                вторую сторону матраса. Минимум заказа — {formatRub(minOrder)} за
                чистку, выезд за город считается отдельно.
              </p>
              <div className="hr my-5" />
              <div className="flex items-baseline justify-between">
                <span className="small text-ink-2">Выбрано</span>
                <span className="text-[15px] font-semibold">
                  {selected ? `${selected.label} · ${selected.variantLabel}` : "—"}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="small text-ink-2">Предварительно</span>
                <span className="tabular text-[22px] font-semibold tracking-[-0.02em]">
                  {priceLabel}
                </span>
              </div>
              <p className="caption mt-4">
                Точную цену мастер подтвердит после фото. Фото добавите в корзине.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 mt-8 border-t border-line bg-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:flex md:items-center md:gap-6 md:px-8 lg:px-10">
          <div className="flex items-baseline justify-between gap-3 md:flex-1">
            <div className="min-w-0">
              <div className="truncate text-[12.5px] leading-4 text-ink-2">
                {selected ? `${selected.label} · ${selected.variantLabel}` : "Выберите мебель"}
              </div>
              <div className="caption mt-0.5 truncate">
                {selected?.isManual ? "Цену назовёт мастер" : "Чистка, без выезда"}
              </div>
            </div>
            <div className="tabular whitespace-nowrap text-[21px] font-semibold tracking-[-0.02em]">
              {priceLabel || "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={addToCart}
            disabled={!selected}
            className="btn btn-primary mt-2.5 w-full md:mt-0 md:w-auto md:px-8"
          >
            В корзину
          </button>
        </div>
      </div>

      <AnimatePresence>
        {added ? (
          <motion.div
            key={added.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed bottom-24 left-1/2 z-30 w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow)]">
              <span className="grid h-8 w-8 flex-none place-items-center rounded-full bg-accent-soft text-accent-ink">
                <CheckIcon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold">{added.label}</div>
                <div className="caption">Добавлено в корзину</div>
              </div>
              <Link href="/cart" className="btn-small whitespace-nowrap">
                Открыть
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
