import type { Metadata } from "next";

import {
  ServicePricingManager,
  type AdminVariant,
} from "@/components/admin/service-pricing-manager";
import { getPricingConfig } from "@/lib/company";

export const metadata: Metadata = {
  title: "Услуги и цены",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTariffsPage() {
  const config = await getPricingConfig();
  const optionIdsByItem = new Map<string, string[]>();

  for (const link of config.links) {
    const list = optionIdsByItem.get(link.itemId) ?? [];
    list.push(link.optionId);
    optionIdsByItem.set(link.itemId, list);
  }

  const variants: AdminVariant[] = config.items.map((item) => ({
    id: item.id,
    category: item.category,
    serviceId: item.serviceId,
    label: item.label,
    variantLabel: item.variantLabel,
    unit: item.unit,
    parameterLabel: item.parameterLabel,
    basePrice: item.basePrice,
    minValue: item.minValue,
    maxValue: item.maxValue,
    step: item.step,
    requiresPhoto: item.requiresPhoto,
    isManual: item.isManual,
    isActive: item.isActive,
    sortOrder: item.sortOrder,
    optionIds: optionIdsByItem.get(item.id) ?? [],
  }));

  return (
    <div>
      <h1 className="h2">Услуги и цены</h1>
      <p className="small mt-1.5 max-w-[64ch] text-ink-2">
        Ниша, категории, услуги, варианты, параметры и доплаты. Публичные
        страницы обновятся после сохранения. Старые заявки не меняются.
      </p>

      <div className="mt-4">
        <ServicePricingManager
          categories={config.services.map((category) => ({
            id: category.id,
            label: category.label,
            hint: category.hint,
            icon: category.icon,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
          }))}
          services={config.catalogServices.map((service) => ({
            id: service.id,
            categoryId: service.categoryId,
            label: service.label,
            hint: service.hint,
            icon: service.icon,
            sortOrder: service.sortOrder,
            isActive: service.isActive,
          }))}
          options={config.options.map((option) => ({
            id: option.id,
            label: option.label,
            kind: option.kind,
            value: option.value,
            scope: option.scope,
            sortOrder: option.sortOrder,
            isActive: option.isActive,
          }))}
          variants={variants}
          settings={{
            minOrder: config.settings.minOrder,
            outOfTownFee: config.settings.outOfTownFee,
            roundingStep: config.settings.roundingStep,
          }}
        />
      </div>
    </div>
  );
}
