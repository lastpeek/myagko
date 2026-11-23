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
  OtherIcon,
  PlusIcon,
  SofaIcon,
  TrashIcon,
} from "@/components/icons";
import { LineOptionsEditor } from "@/components/line-options-editor";
import { OrderOptionsEditor } from "@/components/order-options-editor";
import { ParameterInput } from "@/components/parameter-input";
import { PhotoUploader } from "@/components/photo-uploader";
import {
  photosMissingText,
  priceCart,
  removeItem,
  restoreItem,
  setManualDescription,
  setOptionSelections,
  setParameterValue,
  updateCheckout,
  useCart,
  useCartHydrated,
  type CartItem,
  type CartOptionSelection,
} from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import { deletePhoto, prunePhotos } from "@/lib/photo-store";
import type { PublicPriceOption, PublicRules, PublicTariff } from "@/lib/ui-types";

const ICON: Record<string, typeof SofaIcon> = {
  sofa: SofaIcon,
  armchair: ArmchairIcon,
  mattress: MattressIcon,
  chair: ChairIcon,
  other: OtherIcon,
};

function legacySelections(
  item: CartItem,
  options: PublicPriceOption[],
): CartOptionSelection[] {
  const selections: CartOptionSelection[] = [];
  if (item.heavySoiling && options.some((option) => option.id === "soiling")) {
    selections.push({ id: "soiling", quantity: 1 });
  }
  if (
    item.secondSide &&
    options.some((option) => option.id === "second-side")
  ) {
    selections.push({ id: "second-side", quantity: 1 });
  }
  return selections;
}

export function CartView({
  tariffs,
  rules,
  maxPhotos,
  otherRequiresPhoto,
  orderOptions,
}: {
  tariffs: PublicTariff[];
  rules: PublicRules;
  maxPhotos: number;
  otherRequiresPhoto: boolean;
  orderOptions: PublicPriceOption[];
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

  const result = priceCart(
    items,
    tariffs,
    rules,
    checkout.outOfTown,
    orderOptions,
    checkout.orderOptionIds,
  );

  function isManualItem(item: CartItem): boolean {
    const tariff = tariffs.find((entry) => entry.id === item.tariffId);
    if (tariff) return tariff.isManual;
    return item.isManual || item.category === "other";
  }

  const manualIncomplete = items.filter(
    (item) =>
      isManualItem(item) && item.manualDescription.trim().length < 10,
  );

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

  const allManual =
    result.lines.length > 0 &&
    result.manualItemsCount === result.lines.length;
  const totalLabel = allManual ? "По фото" : formatRub(result.total);
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
            Выберите услугу — цена появится сразу.
          </p>
          <Link href="/#pick" className="btn btn-primary mt-5 w-auto px-6">
            Выбрать услугу
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
        Что ещё добавить
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
          const Icon = ICON[item.category] ?? OtherIcon;
          const manual = isManualItem(item);
          const selections =
            item.optionSelections.length > 0
              ? item.optionSelections
              : legacySelections(item, tariff?.options ?? []);
          const flags = line?.options?.length
            ? line.options.map((option) =>
                option.quantity && option.quantity > 1
                  ? `${option.label} × ${option.quantity}`
                  : option.label,
              )
            : [];
          const lineOptions =
            tariff?.options.filter((option) => option.kind !== "fixed_order") ??
            [];
          const requiresPhoto =
            Boolean(tariff?.requiresPhoto) ||
            (manual && otherRequiresPhoto);

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
                    {manual
                      ? "цена по фото"
                      : flags.length > 0
                        ? flags.join(", ")
                        : "Без доплат"}
                  </p>
                </div>

                <div className="tabular whitespace-nowrap text-right text-[15px] font-semibold">
                  {manual || line?.manual
                    ? "По фото"
                    : formatRub(line?.lineTotal ?? null)}
                </div>
              </div>

              {manual ? (
                <div className="mt-3">
                  <label
                    htmlFor={`desc-${item.uid}`}
                    className="label block text-ink-2"
                  >
                    Что оценить
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
              ) : tariff ? (
                <div className="mt-3">
                  <ParameterInput
                    id={`param-${item.uid}`}
                    label={tariff.parameterLabel}
                    unit={tariff.unit}
                    value={item.parameterValue}
                    min={tariff.minValue}
                    max={tariff.maxValue}
                    step={tariff.step}
                    onChange={(value) => setParameterValue(item.uid, value)}
                  />
                </div>
              ) : null}

              {!manual && lineOptions.length > 0 ? (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="label mb-2 text-ink-2">Доплаты</div>
                  <LineOptionsEditor
                    options={tariff?.options ?? []}
                    selections={selections}
                    onChange={(next) => setOptionSelections(item.uid, next)}
                  />
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  aria-label={`Удалить: ${item.label} ${item.variantLabel}`}
                  className="grid h-11 w-11 place-items-center rounded-[10px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-danger"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="label text-ink-2">
                    {requiresPhoto ? "Фото обязательно" : "Фото — по желанию"}
                  </span>
                  <span className="caption tabular">
                    {item.photos.length} / {maxPhotos}
                  </span>
                </div>
                <PhotoUploader
                  itemUid={item.uid}
                  photos={item.photos}
                  max={maxPhotos}
                  required={requiresPhoto}
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

      <OrderOptionsEditor
        options={orderOptions}
        selectedIds={checkout.orderOptionIds}
        onChange={(orderOptionIds) => updateCheckout({ orderOptionIds })}
      />

      <section className="card mt-4 p-4 md:p-5" aria-label="Сумма">
        <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
          <span>Работы</span>
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

        {result.orderOptionsTotal > 0 ? (
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>Дополнительно к заказу</span>
            <span className="tabular">
              +{formatRub(result.orderOptionsTotal)}
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

        {result.roundingAdjustment > 0 ? (
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>Округление</span>
            <span className="tabular">
              +{formatRub(result.roundingAdjustment)}
            </span>
          </div>
        ) : null}

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
                : `Минимальный заказ ${formatRub(rules.minOrder)} за работы — выполнен. Выезд считается отдельно.`}
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
          Для позиций «По фото» нужно описание — заполните в карточке. Фото
          можно добавить на оформлении.
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
