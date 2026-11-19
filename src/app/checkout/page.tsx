import type { Metadata } from "next";

import { CheckoutForm } from "@/components/checkout-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getActiveTariffItems,
  getCompany,
  getSettings,
  toPricingRules,
  toPublicTariff,
} from "@/lib/company";
import { normalizePhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Оформление заявки",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [company, tariffRows, settings] = await Promise.all([
    getCompany(),
    getActiveTariffItems(),
    getSettings(),
  ]);

  const normalized = normalizePhone(company.phone) ?? company.phone;

  return (
    <>
      <SiteHeader name={company.name} city={company.city} />
      <main>
        <CheckoutForm
          tariffs={tariffRows.map(toPublicTariff)}
          rules={toPricingRules(settings)}
          territory={company.territory}
          maxPhotos={settings.maxPhotosPerItem}
        />
      </main>
      <SiteFooter
        name={company.name}
        city={company.city}
        phone={normalized}
        email={company.email}
      />
    </>
  );
}
