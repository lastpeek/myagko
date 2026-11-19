"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  ArmchairIcon,
  CameraIcon,
  ChairIcon,
  CheckIcon,
  ChevronRightIcon,
  MattressIcon,
  OtherIcon,
  SofaIcon,
} from "@/components/icons";
import { addItem, findItemByConfig, useCart } from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import { addFilesToItem } from "@/lib/photo-upload";
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
  armchair: "Обычное или с откидной спинкой",
  mattress: "С одной или двумя сторонами",
  chair: "Только сиденье или весь стул",
  other: "Опишите и приложите фото",
};

export function Configurator({
  tariffs,
  heroTitle,
  heroSubtitle,
  minOrder,
  maxPhotos,
}: {
  tariffs: PublicTariff[];
  heroTitle: string;
  heroSubtitle: string;
  minOrder: number;
  maxPhotos: number;
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

  const { items } = useCart();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const selected = tariffs.find((item) => item.id === selectedId) ?? null;

  const selectedCartItem = selected
    ? (items.find(
        (item) =>
          item.tariffId === selected.id &&
          !item.heavySoiling &&
          !item.secondSide &&
          item.manualDescription === "",
      ) ?? null)
    : null;

  const photoCount = selectedCartItem?.photos.length ?? 0;
  const showPhotoAction = Boolean(selected && selected.category !== "other");
  const canAddMorePhotos = photoCount < maxPhotos;

  function pickCategory(category: string) {
    const group = categories.find((entry) => entry.category === category);
    setSelectedCategory(category);
    if (group?.variants[0] && !group.variants.some((v) => v.id === selectedId)) {
      setSelectedId(group.variants[0].id);
    }
  }

  function addSelectedToCart(): string | null {
    if (!selected) return null;
    return addItem({
      tariffId: selected.id,
      category: selected.category,
      label: selected.label,
      variantLabel: selected.variantLabel,
      quantity: 1,
    });
  }

  function addToCart() {
    if (!selected) return;
    addSelectedToCart();
    sequence.current += 1;
    setAdded({
      id: sequence.current,
      label: `${selected.label} · ${selected.variantLabel}`,
    });
    window.setTimeout(() => setAdded(null), 4000);
  }

  function startPhoto() {
    if (!selected || selected.category === "other") return;

    setPhotoError(null);
    const existing = findItemByConfig({ tariffId: selected.id });
    const uid = existing?.uid ?? addSelectedToCart();
    if (!uid) return;

    photoTargetRef.current = uid;
    photoInputRef.current?.click();
  }

  async function handlePhotoFiles(files: FileList | null) {
    const target = photoTargetRef.current;

    if (!files || files.length === 0) {
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    if (!target) return;

    setPhotoBusy(true);
    const uploadError = await addFilesToItem(target, files, maxPhotos);
    setPhotoError(uploadError);
    setPhotoBusy(false);
    photoTargetRef.current = null;
    if (photoInputRef.current) photoInputRef.current.value = "";
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
                {selected?.isManual
                  ? "Для «Другого» описание и фото добавите в корзине."
                  : "Точную цену мастер подтвердит после фото. Снимок можно добавить сразу."}
              </p>
            </div>
          </aside>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 mt-8 border-t border-line bg-paper">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:px-8 lg:px-10">
          {photoError ? (
            <p
              role="alert"
              className="mb-2 max-w-[60ch] text-[12px] leading-4 text-danger"
            >
              {photoError}
            </p>
          ) : null}

          <div className="md:flex md:items-center md:gap-6">
            <div className="flex items-baseline justify-between gap-3 md:block md:flex-1">
              <div className="min-w-0">
                <div className="truncate text-[12.5px] leading-4 text-ink-2">
                  {selected
                    ? `${selected.label} · ${selected.variantLabel}`
                    : "Выберите мебель"}
                </div>
                <div className="caption mt-0.5 truncate">
                  {selected?.isManual
                    ? "Цену назовёт мастер"
                    : "Чистка, без выезда"}
                </div>
                {photoCount > 0 ? (
                  <div
                    className="tabular mt-0.5 text-[12px] leading-4 text-ink-2"
                    aria-live="polite"
                  >
                    фото {photoCount} / {maxPhotos}
                  </div>
                ) : null}
              </div>
              <div className="tabular whitespace-nowrap text-[21px] font-semibold tracking-[-0.02em]">
                {priceLabel || "—"}
              </div>
            </div>

            <div className="mt-2.5 flex items-stretch gap-2.5 md:mt-0">
              <button
                type="button"
                onClick={addToCart}
                disabled={!selected}
                className="btn btn-primary w-auto min-w-0 flex-1 md:flex-none md:px-8"
              >
                В корзину
              </button>

              {showPhotoAction && canAddMorePhotos ? (
                <button
                  type="button"
                  onClick={startPhoto}
                  disabled={photoBusy}
                  aria-busy={photoBusy}
                  aria-label="Добавить фото"
                  className="btn btn-secondary h-[54px] min-h-[54px] w-[54px] flex-none border-line-strong px-0 min-[390px]:w-auto min-[390px]:px-3 md:h-12 md:min-h-12"
                >
                  <CameraIcon className="h-5 w-5" />
                  <span className="hidden min-[390px]:inline">
                    {photoCount > 0 ? "Ещё фото" : "Добавить фото"}
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          {showPhotoAction ? (
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              aria-label="Фото к выбранной позиции"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void handlePhotoFiles(event.target.files)}
            />
          ) : null}
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
