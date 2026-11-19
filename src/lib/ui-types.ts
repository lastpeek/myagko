import type { PricingCategory, PricingRules } from "@/lib/calc/pricing";

/** Сериализуемые данные, которые сервер передаёт клиентским компонентам. */
export type PublicTariff = {
  id: string;
  category: PricingCategory;
  label: string;
  variantLabel: string;
  basePrice: number | null;
  requiresPhoto: boolean;
  allowsSoiling: boolean;
  allowsSecondSide: boolean;
  isManual: boolean;
};

export type PublicRules = PricingRules;
