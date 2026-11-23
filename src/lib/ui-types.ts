import type { PricingCategory, PricingOption, PricingRules } from "@/lib/calc/pricing";

/** Сериализуемые данные, которые сервер передаёт клиентским компонентам. */

export type PublicService = {
  id: string;
  label: string;
  hint: string;
  icon: string;
};

export type PublicCatalogService = {
  id: string;
  categoryId: string;
  label: string;
  hint: string;
  icon: string;
};

export type PublicPriceOption = PricingOption & {
  sortOrder: number;
};

export type PublicTariff = {
  id: string;
  category: PricingCategory;
  serviceId: string;
  serviceLabel: string;
  label: string;
  variantLabel: string;
  unit: string;
  parameterLabel: string;
  basePrice: number | null;
  minValue: number;
  maxValue: number;
  step: number;
  requiresPhoto: boolean;
  allowsSoiling: boolean;
  allowsSecondSide: boolean;
  isManual: boolean;
  options: PublicPriceOption[];
};

export type PublicRules = PricingRules;
