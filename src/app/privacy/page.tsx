import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getCompany } from "@/lib/company";
import { CONSENT_VERSION } from "@/lib/consent";
import { formatDate } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: "Какие данные собирает сайт и как они хранятся.",
};

export default async function PrivacyPage() {
  const company = await getCompany();
  const phone = normalizePhone(company.phone) ?? company.phone;

  return (
    <>
      <SiteHeader name={company.name} city={company.city} showCart={false} />
      <main className="mx-auto w-full max-w-[720px] px-5 pb-12 md:px-8">
        <h1 className="h1">Политика конфиденциальности</h1>
        <p className="caption mt-2">Редакция от {formatDate(CONSENT_VERSION)}</p>

        <div className="prose-narrow mt-6 grid gap-5 text-[15px] leading-[23px]">
          <section>
            <h2 className="h3 mb-2">Кто обрабатывает данные</h2>
            <p>
              {company.name}, {company.city}. Связаться можно по телефону{" "}
              <a className="link" href={`tel:${phone}`}>
                {company.phone}
              </a>{" "}
              или почте{" "}
              <a className="link" href={`mailto:${company.email}`}>
                {company.email}
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Какие данные мы собираем</h2>
            <p>
              Имя, телефон, адрес выезда, пожелания по дате и времени, комментарий,
              состав заказа и фотографии мебели. Фотографии нужны, чтобы мастер
              оценил состояние ткани и назвал точную цену.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Зачем</h2>
            <p>
              Чтобы принять заявку, согласовать стоимость и время, приехать по
              адресу и связаться с вами по вопросам заказа. Данные не используются
              для рассылок без отдельного согласия.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Где хранятся</h2>
            <p>
              Заявки хранятся в базе данных на сервере компании, фотографии — в
              приватном хранилище. Доступ к заявке есть у владельца компании и у
              вас по личной ссылке с длинным случайным адресом. Ссылку не нужно
              пересылать посторонним.
            </p>
            <p className="mt-2">
              Черновик заказа до отправки хранится только в вашем браузере:
              состав — в localStorage, фотографии — в IndexedDB. После успешной
              отправки черновик удаляется.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Передача третьим лицам</h2>
            <p>
              Мы не продаём и не передаём данные рекламным сетям. Данные могут
              обрабатываться хостинг-провайдером и сервисом хранения файлов
              исключительно для работы сайта.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Сроки и удаление</h2>
            <p>
              Заявки хранятся столько, сколько нужно для работы и отчётности.
              Вы можете попросить удалить заявку и фотографии, написав на{" "}
              <a className="link" href={`mailto:${company.email}`}>
                {company.email}
              </a>
              . Удаление выполняется в разумный срок, если нет законных оснований
              хранить данные дальше.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Ваши права</h2>
            <p>
              Вы можете запросить сведения об обработке своих данных, потребовать
              их уточнения или удаления, отозвать согласие. Для этого свяжитесь с
              нами по указанным контактам.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Cookies и аналитика</h2>
            <p>
              Сайт использует только технические cookies: сессию владельца в
              кабинете и выбранную тему оформления. Рекламных трекеров и сторонней
              аналитики нет. Тема хранится в localStorage вашего браузера.
            </p>
          </section>

          <section>
            <h2 className="h3 mb-2">Изменения</h2>
            <p>
              При изменении политики обновляется дата редакции. Действующая версия
              всегда доступна на этой странице.
            </p>
          </section>
        </div>

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
      />
    </>
  );
}
