import type { Metadata } from "next";

import { CartView } from "@/components/cart-view";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCompany, getPricingCatalog, getSettings } from "@/lib/company";
import { normalizePhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Заявка",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CartPage() {
  const [company, catalog, settings] = await Promise.all([
    getCompany(),
    getPricingCatalog(),
    getSettings(),
  ]);

  const normalized = normalizePhone(company.phone) ?? company.phone;

  return (
    <>
      <SiteHeader name={company.name} city={company.city} />
      <main>
        <CartView
          tariffs={catalog.tariffs}
          rules={catalog.rules}
          orderOptions={catalog.options.filter(
            (option) =>
              option.kind === "fixed_order" && option.scope === "order",
          )}
          maxPhotos={settings.maxPhotosPerItem}
          otherRequiresPhoto={company.otherRequiresPhoto}
        />
      </main>
      <SiteFooter
        name={company.name}
        city={company.city}
        phone={normalized}
        email={company.email}
        territory={company.territory}
      />
    </>
  );
}
