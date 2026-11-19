"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  ArmchairIcon,
  ChairIcon,
  ChevronLeftIcon,
  EmptyCartIcon,
  InfoIcon,
  MattressIcon,
  MinusIcon,
  OtherIcon,
  PlusIcon,
  SofaIcon,
  TrashIcon,
} from "@/components/icons";
import { PhotoUploader } from "@/components/photo-uploader";
import {
  clampQuantity,
  photosMissingText,
  priceCart,
  removeItem,
  restoreItem,
  setFlags,
  setManualDescription,
  setQuantity,
  useCart,
  useCartHydrated,
  type CartItem,
} from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import { deletePhoto, prunePhotos } from "@/lib/photo-store";
import type { PublicRules, PublicTariff } from "@/lib/ui-types";

const ICON = {
  sofa: SofaIcon,
  armchair: ArmchairIcon,
  mattress: MattressIcon,
  chair: ChairIcon,
  other: OtherIcon,
};

export function CartView({
  tariffs,
  rules,
  maxPhotos,
  otherRequiresPhoto,
}: {
  tariffs: PublicTariff[];
  rules: PublicRules;
  maxPhotos: number;
  otherRequiresPhoto: boolean;
}) {
  const { items, checkout } = useCart();
  const hydrated = useCartHydrated();
  const router = useRouter();

  const [removed, setRemoved] = useState<CartItem | null>(null);
  const removedTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    const keep = new Set(items.flatMap((item) => item.photos.map((p) => p.id)));
    void prunePhotos(keep);
    // чистим только при входе в корзину, чтобы не мешать «Вернуть»
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const result = priceCart(items, tariffs, rules, checkout.outOfTown);

  const manualIncomplete = items.filter((item) => {
    if (item.category !== "other") return false;
    if (item.manualDescription.trim().length < 10) return true;
    if (otherRequiresPhoto && item.photos.length === 0) return true;
    return false;
  });

  function handleRemove(item: CartItem) {
    const removedItem = removeItem(item.uid);
    if (!removedItem) return;
    setRemoved(removedItem);
    if (removedTimer.current) window.clearTimeout(removedTimer.current);
    removedTimer.current = window.setTimeout(() => {
      void Promise.all(
        removedItem.photos.map((photo) => deletePhoto(photo.id)),
      );
      setRemoved(null);
    }, 5000);
  }

  function handleUndo() {
    if (!removed) return;
    restoreItem(removed);
    setRemoved(null);
    if (removedTimer.current) window.clearTimeout(removedTimer.current);
  }

  const totalLabel = result.total === null ? "По фото" : formatRub(result.total);
  const canCheckout = items.length > 0 && manualIncomplete.length === 0;

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:px-8">
        <div className="skeleton h-8 w-40" />
        <div className="mt-6 grid gap-3">
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-24 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-10 md:px-8">
        <h1 className="h1">Заявка</h1>
        <div className="card mt-6 flex flex-col items-center px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
            <EmptyCartIcon className="h-6 w-6" />
          </span>
          <h2 className="h3 mt-4">Пока пусто</h2>
          <p className="small mt-1.5 max-w-[34ch] text-ink-2">
            Выберите мебель — цена появится сразу.
          </p>
          <Link href="/#pick" className="btn btn-primary mt-5 w-auto px-6">
            Выбрать мебель
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-36 pt-2 md:px-8 md:pb-40">
      <Link
        href="/#pick"
        className="small inline-flex min-h-11 items-center gap-1 text-ink-2 no-underline hover:text-ink"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Что ещё почистить
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="h1">Заявка</h1>
        <span className="caption">
          {items.length} {items.length === 1 ? "позиция" : "позиции"}
        </span>
      </div>

      <div className="mt-4 grid gap-2.5">
        {items.map((item) => {
          const tariff = tariffs.find((entry) => entry.id === item.tariffId);
          const line = result.lines.find((entry) => entry.key === item.uid);
          const Icon = ICON[item.category];
          const flags: string[] = [];
          if (item.heavySoiling) flags.push("сильные загрязнения");
          if (item.secondSide) flags.push("две стороны");
          if (item.category === "other") flags.push("цена по фото");

          return (
            <article key={item.uid} className="card p-4 md:p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-[44px] w-[44px] flex-none place-items-center rounded-[12px] bg-surface-2 text-ink-2">
                  <Icon className="h-6 w-6" />
                </span>

                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
                    {item.label} · {item.variantLabel}
                  </h2>
                  <p className="mt-0.5 text-[12.5px] leading-4 text-ink-3">
                    {flags.length > 0
                      ? flags.join(", ")
                      : "Без доплат"}
                  </p>
                </div>

                <div className="tabular whitespace-nowrap text-right text-[15px] font-semibold">
                  {line?.manual || item.category === "other"
                    ? "По фото"
                    : formatRub(line?.lineTotal ?? null)}
                </div>
              </div>

              {item.category === "other" ? (
                <div className="mt-3">
                  <label
                    htmlFor={`desc-${item.uid}`}
                    className="label block text-ink-2"
                  >
                    Что почистить
                  </label>
                  <textarea
                    id={`desc-${item.uid}`}
                    value={item.manualDescription}
                    onChange={(event) =>
                      setManualDescription(item.uid, event.target.value)
                    }
                    rows={2}
                    maxLength={300}
                    placeholder="Например: изголовье кровати и две подушки"
                    aria-invalid={
                      item.manualDescription.trim().length < 10
                        ? "true"
                        : undefined
                    }
                    aria-describedby={`desc-hint-${item.uid}`}
                    className="input mt-1.5 resize-none"
                  />
                  <p
                    id={`desc-hint-${item.uid}`}
                    className={`mt-1 text-[12px] leading-4 ${
                      item.manualDescription.trim().length < 10
                        ? "text-warn"
                        : "text-ink-3"
                    }`}
                  >
                    Минимум 10 символов — иначе мастер не поймёт, что оценивать.
                  </p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="inline-flex items-center rounded-[12px] border border-line">
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(item.uid, clampQuantity(item.quantity - 1))
                    }
                    disabled={item.quantity <= 1}
                    aria-label="Уменьшить количество"
                    className="grid h-11 w-11 place-items-center text-ink-2 disabled:opacity-40"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span
                    className="tabular min-w-6 text-center text-[13.5px] font-semibold"
                    aria-live="polite"
                  >
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity(item.uid, clampQuantity(item.quantity + 1))
                    }
                    disabled={item.quantity >= 10}
                    aria-label="Увеличить количество"
                    className="grid h-11 w-11 place-items-center text-ink-2 disabled:opacity-40"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>

                {tariff?.allowsSoiling ? (
                  <button
                    type="button"
                    aria-pressed={item.heavySoiling}
                    onClick={() =>
                      setFlags(item.uid, { heavySoiling: !item.heavySoiling })
                    }
                    className={`min-h-11 rounded-[10px] border px-3 text-[12.5px] font-medium transition-colors duration-[160ms] ${
                      item.heavySoiling
                        ? "border-accent bg-accent-soft text-accent-ink"
                        : "border-line text-ink-2 hover:border-line-strong"
                    }`}
                  >
                    Сильные загрязнения
                    <span className="tabular ml-1 opacity-70">
                      +{rules.soilingPercent}%
                    </span>
                  </button>
                ) : null}

                {tariff?.allowsSecondSide ? (
                  <button
                    type="button"
                    aria-pressed={item.secondSide}
                    onClick={() =>
                      setFlags(item.uid, { secondSide: !item.secondSide })
                    }
                    className={`min-h-11 rounded-[10px] border px-3 text-[12.5px] font-medium transition-colors duration-[160ms] ${
                      item.secondSide
                        ? "border-accent bg-accent-soft text-accent-ink"
                        : "border-line text-ink-2 hover:border-line-strong"
                    }`}
                  >
                    Вторая сторона
                    <span className="tabular ml-1 opacity-70">
                      +{rules.secondSidePercent}%
                    </span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  aria-label={`Удалить: ${item.label} ${item.variantLabel}`}
                  className="ml-auto grid h-11 w-11 place-items-center rounded-[10px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="label text-ink-2">
                    {item.category === "other" && otherRequiresPhoto
                      ? "Фото обязательно"
                      : "Фото — по желанию"}
                  </span>
                  <span className="caption tabular">
                    {item.photos.length} / {maxPhotos}
                  </span>
                </div>
                <PhotoUploader
                  itemUid={item.uid}
                  photos={item.photos}
                  max={maxPhotos}
                  required={item.category === "other" && otherRequiresPhoto}
                  compact
                />
              </div>
            </article>
          );
        })}
      </div>

      <Link
        href="/#pick"
        className="btn btn-ghost mt-2.5 w-full"
      >
        <PlusIcon className="h-4 w-4" />
        Добавить предмет
      </Link>

      <section className="card mt-4 p-4 md:p-5" aria-label="Сумма">
        <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
          <span>Чистка</span>
          <span className="tabular">{formatRub(result.itemsSubtotal)}</span>
        </div>

        {result.minimumAdjustment > 0 ? (
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>До минимального заказа</span>
            <span className="tabular">
              +{formatRub(result.minimumAdjustment)}
            </span>
          </div>
        ) : null}

        {result.outOfTownFee > 0 ? (
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>Выезд за город</span>
            <span className="tabular">+{formatRub(result.outOfTownFee)}</span>
          </div>
        ) : (
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>Выезд по городу</span>
            <span>бесплатно</span>
          </div>
        )}

        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <span className="text-[15px] font-semibold">Итого</span>
          <span className="tabular text-[18px] font-semibold tracking-[-0.01em]">
            {totalLabel}
          </span>
        </div>

        {result.hasManualItems ? (
          <p className="small mt-3 text-ink-2">
            {result.manualItemsCount === result.lines.length
              ? "Все позиции «По фото» — сумму назовёт мастер."
              : `Известная сумма ${formatRub(result.total)}. Позиции «По фото» (${result.manualItemsCount}) мастер оценит после осмотра.`}
          </p>
        ) : null}

        {result.itemsSubtotal > 0 ? (
          <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-[18px] text-ink-2">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
            <span>
              {result.minimumAdjustment > 0
                ? `Минимальный заказ ${formatRub(rules.minOrder)} — добавлено ${formatRub(result.minimumAdjustment)}`
                : `Минимальный заказ ${formatRub(rules.minOrder)} за чистку — выполнен. Выезд считается отдельно.`}
            </span>
          </div>
        ) : null}

        <div className="mt-2 flex items-start gap-2 text-[12px] leading-[18px] text-ink-2">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
          <span>{photosMissingText(items)}</span>
        </div>
      </section>

      {manualIncomplete.length > 0 ? (
        <p className="small mt-3 text-warn" role="status">
          У «Другого» нужно описание и фото — заполните в карточке позиции.
        </p>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper">
        <div className="mx-auto w-full max-w-[720px] px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:flex md:items-center md:gap-4 md:px-8">
          <div className="flex items-baseline justify-between gap-3 md:block md:flex-1">
            <div className="text-[12.5px] leading-4 text-ink-2">Предварительно</div>
            <div className="tabular text-[21px] font-semibold leading-7 tracking-[-0.02em]">
              {totalLabel}
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push("/checkout")}
            disabled={!canCheckout}
            className="btn btn-primary mt-2.5 w-full md:mt-0 md:w-auto md:px-6"
          >
            Оформить заявку
          </button>
        </div>
      </div>

      <div className="sr-only" aria-live="polite">
        {removed ? "Позиция удалена" : ""}
      </div>

      <AnimatePresence>
        {removed ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className="fixed bottom-28 left-1/2 z-40 w-[calc(100%-40px)] max-w-[420px] -translate-x-1/2"
          >
            <div
              role="status"
              className="flex items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3 shadow-[var(--shadow)]"
            >
              <span className="small min-w-0 flex-1">
                Удалено: {removed.label.toLowerCase()} · {removed.variantLabel.toLowerCase()}
              </span>
              <button
                type="button"
                onClick={handleUndo}
                className="btn-small whitespace-nowrap"
              >
                Вернуть
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
