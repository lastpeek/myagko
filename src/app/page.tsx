import Link from "next/link";

import { Configurator } from "@/components/configurator";
import { CopyEmail } from "@/components/copy-email";
import { GallerySection } from "@/components/gallery-section";
import { ChevronRightIcon, PhoneIcon } from "@/components/icons";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getCompany,
  getPricingCatalog,
  getSettings,
} from "@/lib/company";
import { getDb } from "@/lib/db";
import { formatRub } from "@/lib/format";
import { listGalleryPhotos } from "@/lib/gallery";
import { logoUrl } from "@/lib/logo-assets";
import { formatPhone, normalizePhone, phoneHref } from "@/lib/phone";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [company, catalog, settings, gallery] = await Promise.all([
    getCompany(),
    getPricingCatalog(),
    getSettings(),
    listGalleryPhotos(getDb(), { visibleOnly: true }),
  ]);

  const rules = catalog.rules;
  const normalized = normalizePhone(company.phone) ?? company.phone;

  const groups = catalog.services
    .map((category) => ({
      ...category,
      services: catalog.catalogServices
        .filter((service) => service.categoryId === category.id)
        .map((service) => ({
          ...service,
          variants: catalog.tariffs.filter(
            (variant) => variant.serviceId === service.id,
          ),
        }))
        .filter((service) => service.variants.length > 0),
    }))
    .filter((category) => category.services.length > 0);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: company.name,
    areaServed: company.city,
    telephone: normalized,
    email: company.email,
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    priceRange: `${formatRub(rules.minOrder)}–`,
  };

  return (
    <>
      <SiteHeader
        name={company.name}
        city={company.city}
        logoUrl={logoUrl(company.logoKey)}
      />

      <main>
        <div id="pick">
          <Configurator
            categories={catalog.services}
            catalogServices={catalog.catalogServices}
            tariffs={catalog.tariffs}
            rules={rules}
            heroTitle={company.heroTitle}
            heroSubtitle={company.heroSubtitle}
            maxPhotos={settings.maxPhotosPerItem}
          />
        </div>

        <section className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10">
          <div className="kicker">Услуги и цены</div>
          <h2 className="h2 mt-2">Сколько стоит</h2>
          <p className="body mt-2 max-w-[58ch] text-ink-2">
            Это предварительные цены за одну единицу. Точную стоимость мастер
            подтвердит после фото или осмотра.
          </p>

          <div className="mt-6 grid gap-2.5 md:grid-cols-2">
            {groups.map((category) => (
              <div key={category.id} className="card p-5 md:p-6">
                <h3 className="h3">{category.label}</h3>
                <div className="mt-3 grid gap-3">
                  {category.services.map((service) => (
                    <div key={service.id}>
                      <div className="label text-ink-2">{service.label}</div>
                      <dl className="mt-1 grid gap-1.5">
                        {service.variants.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-baseline justify-between gap-4 border-t border-line pt-1.5 first:border-0 first:pt-0"
                          >
                            <dt className="text-[14px] text-ink-2">
                              {item.variantLabel}
                            </dt>
                            <dd className="tabular whitespace-nowrap text-[14px] font-semibold">
                              {item.isManual
                                ? "по фото"
                                : `${formatRub(item.basePrice)}${
                                    item.unit ? ` / ${item.unit}` : ""
                                  }`}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="card mt-2.5 grid gap-4 p-5 md:grid-cols-2 md:p-6">
            <div>
              <div className="label text-ink-2">Доплаты</div>
              <ul className="mt-2 grid gap-1.5 text-[14px]">
                {catalog.options.map((option) => (
                  <li key={option.id} className="flex justify-between gap-4">
                    <span className="text-ink-2">{option.label}</span>
                    <span className="tabular whitespace-nowrap font-semibold">
                      {option.kind === "percent"
                        ? `+${option.value}%`
                        : option.kind === "fixed"
                          ? `+${formatRub(option.value)} / шт`
                          : `+${formatRub(option.value)} / заказ`}
                    </span>
                  </li>
                ))}
                {catalog.options.length === 0 ? (
                  <li className="text-ink-2">Без доплат</li>
                ) : null}
              </ul>
            </div>
            <div>
              <div className="label text-ink-2">Правила</div>
              <ul className="mt-2 grid gap-1.5 text-[14px]">
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Минимальный заказ за работы</span>
                  <span className="tabular font-semibold">
                    {formatRub(rules.minOrder)}
                  </span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Выезд по городу</span>
                  <span className="font-semibold">бесплатно</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Округление итога</span>
                  <span className="font-semibold">
                    до {rules.roundingStep} ₽ вверх
                  </span>
                </li>
                {rules.outOfTownFee > 0 ? (
                  <li className="flex justify-between gap-4">
                    <span className="text-ink-2">Выезд за город</span>
                    <span className="tabular font-semibold">
                      +{formatRub(rules.outOfTownFee)}
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>

        {gallery.length > 0 ? (
          <GallerySection
            items={gallery.map((photo) => {
              const caption = photo.caption.trim();
              const alt = caption || `Химчистка мебели, ${company.city}`;
              return {
                id: photo.id,
                src: `/api/gallery/${photo.id}`,
                beforeSrc: photo.beforeStorageKey
                  ? `/api/gallery/${photo.id}/before`
                  : null,
                caption: photo.caption,
                alt,
                beforeAlt: `${alt} — до чистки`,
              };
            })}
          />
        ) : null}

        <section className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10">
          <div className="kicker">Как это работает</div>
          <h2 className="h2 mt-2">Три шага без переписки</h2>
          <div className="mt-6 grid gap-2.5 md:grid-cols-3">
            {[
              {
                title: "Выбираете услугу",
                text: "Отмечаете варианты и добавляете фото — по ним мастер увидит объём работы.",
              },
              {
                title: "Отправляете заявку",
                text: "Указываете адрес и удобное время. Цена сразу видна, платить сейчас не нужно.",
              },
              {
                title: "Мастер подтверждает",
                text: "Согласует итоговую стоимость и время. Изменения появятся на вашей странице заявки.",
              },
            ].map((step, index) => (
              <div key={step.title} className="card p-5 md:p-6">
                <div className="tabular text-[13px] font-semibold text-accent">
                  Шаг {index + 1}
                </div>
                <h3 className="h3 mt-2">{step.title}</h3>
                <p className="small mt-1.5 text-ink-2">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Link href="#pick" className="btn btn-secondary w-auto px-5">
              Выбрать услугу
              <ChevronRightIcon className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10">
          <div className="card p-5 md:p-8">
            <div className="kicker">Контакты</div>
            <h2 className="h2 mt-2">Связаться с нами</h2>
            <p className="body mt-2 max-w-[56ch] text-ink-2">{company.territory}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a href={phoneHref(normalized)} className="btn btn-secondary w-auto px-5">
                <PhoneIcon className="h-4 w-4" />
                {formatPhone(normalized)}
              </a>
              <CopyEmail email={company.email} variant="button" />
            </div>
            <p className="caption mt-4">
              Пишите в любое время — ответим в рабочие часы.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter
        name={company.name}
        city={company.city}
        phone={normalized}
        email={company.email}
        territory={company.territory}
        logoUrl={logoUrl(company.logoKey)}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
