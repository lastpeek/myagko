import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CheckIcon, ClockIcon, InfoIcon, MapPinIcon } from "@/components/icons";
import { CopyLink } from "@/components/copy-link";
import { Logo } from "@/components/logo";
import { OrderRefresher } from "@/components/order-refresher";
import { ThemeToggle } from "@/components/theme-toggle";
import { getCompany } from "@/lib/company";
import { getDb } from "@/lib/db";
import { formatDate, formatRub, formatTimeRange } from "@/lib/format";
import { getPublicOrder } from "@/lib/orders";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  agreed: "Согласована",
  done: "Завершена",
  cancelled: "Отменена",
};

const STATUS_CLASS: Record<string, string> = {
  new: "badge",
  agreed: "badge",
  done: "badge badge-muted",
  cancelled: "badge badge-faint",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const order = await getPublicOrder(getDb(), token);
  return {
    title: order ? `Заявка №${order.number}` : "Заявка не найдена",
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { token } = await params;
  const { new: isNew } = await searchParams;

  const [order, company] = await Promise.all([
    getPublicOrder(getDb(), token),
    getCompany(),
  ]);

  if (!order) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const absoluteUrl = `${siteUrl.replace(/\/$/, "")}/z/${order.token}`;

  const agreedTime =
    order.agreed.date && order.agreed.from
      ? `${formatDate(order.agreed.date)}, ${formatTimeRange(order.agreed.from, order.agreed.to)}`
      : null;

  const desiredTime =
    order.desired.date && order.desired.from
      ? `${formatDate(order.desired.date)}, ${formatTimeRange(order.desired.from, order.desired.to)}`
      : order.desired.date
        ? formatDate(order.desired.date)
        : null;

  const allManual =
    order.items.length > 0 &&
    order.totals.manualItemsCount === order.items.length;
  const price =
    order.finalPrice ?? (allManual ? null : order.totals.total);

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex w-full max-w-[720px] items-center gap-3 px-5 pb-5 pt-6 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <Logo />
          <span className="text-[15px] font-semibold">{company.name}</span>
        </Link>
        <span className="caption ml-1 hidden sm:block">{company.city}</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-5 pb-12 md:px-8">
        {isNew === "1" ? (
          <div className="flex items-center gap-3 rounded-[20px] bg-accent-soft px-4 py-3.5">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-surface text-accent">
              <CheckIcon className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-accent-ink">
                Заявка отправлена
              </div>
              <div className="text-[12.5px] leading-4 text-accent-ink/80">
                Мастер свяжется по телефону и подтвердит время.
              </div>
            </div>
          </div>
        ) : null}

        <h1 className="h1 mt-5">Заявка №{order.number}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={STATUS_CLASS[order.status] ?? "badge"}>
            {STATUS_LABEL[order.status] ?? order.status}
          </span>
          <span className="caption">от {formatDateTime(new Date(order.createdAt))}</span>
        </div>

        <div className="card mt-5 p-4 md:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="kicker">
                {order.finalPrice !== null
                  ? "Согласованная цена"
                  : "Предварительная цена"}
              </div>
              <div className="tabular mt-1 text-[28px] font-semibold leading-9 tracking-[-0.02em]">
                {price === null ? "По фото" : formatRub(price)}
              </div>
            </div>
            <OrderRefresher token={order.token} updatedAt={order.updatedAt} />
          </div>

          <div className="mt-4 grid gap-2 border-t border-line pt-3.5">
            <div className="flex items-start justify-between gap-4 text-[13.5px]">
              <span className="text-ink-2">Время</span>
              <span className="text-right font-semibold">
                {agreedTime ? (
                  agreedTime
                ) : desiredTime ? (
                  <>
                    {desiredTime}
                    <span className="block text-[12px] font-normal text-ink-3">
                      Пожелание, мастер подтвердит
                    </span>
                  </>
                ) : (
                  <span className="font-normal text-ink-2">уточняется</span>
                )}
              </span>
            </div>
            <div className="flex items-start justify-between gap-4 text-[13.5px]">
              <span className="text-ink-2">Выезд</span>
              <span className="max-w-[60%] text-right font-semibold">
                {order.outOfTown ? "За город" : "По городу"}
              </span>
            </div>
          </div>
        </div>

        <section className="mt-4" aria-labelledby="order-items">
          <h2 id="order-items" className="h3">
            Состав
          </h2>
          <div className="card mt-2.5 divide-y divide-line">
            {order.items.map((item) => (
              <div key={item.id} className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[15px] font-semibold leading-6 tracking-[-0.01em]">
                      {item.label} · {item.variantLabel}
                      {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                    </div>
                    <div className="mt-0.5 text-[12.5px] leading-4 text-ink-3">
                      {item.manual
                        ? "Цена по фото"
                        : [
                            item.heavySoiling ? "сильные загрязнения" : "",
                            item.secondSide ? "две стороны" : "",
                          ]
                            .filter(Boolean)
                            .join(", ") || "Без доплат"}
                    </div>
                    {item.manual && item.manualDescription ? (
                      <p className="small mt-1.5 text-ink-2">
                        {item.manualDescription}
                      </p>
                    ) : null}
                    {!item.manual ? (
                      <p className="caption mt-1">{item.formula}</p>
                    ) : null}
                  </div>
                  <div className="tabular whitespace-nowrap text-[15px] font-semibold">
                    {item.lineTotal === null ? "По фото" : formatRub(item.lineTotal)}
                  </div>
                </div>

                {item.photos.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.photos.map((photo) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={photo.id}
                        src={`/api/photos/${photo.id}?token=${order.token}`}
                        alt={`Фото: ${item.label} ${item.variantLabel}`}
                        width={photo.width || 72}
                        height={photo.height || 72}
                        loading="lazy"
                        className="h-[72px] w-[72px] rounded-[12px] border border-line bg-surface-2 object-cover"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-4 p-4 md:p-5" aria-label="Расчёт">
          <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
            <span>Работы</span>
            <span className="tabular">{formatRub(order.totals.itemsSubtotal)}</span>
          </div>
          {order.totals.minimumAdjustment > 0 ? (
            <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
              <span>До минимального заказа</span>
              <span className="tabular">
                +{formatRub(order.totals.minimumAdjustment)}
              </span>
            </div>
          ) : null}
          {order.totals.outOfTownFee > 0 ? (
            <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
              <span>Выезд за город</span>
              <span className="tabular">
                +{formatRub(order.totals.outOfTownFee)}
              </span>
            </div>
          ) : null}
          {order.totals.roundingAdjustment > 0 ? (
            <div className="flex items-baseline justify-between gap-3 py-1 text-[13.5px] text-ink-2">
              <span>Округление</span>
              <span className="tabular">
                +{formatRub(order.totals.roundingAdjustment)}
              </span>
            </div>
          ) : null}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <span className="text-[15px] font-semibold">
              {order.finalPrice !== null ? "Согласовано" : "Предварительно"}
            </span>
            <span className="tabular text-[18px] font-semibold tracking-[-0.01em]">
              {price === null ? "По фото" : formatRub(price)}
            </span>
          </div>

          {order.totals.hasManualItems ? (
            <p className="small mt-3 text-ink-2">
              Позиции «По фото» мастер оценит после осмотра — сумма появится здесь.
            </p>
          ) : null}

          <div className="mt-3 flex items-start gap-2 border-t border-line pt-3 text-[12px] leading-[18px] text-ink-2">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
            <span>
              Цены предварительные. Итоговую стоимость мастер подтверждает после
              осмотра. Минимальный заказ за работы —{" "}
              {formatRub(order.totals.minOrder)}.
            </span>
          </div>
        </section>

        {order.comment ? (
          <section className="card mt-4 p-4 md:p-5">
            <h2 className="label text-ink-2">Комментарий</h2>
            <p className="body mt-1.5 whitespace-pre-line">{order.comment}</p>
          </section>
        ) : null}

        <section className="mt-4">
          <h2 className="label text-ink-2">Ссылка на заявку</h2>
          <div className="mt-2">
            <CopyLink value={absoluteUrl} />
          </div>
          <p className="caption mt-2">
            Ссылка личная — не пересылайте её незнакомым. Страница обновляется
            сама, когда мастер меняет статус, цену или время.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/" className="btn btn-ghost w-auto px-5">
            На главную
          </Link>
          <a href={`mailto:${company.email}`} className="link text-[13px]">
            Написать нам
          </a>
        </div>

        <div className="mt-8 flex items-center gap-2 text-[11.5px] text-ink-3">
          <ClockIcon className="h-3.5 w-3.5" />
          Данные заявки видны только по этой ссылке.
        </div>

        <div className="mt-6 border-t border-line pt-4 text-[11.5px] leading-4 text-ink-3">
          <MapPinIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
          {company.city} · {company.territory}
        </div>
      </main>
    </div>
  );
}
