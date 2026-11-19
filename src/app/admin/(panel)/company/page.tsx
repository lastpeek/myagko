import type { Metadata } from "next";

import { CompanyForm } from "@/components/admin/company-form";
import { getCompany } from "@/lib/company";

export const metadata: Metadata = {
  title: "Компания",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCompanyPage() {
  const company = await getCompany();

  return (
    <div>
      <h1 className="h2">Компания</h1>
      <p className="small mt-1.5 max-w-[60ch] text-ink-2">
        Название, контакты и акцент. Эти данные видит клиент на сайте и в заявке.
      </p>
      <div className="mt-4">
        <CompanyForm company={company} />
      </div>
    </div>
  );
}
