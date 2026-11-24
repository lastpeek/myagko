import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCompany } from "@/lib/company";
import { logoUrl } from "@/lib/logo-assets";
import { normalizePhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Сторонние ресурсы",
  description: "Библиотеки и шрифты, которые используются на сайте.",
};

const RESOURCES = [
  {
    name: "Next.js",
    license: "MIT",
    url: "https://nextjs.org",
    note: "фреймворк и серверный рендеринг",
  },
  {
    name: "React",
    license: "MIT",
    url: "https://react.dev",
    note: "интерфейс",
  },
  {
    name: "Tailwind CSS",
    license: "MIT",
    url: "https://tailwindcss.com",
    note: "стили на CSS-переменных",
  },
  {
    name: "Motion",
    license: "MIT",
    url: "https://motion.dev",
    note: "переходы и появление элементов",
  },
  {
    name: "Drizzle ORM",
    license: "Apache-2.0",
    url: "https://orm.drizzle.team",
    note: "работа с базой данных",
  },
  {
    name: "sharp",
    license: "Apache-2.0",
    url: "https://sharp.pixelplumbing.com",
    note: "сжатие и перекодирование фотографий",
  },
  {
    name: "Zod",
    license: "MIT",
    url: "https://zod.dev",
    note: "проверка данных на сервере",
  },
  {
    name: "Onest",
    license: "SIL Open Font License 1.1",
    url: "https://fonts.google.com/specimen/Onest",
    note: "гарнитура",
  },
];

export default async function AttributionPage() {
  const company = await getCompany();
  const phone = normalizePhone(company.phone) ?? company.phone;

  return (
    <>
      <SiteHeader
        name={company.name}
        city={company.city}
        logoUrl={logoUrl(company.logoKey)}
        showCart={false}
      />
      <main className="mx-auto w-full max-w-[720px] px-5 pb-12 md:px-8">
        <h1 className="h1">Сторонние ресурсы</h1>
        <p className="body mt-2 max-w-[56ch] text-ink-2">
          Сайт использует открытые библиотеки и шрифт. Ниже — названия, лицензии и
          ссылки на исходные проекты.
        </p>

        <ul className="mt-6 grid gap-2.5">
          {RESOURCES.map((resource) => (
            <li key={resource.name} className="card flex items-start gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">{resource.name}</div>
                <div className="caption mt-0.5">{resource.note}</div>
              </div>
              <div className="text-right">
                <div className="caption">{resource.license}</div>
                <a
                  href={resource.url}
                  className="link text-[12.5px]"
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  Сайт
                </a>
              </div>
            </li>
          ))}
        </ul>

        <p className="small mt-6 text-ink-2">
          Иконки нарисованы для этого проекта, сторонние наборы не используются.
        </p>

        <div className="mt-8">
          <Link href="/" className="link text-[14px]">
            Вернуться на главную
          </Link>
        </div>
      </main>
      <SiteFooter
        name={company.name}
        city={company.city}
        phone={phone}
        email={company.email}
        territory={company.territory}
        logoUrl={logoUrl(company.logoKey)}
      />
    </>
  );
}
