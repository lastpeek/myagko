import type { Metadata } from "next";

import { TariffForm } from "@/components/admin/tariff-form";
import { getSettings, getTariffItems } from "@/lib/company";

export const metadata: Metadata = {
  title: "Тарифы",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTariffsPage() {
  const [rows, settings] = await Promise.all([getTariffItems(), getSettings()]);

  return (
    <div>
      <h1 className="h2">Тарифы</h1>
      <p className="small mt-1.5 max-w-[60ch] text-ink-2">
        Цены и доплаты, по которым считается предварительная стоимость. Публичные
        страницы обновятся после сохранения.
      </p>

      <div className="mt-4">
        <TariffForm
          items={rows.map((row) => ({
            id: row.id,
            category: row.category,
            label: row.label,
            variantLabel: row.variantLabel,
            basePrice: row.basePrice,
            isManual: row.isManual,
            isActive: row.isActive,
          }))}
          settings={{
            minOrder: settings.minOrder,
            soilingPercent: settings.soilingPercent,
            secondSidePercent: settings.secondSidePercent,
            outOfTownFee: settings.outOfTownFee,
            roundingStep: settings.roundingStep,
          }}
        />
      </div>
    </div>
  );
}
