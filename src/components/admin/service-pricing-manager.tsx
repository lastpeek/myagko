"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  PlusIcon,
  SpinnerIcon,
  TrashIcon,
} from "@/components/icons";
import { LineOptionsEditor } from "@/components/line-options-editor";
import { ParameterInput } from "@/components/parameter-input";
import {
  calculateOrder,
  type PricingOption,
} from "@/lib/calc/pricing";
import type { CartOptionSelection } from "@/lib/cart-store";
import { formatDecimal, formatRub } from "@/lib/format";

export type AdminCategory = {
  id: string;
  label: string;
  hint: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminCatalogService = {
  id: string;
  categoryId: string;
  label: string;
  hint: string;
  icon: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminOption = {
  id: string;
  label: string;
  kind: "percent" | "fixed" | "fixed_order";
  value: number;
  scope: "line" | "order";
  sortOrder: number;
  isActive: boolean;
};

export type AdminVariant = {
  id: string;
  category: string;
  serviceId: string;
  label: string;
  variantLabel: string;
  unit: string;
  parameterLabel: string;
  basePrice: number | null;
  minValue: number;
  maxValue: number;
  step: number;
  requiresPhoto: boolean;
  isManual: boolean;
  isActive: boolean;
  sortOrder: number;
  optionIds: string[];
};

export type AdminPricingSettings = {
  minOrder: number;
  outOfTownFee: number;
  roundingStep: number;
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function moveItem<T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
): T[] {
  if (sourceId === targetId) return items;
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  if (!moved) return items;
  next.splice(targetIndex, 0, moved);
  return next;
}

function shiftItem<T extends { id: string }>(
  items: T[],
  id: string,
  direction: -1 | 1,
): T[] {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function toPricingOption(option: AdminOption): PricingOption {
  return {
    id: option.id,
    label: option.label,
    kind: option.kind,
    value: option.value,
    scope: option.scope,
  };
}

function optionValueLabel(kind: AdminOption["kind"], value: number): string {
  if (kind === "percent") return `${value} %`;
  return `${formatRub(value)} ${kind === "fixed" ? "за штуку" : "за заказ"}`;
}

export function ServicePricingManager({
  categories: initialCategories,
  services: initialServices,
  options: initialOptions,
  variants: initialVariants,
  settings: initialSettings,
}: {
  categories: AdminCategory[];
  services: AdminCatalogService[];
  options: AdminOption[];
  variants: AdminVariant[];
  settings: AdminPricingSettings;
}) {
  const router = useRouter();
  const [categories, setCategories] = useState(initialCategories);
  const [services, setServices] = useState(initialServices);
  const [options, setOptions] = useState(initialOptions);
  const [variants, setVariants] = useState(initialVariants);
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<null | {
    kind: "ok" | "error";
    text: string;
  }>(null);
  const [openCategoryId, setOpenCategoryId] = useState("");
  const [openServiceId, setOpenServiceId] = useState("");
  const [openVariantId, setOpenVariantId] = useState("");
  const [showUnusedOptions, setShowUnusedOptions] = useState(false);

  const lineOptions = options.filter((option) => option.kind !== "fixed_order");
  const orderOptions = options.filter(
    (option) => option.kind === "fixed_order" && option.isActive,
  );

  const [testVariantId, setTestVariantId] = useState(
    initialVariants[0]?.id ?? "",
  );
  const [testValue, setTestValue] = useState(
    initialVariants[0]?.minValue ?? 1,
  );
  const [testSelections, setTestSelections] = useState<CartOptionSelection[]>(
    [],
  );
  const [testOrderIds, setTestOrderIds] = useState<string[]>([]);

  const testVariant = variants.find((variant) => variant.id === testVariantId);
  const testService = services.find(
    (service) => service.id === testVariant?.serviceId,
  );
  const testLineOptions = lineOptions.filter(
    (option) =>
      option.isActive && testVariant?.optionIds.includes(option.id),
  );
  const testResult = useMemo(() => {
    if (!testVariant) return null;
    return calculateOrder({
      items: [
        {
          key: testVariant.id,
          category: testVariant.category,
          serviceId: testVariant.serviceId,
          serviceLabel: testService?.label,
          variantId: testVariant.id,
          variantLabel: testVariant.variantLabel,
          unit: testVariant.unit,
          parameterLabel: testVariant.parameterLabel,
          parameterValue: testValue,
          pricePerUnit: testVariant.basePrice ?? 0,
          manual: testVariant.isManual,
          options: testLineOptions.map(toPricingOption),
          optionSelections: testSelections,
        },
      ],
      rules: {
        minOrder: settings.minOrder,
        outOfTownFee: settings.outOfTownFee,
        roundingStep: settings.roundingStep,
      },
      outOfTown: false,
      orderOptions: orderOptions.map(toPricingOption),
      orderOptionIds: testOrderIds,
    });
  }, [
    testVariant,
    testService,
    testValue,
    testSelections,
    testOrderIds,
    testLineOptions,
    orderOptions,
    settings,
  ]);

  function pickTestVariant(id: string) {
    const variant = variants.find((entry) => entry.id === id);
    setTestVariantId(id);
    setTestValue(variant?.minValue ?? 1);
    setTestSelections([]);
    setTestOrderIds([]);
  }

  function updateCategory(id: string, patch: Partial<AdminCategory>) {
    setCategories((current) =>
      current.map((category) =>
        category.id === id ? { ...category, ...patch } : category,
      ),
    );
  }

  function updateService(id: string, patch: Partial<AdminCatalogService>) {
    setServices((current) =>
      current.map((service) =>
        service.id === id ? { ...service, ...patch } : service,
      ),
    );
  }

  function updateVariant(id: string, patch: Partial<AdminVariant>) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === id ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function updateOption(id: string, patch: Partial<AdminOption>) {
    setOptions((current) =>
      current.map((option) => {
        if (option.id !== id) return option;
        const next = { ...option, ...patch };
        if (next.kind === "fixed_order") {
          next.scope = "order";
        } else {
          next.scope = "line";
        }
        return next;
      }),
    );
    if (patch.kind === "fixed_order") {
      setVariants((current) =>
        current.map((variant) => ({
          ...variant,
          optionIds: variant.optionIds.filter((optionId) => optionId !== id),
        })),
      );
    }
  }

  function toggleCategory(id: string) {
    setOpenCategoryId((current) => (current === id ? "" : id));
    setOpenServiceId("");
    setOpenVariantId("");
  }

  function toggleService(categoryId: string, id: string) {
    setOpenCategoryId(categoryId);
    setOpenServiceId((current) => (current === id ? "" : id));
    setOpenVariantId("");
  }

  function toggleVariant(categoryId: string, serviceId: string, id: string) {
    setOpenCategoryId(categoryId);
    setOpenServiceId(serviceId);
    setOpenVariantId((current) => (current === id ? "" : id));
  }

  function addCategory() {
    const id = newId("new-cat");
    setCategories((current) => [
      ...current,
      {
        id,
        label: "Новая категория",
        hint: "",
        icon: "other",
        sortOrder: current.length * 10 + 10,
        isActive: true,
      },
    ]);
    setOpenCategoryId(id);
    setOpenServiceId("");
    setOpenVariantId("");
  }

  function addService(categoryId: string) {
    const id = newId("new-svc");
    setServices((current) => [
      ...current,
      {
        id,
        categoryId,
        label: "Новая услуга",
        hint: "",
        icon: "other",
        sortOrder: current.length * 10 + 10,
        isActive: true,
      },
    ]);
    setOpenCategoryId(categoryId);
    setOpenServiceId(id);
    setOpenVariantId("");
  }

  function addVariant(service: AdminCatalogService) {
    const id = newId("new-var");
    setOpenCategoryId(service.categoryId);
    setOpenServiceId(service.id);
    setOpenVariantId(id);
    setVariants((current) => [
      ...current,
      {
        id,
        category: service.categoryId,
        serviceId: service.id,
        label: service.label,
        variantLabel: "Новый вариант",
        unit: "шт",
        parameterLabel: "Количество",
        basePrice: 0,
        minValue: 1,
        maxValue: 99,
        step: 1,
        requiresPhoto: false,
        isManual: false,
        isActive: true,
        sortOrder: current.length * 10 + 10,
        optionIds: [],
      },
    ]);
    if (!testVariantId) pickTestVariant(id);
  }

  function addOption() {
    if (openCategoryId) {
      setOpenCategoryId("");
      setOpenServiceId("");
      setOpenVariantId("");
    }
    setShowUnusedOptions(true);
    setOptions((current) => [
      ...current,
      {
        id: newId("new-opt"),
        label: "Новая опция",
        kind: "percent",
        value: 0,
        scope: "line",
        sortOrder: current.length * 10 + 10,
        isActive: true,
      },
    ]);
  }

  function attachOption(variantId: string, optionId: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId && !variant.optionIds.includes(optionId)
          ? { ...variant, optionIds: [...variant.optionIds, optionId] }
          : variant,
      ),
    );
  }

  function detachOption(variantId: string, optionId: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.id === variantId
          ? {
              ...variant,
              optionIds: variant.optionIds.filter((id) => id !== optionId),
            }
          : variant,
      ),
    );
  }

  function createOptionForVariant(
    variantId: string,
    input: { label: string; kind: "percent" | "fixed"; value: number },
  ) {
    const id = newId("new-opt");
    setOptions((current) => [
      ...current,
      {
        id,
        label: input.label,
        kind: input.kind,
        value: input.value,
        scope: "line",
        sortOrder: current.length * 10 + 10,
        isActive: true,
      },
    ]);
    attachOption(variantId, id);
  }

  async function deleteEntity(
    kind: "category" | "service" | "variant" | "option",
    id: string,
  ) {
    setNotice(null);
    try {
      const response = await fetch("/api/admin/catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok && response.status !== 404) {
        setNotice({
          kind: "error",
          text:
            data?.error ??
            "Удаление запрещено: скройте запись, если на неё есть ссылки.",
        });
        return;
      }

      if (kind === "category") {
        const childServiceIds = new Set(
          services
            .filter((service) => service.categoryId === id)
            .map((service) => service.id),
        );
        setServices((current) =>
          current.filter((entry) => entry.categoryId !== id),
        );
        setVariants((current) =>
          current.filter((entry) => !childServiceIds.has(entry.serviceId)),
        );
        setCategories((current) => current.filter((entry) => entry.id !== id));
      } else if (kind === "service") {
        setVariants((current) =>
          current.filter((entry) => entry.serviceId !== id),
        );
        setServices((current) => current.filter((entry) => entry.id !== id));
      } else if (kind === "option") {
        setOptions((current) => current.filter((entry) => entry.id !== id));
        setVariants((current) =>
          current.map((entry) => ({
            ...entry,
            optionIds: entry.optionIds.filter((optionId) => optionId !== id),
          })),
        );
      } else {
        setVariants((current) => current.filter((entry) => entry.id !== id));
      }
      if (openCategoryId === id) setOpenCategoryId("");
      if (openServiceId === id) setOpenServiceId("");
      if (openVariantId === id) setOpenVariantId("");
      setNotice({ kind: "ok", text: "Удалено." });
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    }
  }

  async function save() {
    setBusy(true);
    setNotice(null);

    const payload = {
      settings: {
        minOrder: settings.minOrder,
        outOfTownFee: settings.outOfTownFee,
        roundingStep: settings.roundingStep,
      },
      services: categories.map((category, index) => ({
        ...category,
        sortOrder: (index + 1) * 10,
      })),
      catalogServices: services.map((service, index) => ({
        ...service,
        sortOrder: (index + 1) * 10,
      })),
      options: options.map((option, index) => ({
        ...option,
        scope: option.kind === "fixed_order" ? "order" : "line",
        sortOrder: (index + 1) * 10,
      })),
      items: variants.map((variant, index) => {
        const service = services.find((entry) => entry.id === variant.serviceId);
        return {
          ...variant,
          category: service?.categoryId ?? variant.category,
          label: service?.label ?? variant.label,
          sortOrder: (index + 1) * 10,
          optionIds: variant.optionIds.filter((optionId) =>
            lineOptions.some((option) => option.id === optionId),
          ),
        };
      }),
    };

    try {
      const response = await fetch("/api/admin/tariffs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!response.ok) {
        setNotice({
          kind: "error",
          text: data?.error ?? "Не удалось сохранить",
        });
        return;
      }

      setNotice({
        kind: "ok",
        text: "Сохранено. Старые заявки не изменились.",
      });
      router.refresh();
    } catch {
      setNotice({ kind: "error", text: "Связь пропала. Попробуйте ещё раз." });
    } finally {
      setBusy(false);
    }
  }

  function moveEntity(
    kind: "category" | "service" | "variant" | "option",
    sourceId: string,
    targetId: string,
  ) {
    if (sourceId === targetId) return;

    if (kind === "category") {
      setCategories((current) => moveItem(current, sourceId, targetId));
    } else if (kind === "service") {
      const target = services.find((entry) => entry.id === targetId);
      const source = services.find((entry) => entry.id === sourceId);
      if (!target || !source || target.categoryId !== source.categoryId) return;
      setServices((current) => moveItem(current, sourceId, targetId));
    } else if (kind === "variant") {
      const target = variants.find((entry) => entry.id === targetId);
      const source = variants.find((entry) => entry.id === sourceId);
      if (!target || !source || target.serviceId !== source.serviceId) return;
      setVariants((current) => moveItem(current, sourceId, targetId));
    } else {
      setOptions((current) => moveItem(current, sourceId, targetId));
    }
  }

  function startPointerDrag(
    kind: "category" | "service" | "variant" | "option",
    id: string,
    event: React.PointerEvent,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();

    const startX = event.clientX;
    const startY = event.clientY;
    let targetId: string | null = null;

    const move = (moveEvent: PointerEvent) => {
      if (
        Math.abs(moveEvent.clientX - startX) < 4 &&
        Math.abs(moveEvent.clientY - startY) < 4
      ) {
        return;
      }
      const element = document.elementFromPoint(
        moveEvent.clientX,
        moveEvent.clientY,
      );
      const drop = element?.closest<HTMLElement>(
        `[data-drop-kind="${kind}"]`,
      );
      const candidate = drop?.dataset.dropId;
      if (candidate && candidate !== id) targetId = candidate;
    };

    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      if (targetId) moveEntity(kind, id, targetId);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }

  function dragHandle(
    kind: "category" | "service" | "variant" | "option",
    id: string,
  ) {
    return (
      <span
        data-testid="drag-handle"
        title="Перетащить"
        aria-hidden="true"
        onPointerDown={(event) => startPointerDrag(kind, id, event)}
        className="cursor-grab touch-none select-none px-1 text-[15px] leading-none text-ink-3 active:cursor-grabbing"
      >
        ⋮⋮
      </span>
    );
  }

  function orderButtons(
    kind: "category" | "service" | "variant" | "option",
    id: string,
    label: string,
  ) {
    const move = (direction: -1 | 1) => {
      if (kind === "category") setCategories((current) => shiftItem(current, id, direction));
      if (kind === "service") setServices((current) => shiftItem(current, id, direction));
      if (kind === "variant") setVariants((current) => shiftItem(current, id, direction));
      if (kind === "option") setOptions((current) => shiftItem(current, id, direction));
    };

    return (
      <span className="flex flex-none items-center">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label={`Выше: ${label}`}
          title="Выше"
          className="grid h-8 w-7 place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <ArrowUpIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label={`Ниже: ${label}`}
          title="Ниже"
          className="grid h-8 w-7 place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <ArrowDownIcon className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  }

  function variantList(categoryId: string, service: AdminCatalogService) {
    const serviceVariants = variants.filter(
      (variant) => variant.serviceId === service.id,
    );
    return (
      <div className="grid gap-2">
        {serviceVariants.map((variant) => (
          <VariantEditor
            key={variant.id}
            variant={variant}
            service={service}
            lineOptions={lineOptions}
            open={openVariantId === variant.id}
            onToggle={() =>
              toggleVariant(categoryId, service.id, variant.id)
            }
            onChange={(patch) => updateVariant(variant.id, patch)}
            onDelete={() => void deleteEntity("variant", variant.id)}
            onAttachOption={(optionId) =>
              attachOption(variant.id, optionId)
            }
            onDetachOption={(optionId) =>
              detachOption(variant.id, optionId)
            }
            onCreateOption={(input) =>
              createOptionForVariant(variant.id, input)
            }
            dragHandle={dragHandle("variant", variant.id)}
            orderButtons={orderButtons(
              "variant",
              variant.id,
              variant.variantLabel,
            )}
          />
        ))}
        <button
          type="button"
          onClick={() => addVariant(service)}
          className="btn btn-ghost h-9 w-auto justify-self-start px-3 text-[12.5px]"
        >
          <PlusIcon className="h-4 w-4" />
          Вариант
        </button>
      </div>
    );
  }

  function variantTitle(variant: AdminVariant): string {
    const service = services.find((entry) => entry.id === variant.serviceId);
    return `${service?.label ?? variant.label} · ${variant.variantLabel}`;
  }

  function optionUsageNames(
    option: AdminOption,
    categoryId?: string,
  ): string[] {
    if (option.kind === "fixed_order") {
      return option.isActive ? ["весь заказ"] : [];
    }
    return variants
      .filter(
        (variant) =>
          variant.optionIds.includes(option.id) &&
          (!categoryId ||
            (services.find((service) => service.id === variant.serviceId)
              ?.categoryId ?? variant.category) === categoryId),
      )
      .map(variantTitle);
  }

  function optionUsageText(option: AdminOption, categoryId?: string): string {
    const names = optionUsageNames(option, categoryId);
    if (names.length === 0) return "Не используется ни в одном варианте";
    if (names.length <= 3) return names.join(", ");
    return `${names.slice(0, 3).join(", ")} и ещё ${names.length - 3}`;
  }

  const openCategory = categories.find(
    (category) => category.id === openCategoryId,
  );

  function optionRow(option: AdminOption) {
    const usageCategory = openCategory?.id;
    const used = optionUsageNames(option, usageCategory).length > 0;
    return (
      <div
        key={option.id}
        data-testid="option-card"
        data-option-id={option.id}
        data-drop-kind="option"
        data-drop-id={option.id}
        className="rounded-[12px] border border-line px-2.5 py-2"
      >
        <div className="flex flex-wrap items-center gap-2">
          {dragHandle("option", option.id)}
          <input
            value={option.label}
            onChange={(event) =>
              updateOption(option.id, { label: event.target.value })
            }
            aria-label={`Название опции: ${option.label}`}
            className="input h-9 min-w-[140px] flex-1 text-[13px]"
          />
          <div
            className="flex flex-none flex-wrap gap-1"
            role="group"
            aria-label={`Вид опции: ${option.label}`}
          >
            {(
              [
                ["percent", "Процент"],
                ["fixed", "За штуку"],
                ["fixed_order", "За заказ"],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                aria-pressed={option.kind === kind}
                onClick={() => updateOption(option.id, { kind })}
                className={`min-h-9 rounded-[9px] border px-2.5 text-[12px] ${
                  option.kind === kind
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line text-ink-2 hover:border-line-strong"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={option.value}
              onChange={(event) =>
                updateOption(option.id, {
                  value: Math.max(0, Number(event.target.value) || 0),
                })
              }
              aria-label={`Значение опции: ${option.label}`}
              className="input h-9 w-[92px] tabular text-right text-[12.5px]"
            />
            <span className="whitespace-nowrap text-[11.5px] text-ink-3">
              {option.kind === "percent"
                ? "%"
                : option.kind === "fixed"
                  ? "₽ за штуку"
                  : "₽ за заказ"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => void deleteEntity("option", option.id)}
            aria-label={`Удалить опцию: ${option.label}`}
            title="Удалить"
            className="grid h-9 w-9 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-7">
          <p className="min-w-0 flex-1 text-[11.5px] leading-4 text-ink-3">
            <span className="font-medium text-ink-2">Используется в:</span>{" "}
            {used
              ? optionUsageText(option, usageCategory)
              : "Не используется ни в одном варианте"}
            {!option.isActive ? " · недоступна" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[12px] text-ink-2">
              <input
                type="checkbox"
                checked={option.isActive}
                onChange={(event) =>
                  updateOption(option.id, {
                    isActive: event.target.checked,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Доступна для привязки
            </label>
            {orderButtons("option", option.id, option.label)}
          </div>
        </div>
      </div>
    );
  }

  const visibleOptions = openCategory
    ? options.filter((option) =>
        variants.some(
          (variant) =>
            (services.find((service) => service.id === variant.serviceId)
              ?.categoryId ?? variant.category) === openCategory.id &&
            variant.optionIds.includes(option.id),
        ),
      )
    : options;
  const usedOptions = visibleOptions.filter(
    (option) => optionUsageNames(option).length > 0,
  );
  const unusedOptions = openCategory
    ? []
    : visibleOptions.filter(
        (option) => optionUsageNames(option).length === 0,
      );

  return (
    <div className="grid gap-4">
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

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addCategory} className="btn btn-secondary w-auto px-4">
          <PlusIcon className="h-4 w-4" />
          Категория
        </button>
        <button
          type="button"
          onClick={() =>
            document
              .getElementById("price-check")
              ?.scrollIntoView({ behavior: "smooth", block: "start" })
          }
          aria-controls="price-check"
          className="btn btn-secondary w-auto border-accent px-4 text-accent-ink"
        >
          Проверить расчёт
        </button>
        <p className="caption max-w-[52ch]">
          Дерево: категория → услуга → вариант. Перетаскивайте строки или
          используйте стрелки. Скрытая запись не исчезает из старых заявок.
        </p>
        <p className="caption w-full max-w-[62ch]">
          Услуга — тип работ внутри категории. Если он один, создавать не нужно:
          категория показывается как услуга.
        </p>
      </div>

      {categories.map((category) => {
        const categoryServices = services.filter(
          (service) => service.categoryId === category.id,
        );
        const categoryOpen = openCategoryId === category.id;
        return (
          <section
            key={category.id}
            data-testid="category-card"
            data-drop-kind="category"
            data-drop-id={category.id}
            className="card overflow-hidden"
          >
            <div className="border-b border-line bg-surface-2/40 px-3 py-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  aria-expanded={categoryOpen}
                  aria-label={`${categoryOpen ? "Свернуть" : "Открыть"} категорию: ${category.label}`}
                  title={categoryOpen ? "Свернуть" : "Развернуть"}
                  className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
                >
                  <ChevronRightIcon
                    className={`h-4 w-4 transition-transform duration-150 ${
                      categoryOpen ? "rotate-90" : ""
                    }`}
                  />
                </button>
                {dragHandle("category", category.id)}
                <button
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="block truncate text-[14px] font-semibold">
                    {category.label}
                  </span>
                  <span className="caption block truncate">
                    {category.hint || "Без подписи"}
                  </span>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="flex min-h-10 items-center gap-2 text-[12px] text-ink-2">
                  <input
                    type="checkbox"
                    checked={category.isActive}
                    onChange={(event) =>
                      updateCategory(category.id, {
                        isActive: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                  Показывать на сайте
                </label>
                {orderButtons("category", category.id, category.label)}
                <button
                  type="button"
                  onClick={() => void deleteEntity("category", category.id)}
                  aria-label={`Удалить категорию: ${category.label}`}
                  title="Удалить"
                  className="grid h-9 w-9 place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {categoryOpen ? (
              <div className="border-b border-line px-3 py-3">
                <div className="grid gap-2 min-[900px]:grid-cols-2">
                  <div>
                    <label
                      htmlFor={`cat-name-${category.id}`}
                      className="label mb-1 block text-ink-2"
                    >
                      Название категории
                    </label>
                    <input
                      id={`cat-name-${category.id}`}
                      value={category.label}
                      onChange={(event) =>
                        updateCategory(category.id, {
                          label: event.target.value,
                        })
                      }
                      aria-label={`Название категории: ${category.label}`}
                      className="input h-10 w-full font-semibold"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`cat-hint-${category.id}`}
                      className="label mb-1 block text-ink-2"
                    >
                      Подпись категории
                    </label>
                    <input
                      id={`cat-hint-${category.id}`}
                      value={category.hint}
                      onChange={(event) =>
                        updateCategory(category.id, {
                          hint: event.target.value,
                        })
                      }
                      aria-label={`Подпись категории: ${category.label}`}
                      placeholder="Короткая подпись"
                      className="input h-10 w-full text-[13px]"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {categoryOpen ? (
              <div className="grid gap-3 px-3 py-3">
                {categoryServices.length === 1 ? (
                  <>
                    {(() => {
                      const service = categoryServices[0]!;
                      return (
                        <div
                          data-testid="single-service-card"
                          className="rounded-[14px] border border-line p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="label text-ink-2">
                              Услуга в категории
                            </span>
                            <div className="flex items-center gap-1">
                              <label className="flex min-h-8 items-center gap-2 text-[12px] text-ink-2">
                                <input
                                  type="checkbox"
                                  checked={service.isActive}
                                  onChange={(event) =>
                                    updateService(service.id, {
                                      isActive: event.target.checked,
                                    })
                                  }
                                  className="h-4 w-4 accent-[var(--accent)]"
                                />
                                Показывать на сайте
                              </label>
                              <button
                                type="button"
                                onClick={() =>
                                  void deleteEntity("service", service.id)
                                }
                                aria-label={`Удалить услугу: ${service.label}`}
                                title="Удалить услугу"
                                className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mt-2 grid gap-2 min-[900px]:grid-cols-2">
                            <div>
                              <label
                                htmlFor={`svc-name-${service.id}`}
                                className="label mb-1 block text-ink-2"
                              >
                                Название услуги
                              </label>
                              <input
                                id={`svc-name-${service.id}`}
                                value={service.label}
                                onChange={(event) =>
                                  updateService(service.id, {
                                    label: event.target.value,
                                  })
                                }
                                aria-label={`Название услуги: ${service.label}`}
                                className="input h-9 w-full text-[13.5px] font-medium"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`svc-hint-${service.id}`}
                                className="label mb-1 block text-ink-2"
                              >
                                Подпись услуги
                              </label>
                              <input
                                id={`svc-hint-${service.id}`}
                                value={service.hint}
                                onChange={(event) =>
                                  updateService(service.id, {
                                    hint: event.target.value,
                                  })
                                }
                                aria-label={`Подпись услуги: ${service.label}`}
                                placeholder="Короткая подпись"
                                className="input h-9 w-full text-[12.5px]"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    {variantList(category.id, categoryServices[0]!)}
                  </>
                ) : (
                  categoryServices.map((service) => {
                  const serviceOpen = openServiceId === service.id;
                  return (
                    <div
                      key={service.id}
                      data-testid="service-card"
                      data-drop-kind="service"
                      data-drop-id={service.id}
                      className="rounded-[14px] border border-line"
                    >
                      <div className="border-b border-line px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              toggleService(category.id, service.id)
                            }
                            aria-expanded={serviceOpen}
                            aria-label={`${serviceOpen ? "Свернуть" : "Открыть"} услугу: ${service.label}`}
                            title={serviceOpen ? "Свернуть" : "Развернуть"}
                            className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
                          >
                            <ChevronRightIcon
                              className={`h-4 w-4 transition-transform duration-150 ${
                                serviceOpen ? "rotate-90" : ""
                              }`}
                            />
                          </button>
                          {dragHandle("service", service.id)}
                          <button
                            type="button"
                            onClick={() =>
                              toggleService(category.id, service.id)
                            }
                            className="min-w-0 flex-1 text-left"
                          >
                            <span className="block truncate text-[13.5px] font-medium">
                              {service.label}
                            </span>
                            {service.hint ? (
                              <span className="caption block truncate">
                                {service.hint}
                              </span>
                            ) : null}
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-2 text-[12px] text-ink-2">
                            <input
                              type="checkbox"
                              checked={service.isActive}
                              onChange={(event) =>
                                updateService(service.id, {
                                  isActive: event.target.checked,
                                })
                              }
                              className="h-4 w-4 accent-[var(--accent)]"
                            />
                            Показывать на сайте
                          </label>
                          {orderButtons("service", service.id, service.label)}
                          <button
                            type="button"
                            onClick={() =>
                              void deleteEntity("service", service.id)
                            }
                            aria-label={`Удалить услугу: ${service.label}`}
                            title="Удалить"
                            className="grid h-8 w-8 place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {serviceOpen ? (
                        <div className="px-3 py-3">
                          <div className="grid gap-2 min-[900px]:grid-cols-2">
                            <div>
                              <label
                                htmlFor={`svc-name-${service.id}`}
                                className="label mb-1 block text-ink-2"
                              >
                                Название услуги
                              </label>
                              <input
                                id={`svc-name-${service.id}`}
                                value={service.label}
                                onChange={(event) =>
                                  updateService(service.id, {
                                    label: event.target.value,
                                  })
                                }
                                aria-label={`Название услуги: ${service.label}`}
                                className="input h-9 w-full text-[13.5px] font-medium"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor={`svc-hint-${service.id}`}
                                className="label mb-1 block text-ink-2"
                              >
                                Подпись услуги
                              </label>
                              <input
                                id={`svc-hint-${service.id}`}
                                value={service.hint}
                                onChange={(event) =>
                                  updateService(service.id, {
                                    hint: event.target.value,
                                  })
                                }
                                aria-label={`Подпись услуги: ${service.label}`}
                                placeholder="Короткая подпись"
                                className="input h-9 w-full text-[12.5px]"
                              />
                            </div>
                          </div>
                          <div className="mt-3">
                            {variantList(category.id, service)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                  })
                )}

                <button
                  type="button"
                  onClick={() => addService(category.id)}
                  className="btn btn-ghost h-9 w-auto justify-self-start px-3 text-[12.5px]"
                >
                  <PlusIcon className="h-4 w-4" />
                  Добавить услугу
                </button>
              </div>
            ) : null}
          </section>
        );
      })}

      <section className="card p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="h3">Опции</h2>
          <button
            type="button"
            onClick={addOption}
            className="btn btn-secondary ml-auto h-9 w-auto px-3 text-[12.5px]"
          >
            <PlusIcon className="h-4 w-4" />
            Опция
          </button>
        </div>
        <p className="caption mt-1 max-w-[68ch]">
          Доплаты, которые можно включать в вариантах. Сами по себе ни на что не
          влияют.
        </p>

        {openCategory ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-surface-2/50 px-3 py-2 text-[12px] text-ink-2">
            Показаны опции категории «{openCategory.label}»
            <button
              type="button"
              onClick={() => {
                setOpenCategoryId("");
                setOpenServiceId("");
                setOpenVariantId("");
              }}
              className="btn-small ml-auto flex-none"
            >
              Показать все
            </button>
          </div>
        ) : null}

        {options.length === 0 ? (
          <p className="caption mt-3">Пока нет опций.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-2">
                  Используются
                </h3>
                <span className="caption tabular">{usedOptions.length}</span>
              </div>
              <div data-testid="options-used" className="mt-2 grid gap-2">
                {usedOptions.map((option) => optionRow(option))}
                {usedOptions.length === 0 ? (
                  <p className="caption">
                    {openCategory
                      ? "У вариантов этой категории пока нет опций."
                      : "Пока нет используемых опций."}
                  </p>
                ) : null}
              </div>
            </div>

            {openCategory ? null : (
              <div data-testid="options-unused" className="border-t border-line pt-3">
                <button
                  type="button"
                  onClick={() => setShowUnusedOptions((current) => !current)}
                  aria-expanded={showUnusedOptions}
                  className="flex w-full items-center gap-2 text-left"
                >
                  <ChevronRightIcon
                    className={`h-4 w-4 flex-none text-ink-3 transition-transform duration-150 ${
                      showUnusedOptions ? "rotate-90" : ""
                    }`}
                  />
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-ink-2">
                    Не используются
                  </span>
                  <span className="caption tabular">{unusedOptions.length}</span>
                </button>
                {showUnusedOptions ? (
                  <div
                    data-testid="unused-options-list"
                    className="mt-2 grid gap-2"
                  >
                    {unusedOptions.map((option) => optionRow(option))}
                    {unusedOptions.length === 0 ? (
                      <p className="caption">Все опции используются.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="card p-4 md:p-5" aria-labelledby="rules-title">
        <h2 id="rules-title" className="h3">
          Правила расчёта
        </h2>
        <div className="mt-3 grid gap-3 min-[900px]:grid-cols-3">
          {(
            [
              {
                key: "minOrder",
                label: "Минимальный заказ, ₽",
                hint: "Только по строкам, без выезда",
              },
              {
                key: "outOfTownFee",
                label: "Выезд за город, ₽",
                hint: "Один раз на заказ",
              },
              {
                key: "roundingStep",
                label: "Округление вверх, ₽",
                hint: "Один раз в конце",
              },
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
                type="number"
                min={field.key === "roundingStep" ? 1 : 0}
                value={settings[field.key]}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    [field.key]: Math.max(
                      field.key === "roundingStep" ? 1 : 0,
                      Number(event.target.value) || 0,
                    ),
                  }))
                }
                className="input tabular"
              />
              <p className="mt-1 text-[11.5px] leading-4 text-ink-3">
                {field.hint}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="price-check"
        className="card scroll-mt-4 p-4 md:p-5"
        aria-labelledby="test-title"
      >
        <h2 id="test-title" className="h3">
          Проверить расчёт
        </h2>
        <p className="caption mt-1">
          Черновик: ничего не сохраняет. Проверьте вариант до публикации.
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="grid gap-3">
            <div>
              <label htmlFor="test-variant" className="label mb-1.5 block text-ink-2">
                Вариант
              </label>
              <select
                id="test-variant"
                value={testVariantId}
                onChange={(event) => pickTestVariant(event.target.value)}
                className="input"
              >
                <option value="">Выберите вариант</option>
                {variants.map((variant) => {
                  const service = services.find(
                    (entry) => entry.id === variant.serviceId,
                  );
                  return (
                    <option key={variant.id} value={variant.id}>
                      {service?.label ?? variant.label} · {variant.variantLabel}
                    </option>
                  );
                })}
              </select>
            </div>

            {testVariant && !testVariant.isManual ? (
              <ParameterInput
                key={testVariant.id}
                id="test-value"
                label={testVariant.parameterLabel}
                unit={testVariant.unit}
                value={testValue}
                min={testVariant.minValue}
                max={testVariant.maxValue}
                step={testVariant.step}
                onChange={setTestValue}
              />
            ) : null}

            {testVariant ? (
              <div>
                <div className="label mb-2 text-ink-2">Опции строки</div>
                <LineOptionsEditor
                  options={testLineOptions.map((option) => ({
                    ...option,
                    sortOrder: option.sortOrder,
                  }))}
                  selections={testSelections}
                  onChange={setTestSelections}
                />
              </div>
            ) : null}

            {orderOptions.length > 0 ? (
              <div>
                <div className="label mb-2 text-ink-2">Опции заказа</div>
                <div className="grid gap-2">
                  {orderOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex min-h-10 items-center justify-between gap-3 rounded-[10px] border border-line px-3 text-[13px]"
                    >
                      <span>{option.label}</span>
                      <span className="flex items-center gap-2">
                        <span className="tabular">
                          +{formatRub(option.value)}
                        </span>
                        <input
                          type="checkbox"
                          checked={testOrderIds.includes(option.id)}
                          onChange={(event) =>
                            setTestOrderIds((current) =>
                              event.target.checked
                                ? [...current, option.id]
                                : current.filter((id) => id !== option.id),
                            )
                          }
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="rounded-[14px] border border-line bg-surface-2/50 p-3.5">
            {testResult && testVariant ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="small text-ink-2">Строка</span>
                  <span className="tabular text-[18px] font-semibold">
                    {testVariant.isManual
                      ? "По фото"
                      : formatRub(testResult.lines[0]?.lineTotal ?? null)}
                  </span>
                </div>
                {!testVariant.isManual ? (
                  <p className="caption mt-2">
                    {formatDecimal(testValue)} {testVariant.unit} ×{" "}
                    {formatRub(testVariant.basePrice)} за единицу
                  </p>
                ) : null}
                <div className="mt-3 grid gap-1 border-t border-line pt-2 text-[12.5px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-ink-2">Позиции</span>
                    <span className="tabular">
                      {formatRub(testResult.itemsSubtotal)}
                    </span>
                  </div>
                  {testResult.minimumApplied > 0 ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-2">До минимума</span>
                      <span className="tabular">
                        +{formatRub(testResult.minimumApplied)}
                      </span>
                    </div>
                  ) : null}
                  {testResult.orderOptionsTotal > 0 ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-ink-2">Опции заказа</span>
                      <span className="tabular">
                        +{formatRub(testResult.orderOptionsTotal)}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between gap-2 border-t border-line pt-1 text-[14px] font-semibold">
                    <span>Итого</span>
                    <span className="tabular">{formatRub(testResult.total)}</span>
                  </div>
                </div>
                {testResult.lines[0]?.options?.length ? (
                  <ul className="mt-2 grid gap-1 text-[11.5px] leading-4 text-ink-2">
                    {testResult.lines[0].options.map((option) => (
                      <li key={option.id} className="flex justify-between gap-2">
                        <span>
                          {option.label}
                          {option.quantity && option.quantity > 1
                            ? ` × ${option.quantity}`
                            : ""}
                        </span>
                        <span className="tabular">
                          +{formatRub(option.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {testResult.formulas[testVariant.id] ? (
                  <p className="caption mt-2 break-words">
                    {testResult.formulas[testVariant.id]}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="caption">Выберите вариант, чтобы увидеть сумму.</p>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          aria-busy={busy}
          className="btn btn-primary w-auto px-6"
        >
          {busy ? (
            <SpinnerIcon className="h-4 w-4" />
          ) : (
            <CheckIcon className="h-4 w-4" />
          )}
          {busy ? "Сохраняем…" : "Сохранить услуги и цены"}
        </button>
        <p className="caption max-w-[46ch]">
          Изменение прайса не трогает отправленные заявки: в них сохранён снимок.
        </p>
      </div>
    </div>
  );
}

function VariantEditor({
  variant,
  service,
  lineOptions,
  open,
  onToggle,
  onChange,
  onDelete,
  onAttachOption,
  onDetachOption,
  onCreateOption,
  dragHandle,
  orderButtons,
}: {
  variant: AdminVariant;
  service: AdminCatalogService;
  lineOptions: AdminOption[];
  open: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<AdminVariant>) => void;
  onDelete: () => void;
  onAttachOption: (optionId: string) => void;
  onDetachOption: (optionId: string) => void;
  onCreateOption: (input: {
    label: string;
    kind: "percent" | "fixed";
    value: number;
  }) => void;
  dragHandle: React.ReactNode;
  orderButtons: React.ReactNode;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newKind, setNewKind] = useState<"percent" | "fixed">("percent");
  const [newValue, setNewValue] = useState(0);

  const attachedOptions = lineOptions.filter((option) =>
    variant.optionIds.includes(option.id),
  );
  const availableOptions = lineOptions.filter(
    (option) => option.isActive && !variant.optionIds.includes(option.id),
  );

  return (
    <div
      data-testid="variant-card"
      data-drop-kind="variant"
      data-drop-id={variant.id}
      className="rounded-[12px] border border-line bg-surface"
    >
      <div className="flex items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={`${open ? "Свернуть" : "Открыть"} вариант: ${variant.variantLabel}`}
          title={open ? "Свернуть" : "Развернуть"}
          className="mt-0.5 grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-ink"
        >
          <ChevronRightIcon
            className={`h-4 w-4 transition-transform duration-150 ${
              open ? "rotate-90" : ""
            }`}
          />
        </button>
        {dragHandle}
        <button
          type="button"
          onClick={onToggle}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13.5px] font-medium">
            {variant.variantLabel}
          </span>
          <span className="caption block truncate">
            {variant.isManual
              ? "по фото"
              : `${formatRub(variant.basePrice)} / ${variant.unit}`}
          </span>
        </button>
        {orderButtons}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Удалить вариант: ${variant.variantLabel}`}
          title="Удалить"
          className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div className="grid gap-4 border-t border-line px-3 py-3">
          <div className="grid gap-3 min-[900px]:grid-cols-2">
            <div>
              <label
                className="label mb-1.5 block text-ink-2"
                htmlFor={`variant-${variant.id}`}
              >
                Название
              </label>
              <input
                id={`variant-${variant.id}`}
                value={variant.variantLabel}
                onChange={(event) =>
                  onChange({ variantLabel: event.target.value })
                }
                className="input h-10 w-full"
              />
            </div>
            <div>
              <label
                className="label mb-1.5 block text-ink-2"
                htmlFor={`price-${variant.id}`}
              >
                Цена за единицу
              </label>
              <input
                id={`price-${variant.id}`}
                type="number"
                min={0}
                step="1"
                value={variant.basePrice ?? ""}
                disabled={variant.isManual}
                aria-label={`Цена: ${service.label} ${variant.variantLabel}`}
                onChange={(event) =>
                  onChange({
                    basePrice:
                      event.target.value === ""
                        ? null
                        : Math.max(0, Number(event.target.value) || 0),
                  })
                }
                className="input h-10 w-full tabular"
              />
            </div>
          </div>

          <div>
            <div className="label mb-2 text-ink-2">Параметр</div>
            <div className="grid gap-3 min-[900px]:grid-cols-2">
              <div>
                <label
                  className="label mb-1.5 block text-ink-2"
                  htmlFor={`unit-${variant.id}`}
                >
                  Единица (шт / м² / м.п.)
                </label>
                <input
                  id={`unit-${variant.id}`}
                  value={variant.unit}
                  onChange={(event) => onChange({ unit: event.target.value })}
                  className="input h-10 w-full"
                />
              </div>
              <div>
                <label
                  className="label mb-1.5 block text-ink-2"
                  htmlFor={`param-${variant.id}`}
                >
                  Подпись параметра
                </label>
                <input
                  id={`param-${variant.id}`}
                  value={variant.parameterLabel}
                  onChange={(event) =>
                    onChange({ parameterLabel: event.target.value })
                  }
                  className="input h-10 w-full"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 min-[900px]:col-span-2 min-[900px]:grid-cols-3">
                {(
                  [
                    ["minValue", "Мин"],
                    ["maxValue", "Макс"],
                    ["step", "Шаг"],
                  ] as const
                ).map(([field, label]) => (
                  <div key={field}>
                    <label
                      className="label mb-1.5 block text-ink-2"
                      htmlFor={`${field}-${variant.id}`}
                    >
                      {label}
                    </label>
                    <input
                      id={`${field}-${variant.id}`}
                      type="number"
                      min={field === "step" ? 0.01 : 0}
                      step="0.01"
                      value={variant[field]}
                      onChange={(event) =>
                        onChange({
                          [field]: Number(event.target.value) || 0,
                        })
                      }
                      className="input h-10 w-full tabular"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={variant.isManual}
                onChange={(event) =>
                  onChange({
                    isManual: event.target.checked,
                    basePrice: event.target.checked
                      ? null
                      : variant.basePrice ?? 0,
                  })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              По фото
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={variant.requiresPhoto}
                onChange={(event) =>
                  onChange({ requiresPhoto: event.target.checked })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Нужно фото
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={variant.isActive}
                onChange={(event) =>
                  onChange({ isActive: event.target.checked })
                }
                className="h-4 w-4 accent-[var(--accent)]"
              />
              Показывать на сайте
            </label>
          </div>

          {!variant.isManual ? (
            <div>
              <div className="label mb-1.5 text-ink-2">
                Доплаты этого варианта
              </div>
              <div data-testid="variant-options" className="grid gap-2">
                {attachedOptions.length > 0 ? (
                  attachedOptions.map((option) => (
                    <div
                      key={option.id}
                      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line px-2.5 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">
                          {option.label}
                        </span>
                        <span className="caption block">
                          +{optionValueLabel(option.kind, option.value)}
                          {option.isActive ? "" : " · недоступна"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onDetachOption(option.id)}
                        aria-label={`Убрать доплату: ${option.label}`}
                        title="Убрать из варианта"
                        className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ink-3 hover:bg-surface-2 hover:text-danger"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="caption">Пока нет доплат.</p>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPickerOpen((current) => !current);
                    setCreateOpen(false);
                  }}
                  aria-expanded={pickerOpen}
                  className="btn btn-secondary h-9 w-auto px-3 text-[12.5px]"
                >
                  <PlusIcon className="h-4 w-4" />
                  Добавить из справочника
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCreateOpen((current) => !current);
                    setPickerOpen(false);
                  }}
                  aria-expanded={createOpen}
                  className="btn btn-ghost h-9 w-auto px-3 text-[12.5px]"
                >
                  <PlusIcon className="h-4 w-4" />
                  Создать новую
                </button>
              </div>

              {pickerOpen ? (
                <div className="mt-2 grid gap-1.5 rounded-[10px] border border-line bg-surface-2/40 p-2">
                  {availableOptions.length > 0 ? (
                    availableOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          onAttachOption(option.id);
                          setPickerOpen(false);
                        }}
                        className="flex min-h-10 flex-wrap items-center gap-2 rounded-[8px] border border-line bg-surface px-2.5 py-1.5 text-left text-[12.5px] hover:border-accent hover:bg-accent-soft"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {option.label}
                        </span>
                        <span className="text-ink-3">
                          +{optionValueLabel(option.kind, option.value)}
                        </span>
                      </button>
                    ))
                  ) : (
                    <p className="caption px-1">
                      Все доступные доплаты уже добавлены.
                    </p>
                  )}
                </div>
              ) : null}

              {createOpen ? (
                <div className="mt-2 grid gap-2 rounded-[10px] border border-line bg-surface-2/40 p-2.5">
                  <input
                    value={newLabel}
                    onChange={(event) => setNewLabel(event.target.value)}
                    aria-label="Название новой доплаты"
                    placeholder="Например, пятна от чая"
                    className="input h-9 w-full text-[13px]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-1">
                      {(
                        [
                          ["percent", "Процент"],
                          ["fixed", "За штуку"],
                        ] as const
                      ).map(([kind, label]) => (
                        <button
                          key={kind}
                          type="button"
                          aria-pressed={newKind === kind}
                          onClick={() => setNewKind(kind)}
                          className={`min-h-9 rounded-[9px] border px-2.5 text-[12px] ${
                            newKind === kind
                              ? "border-accent bg-accent-soft text-accent-ink"
                              : "border-line text-ink-2 hover:border-line-strong"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        value={newValue}
                        onChange={(event) =>
                          setNewValue(
                            Math.max(0, Number(event.target.value) || 0),
                          )
                        }
                        aria-label="Значение новой доплаты"
                        className="input h-9 w-[92px] tabular text-right text-[12.5px]"
                      />
                      <span className="whitespace-nowrap text-[11.5px] text-ink-3">
                        {newKind === "percent" ? "%" : "₽ за штуку"}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!newLabel.trim()}
                      onClick={() => {
                        onCreateOption({
                          label: newLabel.trim(),
                          kind: newKind,
                          value:
                            newKind === "percent"
                              ? Math.min(500, newValue)
                              : newValue,
                        });
                        setNewLabel("");
                        setNewValue(0);
                        setNewKind("percent");
                        setCreateOpen(false);
                      }}
                      className="btn-small"
                    >
                      Создать и добавить
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="btn btn-ghost h-9 w-auto px-3 text-[12.5px]"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="caption">
            Услуга: {service.label}. Перенос варианта в другую услугу — через
            дерево, без изменения старых заявок.
          </p>
        </div>
      ) : null}
    </div>
  );
}
