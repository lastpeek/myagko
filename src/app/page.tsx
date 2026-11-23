import Link from "next/link";

import { Configurator } from "@/components/configurator";
import { GallerySection } from "@/components/gallery-section";
import { ChevronRightIcon, PhoneIcon } from "@/components/icons";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  getActiveTariffItems,
  getCompany,
  getSettings,
  toPublicTariff,
  toPricingRules,
} from "@/lib/company";
import { getDb } from "@/lib/db";
import { formatRub } from "@/lib/format";
import { listGalleryPhotos } from "@/lib/gallery";
import { formatPhone, normalizePhone, phoneHref } from "@/lib/phone";

export const dynamic = "force-dynamic";

const CATEGORY_LABEL: Record<string, string> = {
  sofa: "Диваны",
  armchair: "Кресла",
  mattress: "Матрасы",
  chair: "Стулья",
  other: "Другое",
};

export default async function HomePage() {
  const [company, tariffRows, settings, gallery] = await Promise.all([
    getCompany(),
    getActiveTariffItems(),
    getSettings(),
    listGalleryPhotos(getDb(), { visibleOnly: true }),
  ]);

  const tariffs = tariffRows.map((item) => toPublicTariff(item));
  const rules = toPricingRules(settings);
  const normalized = normalizePhone(company.phone) ?? company.phone;

  const groups = ["sofa", "armchair", "mattress", "chair", "other"]
    .map((category) => ({
      category,
      items: tariffs.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0);

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
      <SiteHeader name={company.name} city={company.city} />

      <main>
        <div id="pick">
          <Configurator
            tariffs={tariffs}
            heroTitle={company.heroTitle}
            heroSubtitle={company.heroSubtitle}
            minOrder={rules.minOrder}
            maxPhotos={settings.maxPhotosPerItem}
          />
        </div>

        <section className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10">
          <div className="kicker">Услуги и цены</div>
          <h2 className="h2 mt-2">Сколько стоит чистка</h2>
          <p className="body mt-2 max-w-[58ch] text-ink-2">
            Это предварительные цены за одну сторону. Точную стоимость мастер
            подтвердит после фото или осмотра.
          </p>

          <div className="mt-6 grid gap-2.5 md:grid-cols-2">
            {groups.map((group) => (
              <div key={group.category} className="card p-5 md:p-6">
                <h3 className="h3">{CATEGORY_LABEL[group.category]}</h3>
                <dl className="mt-3 grid gap-2">
                  {group.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-baseline justify-between gap-4 border-t border-line pt-2 first:border-0 first:pt-0"
                    >
                      <dt className="text-[14px] text-ink-2">
                        {group.category === "other"
                          ? "Цена по фото"
                          : item.variantLabel}
                      </dt>
                      <dd className="tabular text-[14px] font-semibold">
                        {item.isManual ? "по фото" : formatRub(item.basePrice)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>

          <div className="card mt-2.5 grid gap-4 p-5 md:grid-cols-2 md:p-6">
            <div>
              <div className="label text-ink-2">Доплаты</div>
              <ul className="mt-2 grid gap-1.5 text-[14px]">
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Сильные загрязнения</span>
                  <span className="tabular font-semibold">
                    +{rules.soilingPercent}%
                  </span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Вторая сторона матраса</span>
                  <span className="tabular font-semibold">
                    +{rules.secondSidePercent}%
                  </span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Выезд за город</span>
                  <span className="tabular font-semibold">
                    +{formatRub(rules.outOfTownFee)}
                  </span>
                </li>
              </ul>
            </div>
            <div>
              <div className="label text-ink-2">Правила</div>
              <ul className="mt-2 grid gap-1.5 text-[14px]">
                <li className="flex justify-between gap-4">
                  <span className="text-ink-2">Минимальный заказ за чистку</span>
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
                  <span className="font-semibold">до 10 ₽ вверх</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {gallery.length > 0 ? (
          <GallerySection
            items={gallery.map((photo) => ({
              id: photo.id,
              src: `/api/gallery/${photo.id}`,
              beforeSrc: photo.beforeStorageKey
                ? `/api/gallery/${photo.id}/before`
                : null,
              caption: photo.caption,
              alt:
                photo.caption.trim() ||
                `Химчистка мебели, ${company.city}`,
            }))}
          />
        ) : null}

        <section className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10">
          <div className="kicker">Как это работает</div>
          <h2 className="h2 mt-2">Три шага без переписки</h2>
          <div className="mt-6 grid gap-2.5 md:grid-cols-3">
            {[
              {
                title: "Выбираете мебель",
                text: "Отмечаете варианты и добавляете фото — по ним мастер увидит состояние ткани.",
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
              Выбрать мебель
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
              <a
                href={`mailto:${company.email}`}
                className="btn btn-ghost w-auto px-5"
              >
                {company.email}
              </a>
            </div>
            <p className="caption mt-4">
              {company.city}. Пишите в любое время — ответим в рабочие часы.
            </p>
          </div>
        </section>
      </main>

      <SiteFooter
        name={company.name}
        city={company.city}
        phone={normalized}
        email={company.email}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
