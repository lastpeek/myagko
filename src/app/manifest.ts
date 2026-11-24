import type { MetadataRoute } from "next";

import { getCompany } from "@/lib/company";
import { companyPageTitle } from "@/lib/company-title";
import { logoUrl } from "@/lib/logo-assets";
import { deriveAccentTheme } from "@/lib/theme";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const company = await getCompany();
  const theme = deriveAccentTheme(company.accentColor);

  return {
    name: companyPageTitle(company),
    short_name: company.name,
    description:
      "Выберите мебель, добавьте фото и отправьте заявку. Предварительная цена сразу, точную мастер подтвердит после осмотра.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ru",
    dir: "ltr",
    background_color: "#F7F4EF",
    theme_color: theme.light.accent,
    icons: company.logoKey
      ? [
          {
            src: logoUrl(company.logoKey, 192)!,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: logoUrl(company.logoKey, 512)!,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ]
      : [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
  };
}
