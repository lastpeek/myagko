"use client";

import { useEffect, useSyncExternalStore } from "react";

import { calculateOrder, type PricingRules } from "@/lib/calc/pricing";

export type CartCategory = "sofa" | "armchair" | "mattress" | "chair" | "other";

export type PhotoMeta = {
  id: string;
  width: number;
  height: number;
  name: string;
};

export type CartItem = {
  uid: string;
  tariffId: string;
  category: CartCategory;
  label: string;
  variantLabel: string;
  quantity: number;
  heavySoiling: boolean;
  secondSide: boolean;
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
            .map((item) => ({ ...item, photos: item.photos ?? [] })),
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
    typeof item.quantity === "number"
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

export function addItem(input: {
  tariffId: string;
  category: CartCategory;
  label: string;
  variantLabel: string;
  quantity?: number;
  heavySoiling?: boolean;
  secondSide?: boolean;
  manualDescription?: string;
}): string {
  const quantity = clampQuantity(input.quantity ?? 1);
  const manualDescription = (input.manualDescription ?? "").trim();
  const heavySoiling = Boolean(input.heavySoiling);
  const secondSide = Boolean(input.secondSide);

  const existing = findItemByConfig({
    tariffId: input.tariffId,
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
              quantity: clampQuantity(item.quantity + quantity),
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
        label: input.label,
        variantLabel: input.variantLabel,
        quantity,
        heavySoiling,
        secondSide,
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
  heavySoiling?: boolean;
  secondSide?: boolean;
  manualDescription?: string;
}): CartItem | null {
  const manualDescription = (input.manualDescription ?? "").trim();
  return (
    state.items.find(
      (item) =>
        item.tariffId === input.tariffId &&
        item.heavySoiling === Boolean(input.heavySoiling) &&
        item.secondSide === Boolean(input.secondSide) &&
        item.manualDescription === manualDescription,
    ) ?? null
  );
}

export function getItem(uid: string): CartItem | null {
  return state.items.find((item) => item.uid === uid) ?? null;
}

export function setQuantity(uid: string, quantity: number): void {
  state = {
    ...state,
    items: state.items.map((item) =>
      item.uid === uid ? { ...item, quantity: clampQuantity(quantity) } : item,
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
        `${item.tariffId}:${item.quantity}:${item.heavySoiling}:${item.secondSide}:${item.photos.length}:${item.manualDescription}`,
    )
    .join("|");
}

export type CartTariff = {
  id: string;
  category: CartCategory;
  basePrice: number | null;
  allowsSoiling: boolean;
  allowsSecondSide: boolean;
  isManual: boolean;
  label: string;
  variantLabel: string;
};

export function priceCart(
  items: CartItem[],
  tariffs: CartTariff[],
  rules: PricingRules,
  outOfTown: boolean,
) {
  return calculateOrder({
    items: items.map((item) => {
      const tariff = tariffs.find((t) => t.id === item.tariffId);
      return {
        key: item.uid,
        category: item.category,
        basePrice: tariff?.basePrice ?? null,
        quantity: item.quantity,
        heavySoiling: item.heavySoiling,
        secondSide: item.secondSide,
        manual: tariff?.isManual ?? false,
        allowsSoiling: tariff?.allowsSoiling ?? true,
        allowsSecondSide: tariff?.allowsSecondSide ?? false,
      };
    }),
    rules,
    outOfTown,
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
      item.category === "other"
        ? "«Другое»"
        : `${item.label.toLowerCase()} (${item.variantLabel.toLowerCase()})`,
    )
    .join(", ");
  return `Фото ${withPhoto} из ${total}. Без фото: ${names} — цена по этим позициям останется предварительной.`;
}
