import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import type { CSSProperties } from "react";

import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { getCompany } from "@/lib/company";
import { deriveAccentTheme } from "@/lib/theme";

import "./globals.css";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-onest",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const company = await getCompany();
  const title = `${company.name} — химчистка мягкой мебели в ${company.city}`;

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: title,
      template: `%s — ${company.name}`,
    },
    description:
      "Выездная химчистка диванов, кресел, матрасов и стульев. Предварительная цена сразу, точную мастер подтвердит после фото.",
    applicationName: company.name,
    formatDetection: { telephone: true, address: true, email: true },
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [
        { url: "/icons/apple-icon.png", sizes: "180x180", type: "image/png" },
      ],
    },
    openGraph: {
      type: "website",
      locale: "ru_RU",
      siteName: company.name,
      title,
      description:
        "Выберите мебель, приложите фото и отправьте заявку. Цена — сразу, без переписки.",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: company.name }],
    },
    robots: { index: true, follow: true },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4EF" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

const themeScript = `(function(){try{var t=localStorage.getItem("myagko-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const company = await getCompany();
  const theme = deriveAccentTheme(company.accentColor);

  const accentStyle = {
    "--accent-light": theme.light.accent,
    "--accent-soft-light": theme.light.accentSoft,
    "--accent-ink-light": theme.light.accentInk,
    "--accent-contrast-light": theme.light.accentContrast,
    "--accent-dark": theme.dark.accent,
    "--accent-soft-dark": theme.dark.accentSoft,
    "--accent-ink-dark": theme.dark.accentInk,
    "--accent-contrast-dark": theme.dark.accentContrast,
  } as CSSProperties;

  return (
    <html
      lang="ru"
      style={accentStyle}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={onest.variable}>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
