"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  calculateOrder,
  type PricingOption,
  type PricingRules,
} from "@/lib/calc/pricing";

export type CartCategory = string;

export type PhotoMeta = {
  id: string;
  width: number;
  height: number;
  name: string;
};

export type CartOptionSelection = {
  id: string;
  quantity: number;
};

export type CartItem = {
  uid: string;
  tariffId: string;
  category: CartCategory;
  serviceId?: string;
  serviceLabel?: string;
  label: string;
  variantLabel: string;
  unit: string;
  parameterLabel: string;
  parameterValue: number;
  optionSelections: CartOptionSelection[];
  /** Легаси-поле: совпадает с parameterValue. */
  quantity: number;
  heavySoiling: boolean;
  secondSide: boolean;
  isManual: boolean;
  manualDescription: string;
  photos: PhotoMeta[];
};

export type CheckoutDraft = {
  name: string;
  phone: string;
  address: string;
  outOfTown: boolean;
  desiredDate: string;
  desiredTimeFrom: string;
  desiredTimeTo: string;
  comment: string;
  consent: boolean;
  idempotencyKey: string;
  orderOptionIds: string[];
};

export type CartState = {
  items: CartItem[];
  checkout: CheckoutDraft;
};

const STORAGE_KEY = "myagko.cart.v1";
const MAX_QUANTITY = 10;

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function emptyCheckout(): CheckoutDraft {
  return {
    name: "",
    phone: "",
    address: "",
    outOfTown: false,
    desiredDate: "",
    desiredTimeFrom: "",
    desiredTimeTo: "",
    comment: "",
    consent: false,
    idempotencyKey: newIdempotencyKey(),
    orderOptionIds: [],
  };
}

function emptyState(): CartState {
  return { items: [], checkout: emptyCheckout() };
}

let state: CartState = emptyState();
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // переполнение или приватный режим — черновик останется в памяти
  }
}

function normalizeItem(item: CartItem): CartItem {
  const parameterValue = Number.isFinite(item.parameterValue)
    ? item.parameterValue
    : Number.isFinite(item.quantity)
      ? item.quantity
      : 1;

  return {
    ...item,
    serviceId: item.serviceId ?? undefined,
    serviceLabel: item.serviceLabel ?? item.label,
    unit: item.unit ?? "шт",
    parameterLabel: item.parameterLabel ?? "Количество",
    parameterValue,
    optionSelections: Array.isArray(item.optionSelections)
      ? item.optionSelections
      : [],
    quantity: parameterValue,
    heavySoiling: Boolean(item.heavySoiling),
    secondSide: Boolean(item.secondSide),
    isManual: Boolean(item.isManual),
    manualDescription: item.manualDescription ?? "",
    photos: item.photos ?? [],
  };
}

export function hydrateCart(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CartState>;
      if (Array.isArray(parsed.items)) {
        state = {
          items: parsed.items
            .filter(isValidItem)
            .map((item) => normalizeItem(item)),
          checkout: { ...emptyCheckout(), ...(parsed.checkout ?? {}) },
        };
      }
    }
  } catch {
    state = emptyState();
  }
  emit();
}

export function isCartHydrated(): boolean {
  return hydrated;
}

function isValidItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.uid === "string" &&
    typeof item.tariffId === "string" &&
    typeof item.label === "string" &&
    (typeof item.parameterValue === "number" ||
      typeof item.quantity === "number")
  );
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): CartState {
  return state;
}

function getServerSnapshot(): CartState {
  return state;
}

export function useCart(): CartState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    hydrateCart();
  }, []);
  return snapshot;
}

export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false,
  );
}

function optionsKey(selections: CartOptionSelection[]): string {
  return [...selections]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((selection) => `${selection.id}:${selection.quantity}`)
    .join(",");
}

export function addItem(input: {
  tariffId: string;
  category: CartCategory;
  serviceId?: string;
  serviceLabel?: string;
  label: string;
  variantLabel: string;
  unit?: string;
  parameterLabel?: string;
  parameterValue?: number;
  quantity?: number;
  optionSelections?: CartOptionSelection[];
  heavySoiling?: boolean;
  secondSide?: boolean;
  isManual?: boolean;
  manualDescription?: string;
}): string {
  const parameterValue = Number.isFinite(input.parameterValue)
    ? (input.parameterValue as number)
    : clampQuantity(input.quantity ?? 1);
  const manualDescription = (input.manualDescription ?? "").trim();
  const optionSelections = input.optionSelections ?? [];
  const heavySoiling = Boolean(input.heavySoiling);
  const secondSide = Boolean(input.secondSide);

  const existing = findItemByConfig({
    tariffId: input.tariffId,
    parameterValue,
    optionSelections,
    heavySoiling,
    secondSide,
    manualDescription,
  });

  if (existing) {
    state = {
      ...state,
      items: state.items.map((item) =>
        item.uid === existing.uid
          ? {
              ...item,
              parameterValue: item.parameterValue + parameterValue,
              quantity: item.parameterValue + parameterValue,
            }
          : item,
      ),
    };
    persist();
    emit();
    return existing.uid;
  }

  const uid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  state = {
    ...state,
    items: [
      ...state.items,
      {
        uid,
        tariffId: input.tariffId,
        category: input.category,
        serviceId: input.serviceId,
        serviceLabel: input.serviceLabel,
        label: input.label,
        variantLabel: input.variantLabel,
        unit: input.unit ?? "шт",
        parameterLabel: input.parameterLabel ?? "Количество",
        parameterValue,
        optionSelections,
        quantity: parameterValue,
        heavySoiling,
        secondSide,
        isManual: Boolean(input.isManual),
        manualDescription,
        photos: [],
      },
    ],
  };
  persist();
  emit();
  return uid;
}

export function removeItem(uid: string): CartItem | null {
  const removed = state.items.find((item) => item.uid === uid) ?? null;
  if (!removed) return null;
  state = { ...state, items: state.items.filter((item) => item.uid !== uid) };
  persist();
  emit();
  return removed;
}

export function restoreItem(item: CartItem): void {
  if (state.items.some((existing) => existing.uid === item.uid)) return;
  state = { ...state, items: [...state.items, item] };
  persist();
  emit();
}

/** Позиция с такой же конфигурацией — для «добавить фото, не добавляя ещё раз». */
export function findItemByConfig(input: {
  tariffId: string;
  parameterValue?: number;
  optionSelections?: CartOptionSelection[];
  heavySoiling?: boolean;
  secondSide?: boolean;
  manualDescription?: string;
}): CartItem | null {
  const manualDescription = (input.manualDescription ?? "").trim();
  return (
    state.items.find((item) => {
      const sameParameter =
        input.parameterValue === undefined ||
        item.parameterValue === input.parameterValue;
      const sameOptions =
        input.optionSelections === undefined ||
        optionsKey(item.optionSelections) === optionsKey(input.optionSelections);
      return (
        item.tariffId === input.tariffId &&
        sameParameter &&
        sameOptions &&
        item.heavySoiling === Boolean(input.heavySoiling) &&
        item.secondSide === Boolean(input.secondSide) &&
        item.manualDescription === manualDescription
      );
    }) ?? null
  );
}

export function getItem(uid: string): CartItem | null {
  return state.items.find((item) => item.uid === uid) ?? null;
}

export function setParameterValue(uid: string, value: number): void {
  const parameterValue = Number.isFinite(value) ? value : 1;
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid
        ? { ...item, parameterValue, quantity: parameterValue }
        : item,
    ),
  };
  persist();
  emit();
}

export function setQuantity(uid: string, quantity: number): void {
  setParameterValue(uid, clampQuantity(quantity));
}

export function setOptionSelections(
  uid: string,
  selections: CartOptionSelection[],
): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid
        ? {
            ...item,
            optionSelections: selections,
            heavySoiling: selections.some((selection) => selection.id === "soiling"),
            secondSide: selections.some(
              (selection) => selection.id === "second-side",
            ),
          }
        : item,
    ),
  };
  persist();
  emit();
}

export function setFlags(
  uid: string,
  flags: { heavySoiling?: boolean; secondSide?: boolean },
): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid ? { ...item, ...flags } : item,
    ),
  };
  persist();
  emit();
}

export function setManualDescription(uid: string, description: string): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid
        ? { ...item, manualDescription: description.slice(0, 300) }
        : item,
    ),
  };
  persist();
  emit();
}

export function addPhoto(uid: string, photo: PhotoMeta): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid
        ? {
            ...item,
            photos: [...item.photos.filter((p) => p.id !== photo.id), photo],
          }
        : item,
    ),
  };
  persist();
  emit();
}

export function removePhoto(uid: string, photoId: string): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid
        ? { ...item, photos: item.photos.filter((p) => p.id !== photoId) }
        : item,
    ),
  };
  persist();
  emit();
}

export function updateCheckout(patch: Partial<CheckoutDraft>): void {
  state = { ...state, checkout: { ...state.checkout, ...patch } };
  persist();
  emit();
}

export function setOrderOption(id: string, enabled: boolean): void {
  const current = state.checkout.orderOptionIds;
  const next = enabled
    ? Array.from(new Set([...current, id]))
    : current.filter((optionId) => optionId !== id);
  updateCheckout({ orderOptionIds: next });
}

export function resetCart(): void {
  state = emptyState();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  emit();
}

export function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(value)));
}

export function itemsFingerprint(items: CartItem[]): string {
  return items
    .map(
      (item) =>
        `${item.tariffId}:${item.parameterValue}:${optionsKey(item.optionSelections)}:${item.photos.length}:${item.manualDescription}`,
    )
    .join("|");
}

export type CartTariff = {
  id: string;
  category: CartCategory;
  serviceId?: string;
  serviceLabel?: string;
  unit?: string;
  parameterLabel?: string;
  minValue?: number;
  maxValue?: number;
  step?: number;
  basePrice: number | null;
  isManual: boolean;
  options?: PricingOption[];
  label: string;
  variantLabel: string;
};

export function priceCart(
  items: CartItem[],
  tariffs: CartTariff[],
  rules: PricingRules,
  outOfTown: boolean,
  orderOptions: PricingOption[] = [],
  orderOptionIds: string[] = [],
) {
  return calculateOrder({
    items: items.map((item) => {
      const tariff = tariffs.find((t) => t.id === item.tariffId);
      return {
        key: item.uid,
        category: item.category,
        serviceId: tariff?.serviceId ?? item.serviceId,
        serviceLabel: tariff?.serviceLabel ?? item.serviceLabel,
        variantId: item.tariffId,
        variantLabel: item.variantLabel,
        unit: tariff?.unit ?? item.unit,
        parameterLabel: tariff?.parameterLabel ?? item.parameterLabel,
        parameterValue: item.parameterValue,
        pricePerUnit: tariff?.basePrice ?? 0,
        manual: tariff?.isManual ?? item.isManual,
        options: tariff?.options,
        optionSelections: item.optionSelections,
        heavySoiling: item.heavySoiling,
        secondSide: item.secondSide,
      };
    }),
    rules,
    outOfTown,
    orderOptions,
    orderOptionIds,
  });
}

export function photosMissingText(items: CartItem[]): string {
  const total = items.length;
  const withPhoto = items.filter((item) => item.photos.length > 0).length;
  if (total === 0) return "";
  if (withPhoto === total) {
    return `Фото ${withPhoto} из ${total}. Все позиции с фото.`;
  }
  const missing = items.filter((item) => item.photos.length === 0);
  const names = missing
    .map((item) =>
      item.isManual || item.category === "other"
        ? "«Другое»"
        : `${item.label.toLowerCase()} (${item.variantLabel.toLowerCase()})`,
    )
    .join(", ");
  return `Фото ${withPhoto} из ${total}. Без фото: ${names} — цена по этим позициям останется предварительной.`;
}
