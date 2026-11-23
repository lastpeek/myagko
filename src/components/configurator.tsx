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
import { LineOptionsEditor } from "@/components/line-options-editor";
import { ParameterInput } from "@/components/parameter-input";
import {
  addItem,
  findItemByConfig,
  type CartOptionSelection,
} from "@/lib/cart-store";
import { calculateOrder } from "@/lib/calc/pricing";
import { formatDecimal, formatRub } from "@/lib/format";
import { addFilesToItem } from "@/lib/photo-upload";
import type {
  PublicCatalogService,
  PublicRules,
  PublicService,
  PublicTariff,
} from "@/lib/ui-types";

const ICONS: Record<string, typeof SofaIcon> = {
  sofa: SofaIcon,
  armchair: ArmchairIcon,
  mattress: MattressIcon,
  chair: ChairIcon,
  other: OtherIcon,
};

type CategoryNode = PublicService & {
  services: Array<PublicCatalogService & { variants: PublicTariff[] }>;
};

export function Configurator({
  categories,
  catalogServices,
  tariffs,
  rules,
  heroTitle,
  heroSubtitle,
  maxPhotos,
}: {
  categories: PublicService[];
  catalogServices: PublicCatalogService[];
  tariffs: PublicTariff[];
  rules: PublicRules;
  heroTitle: string;
  heroSubtitle: string;
  maxPhotos: number;
}) {
  const tree = useMemo<CategoryNode[]>(
    () =>
      categories
        .map((category) => ({
          ...category,
          services: catalogServices
            .filter((service) => service.categoryId === category.id)
            .map((service) => ({
              ...service,
              variants: tariffs.filter(
                (tariff) => tariff.serviceId === service.id,
              ),
            }))
            .filter((service) => service.variants.length > 0),
        }))
        .filter((category) => category.services.length > 0),
    [categories, catalogServices, tariffs],
  );

  const firstVariant = tree[0]?.services[0]?.variants[0] ?? null;
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    tree[0]?.id ?? "",
  );
  const [selectedVariantId, setSelectedVariantId] = useState(
    firstVariant?.id ?? "",
  );
  const [parameterValue, setParameterValue] = useState(
    firstVariant?.minValue ?? 1,
  );
  const [optionSelections, setOptionSelections] = useState<
    CartOptionSelection[]
  >([]);
  const [added, setAdded] = useState<{ id: number; label: string } | null>(null);
  const sequence = useRef(0);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const photoTargetRef = useRef<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const selectedCategory = tree.find(
    (category) => category.id === selectedCategoryId,
  );
  const selected =
    tariffs.find((tariff) => tariff.id === selectedVariantId) ??
    selectedCategory?.services[0]?.variants[0] ??
    null;

  function selectVariant(id: string) {
    const variant = tariffs.find((tariff) => tariff.id === id);
    setSelectedVariantId(id);
    setParameterValue(variant?.minValue ?? 1);
    setOptionSelections([]);
  }

  const preview = useMemo(() => {
    if (!selected) return null;
    return calculateOrder({
      items: [
        {
          key: selected.id,
          category: selected.category,
          serviceId: selected.serviceId,
          serviceLabel: selected.serviceLabel,
          variantId: selected.id,
          variantLabel: selected.variantLabel,
          unit: selected.unit,
          parameterLabel: selected.parameterLabel,
          parameterValue,
          pricePerUnit: selected.basePrice ?? 0,
          manual: selected.isManual,
          options: selected.options,
          optionSelections,
        },
      ],
      rules,
      outOfTown: false,
    });
  }, [selected, parameterValue, optionSelections, rules]);

  const selectedCartItem = selected
    ? findItemByConfig({
        tariffId: selected.id,
        parameterValue,
        optionSelections,
        manualDescription: "",
      })
    : null;

  const photoCount = selectedCartItem?.photos.length ?? 0;
  const showPhotoAction = Boolean(selected && !selected.isManual);
  const canAddMorePhotos = photoCount < maxPhotos;

  const priceLabel = selected
    ? selected.isManual
      ? "По фото"
      : formatRub(preview?.total ?? null)
    : "";

  function pickCategory(categoryId: string) {
    const category = tree.find((entry) => entry.id === categoryId);
    const variant = category?.services[0]?.variants[0];
    setSelectedCategoryId(categoryId);
    if (variant) selectVariant(variant.id);
  }

  function cartInput() {
    if (!selected) return null;
    return {
      tariffId: selected.id,
      category: selected.category,
      serviceId: selected.serviceId,
      serviceLabel: selected.serviceLabel,
      label: selected.label,
      variantLabel: selected.variantLabel,
      unit: selected.unit,
      parameterLabel: selected.parameterLabel,
      parameterValue,
      optionSelections,
      isManual: selected.isManual,
    };
  }

  function addSelectedToCart(): string | null {
    const input = cartInput();
    return input ? addItem(input) : null;
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
    if (!selected || selected.isManual) return;

    setPhotoError(null);
    const existing = findItemByConfig({
      tariffId: selected.id,
      parameterValue,
      optionSelections,
      manualDescription: "",
    });
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

  return (
    <section className="relative" aria-labelledby="configurator-title">
      <div className="mx-auto w-full max-w-[1120px] px-5 md:px-8 lg:px-10">
        <h1 id="configurator-title" className="display max-w-[24ch]">
          {heroTitle}
        </h1>
        <p className="body mt-2 max-w-[46ch] text-ink-2">{heroSubtitle}</p>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <div>
            <div className="grid gap-2.5">
              {tree.map((category) => {
                const active = selectedCategoryId === category.id;
                const Icon = ICONS[category.icon] ?? OtherIcon;
                const variants = category.services.flatMap(
                  (service) => service.variants,
                );
                const prices = variants
                  .map((variant) => variant.basePrice)
                  .filter((price): price is number => price !== null);
                const from = prices.length ? Math.min(...prices) : null;
                const manual = variants.every((variant) => variant.isManual);

                return (
                  <div key={category.id}>
                    <button
                      type="button"
                      onClick={() => pickCategory(category.id)}
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
                        {category.label}
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
                        {category.hint}
                      </span>
                    </button>

                    <AnimatePresence initial={false}>
                      {active ? (
                        <motion.div
                          key={category.id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                          className="pt-3"
                        >
                          {category.services.map((service) => (
                            <div key={service.id} className="mb-3 last:mb-0">
                              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                <span className="label text-ink-2">
                                  {service.label}
                                </span>
                                {service.hint ? (
                                  <span className="caption truncate">
                                    {service.hint}
                                  </span>
                                ) : null}
                              </div>
                              <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
                                {service.variants.map((variant) => (
                                  <button
                                    key={variant.id}
                                    type="button"
                                    aria-pressed={selected?.id === variant.id}
                                    onClick={() => selectVariant(variant.id)}
                                    className="pill"
                                  >
                                    {variant.variantLabel}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}

                          {selected ? (
                            <div className="card mt-2 p-4">
                              {!selected.isManual ? (
                                <ParameterInput
                                  key={selected.id}
                                  id={`param-${selected.id}`}
                                  label={
                                    selected.parameterLabel || "Количество"
                                  }
                                  unit={selected.unit}
                                  value={parameterValue}
                                  min={selected.minValue ?? 1}
                                  max={selected.maxValue ?? 99}
                                  step={selected.step ?? 1}
                                  onChange={setParameterValue}
                                />
                              ) : (
                                <p className="small text-ink-2">
                                  Опишите предмет и добавьте фото в корзине —
                                  мастер назовёт цену после осмотра.
                                </p>
                              )}

                              {selected.options.length > 0 ? (
                                <div className="mt-4">
                                  <div className="label mb-2 text-ink-2">
                                    Доплаты
                                  </div>
                                  <LineOptionsEditor
                                    options={selected.options}
                                    selections={optionSelections}
                                    onChange={setOptionSelections}
                                  />
                                </div>
                              ) : null}

                              <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-3">
                                <span className="small text-ink-2">
                                  Предварительно
                                </span>
                                <span className="tabular text-[20px] font-semibold">
                                  {priceLabel}
                                </span>
                              </div>
                              {!selected.isManual &&
                              preview?.formulas[selected.id] ? (
                                <p className="caption mt-1">
                                  {preview.formulas[selected.id]}
                                </p>
                              ) : null}
                              {preview && preview.minimumApplied > 0 ? (
                                <p className="caption mt-1">
                                  С учётом минимального заказа{" "}
                                  {formatRub(rules.minOrder)}.
                                </p>
                              ) : null}
                            </div>
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
                Значение параметра × цена за единицу. Затем проценты и фиксы,
                минимум заказа — {formatRub(rules.minOrder)} за работы. Выезд
                за город считается отдельно.
              </p>
              <div className="hr my-5" />
              <div className="flex items-baseline justify-between gap-3">
                <span className="small text-ink-2">Выбрано</span>
                <span className="text-right text-[15px] font-semibold">
                  {selected
                    ? `${selected.label} · ${selected.variantLabel}`
                    : "—"}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="small text-ink-2">Предварительно</span>
                <span className="tabular text-[22px] font-semibold tracking-[-0.02em]">
                  {priceLabel || "—"}
                </span>
              </div>
              <p className="caption mt-4">
                {selected?.isManual
                  ? "Для ручной позиции описание и фото добавите в корзине."
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
                    : "Выберите позицию"}
                </div>
                <div className="caption mt-0.5 truncate">
                  {selected?.isManual
                    ? "Цену назовёт мастер"
                    : `${selected?.parameterLabel ?? "Количество"}: ${formatDecimal(parameterValue)} ${selected?.unit ?? ""}`}
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
