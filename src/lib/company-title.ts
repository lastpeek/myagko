import type { CompanySettings } from "@/lib/db/schema";

export function companyPageTitle(
  company: Pick<CompanySettings, "name" | "city" | "browserTitle">,
): string {
  const custom = company.browserTitle.trim();
  return custom || `${company.name} — услуги на выезде в ${company.city}`;
}
