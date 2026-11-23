import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { OrderEditor } from "@/components/admin/order-editor";
import { StatusBadge, statusLabel } from "@/components/admin/status-badge";
import { ChevronLeftIcon, ClockIcon, MapPinIcon, PhoneIcon } from "@/components/icons";
import { getAdminOrder } from "@/lib/admin-orders";
import { getDb } from "@/lib/db";
import type { OrderStatus } from "@/lib/db/schema";
import { formatDate, formatRub, formatTimeRange } from "@/lib/format";
import { formatPhone, normalizePhone, phoneHref } from "@/lib/phone";
import { formatDateTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Заявка",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function eventText(event: {
  type: string;
  payload: Record<string, string | number | null>;
}): string {
  switch (event.type) {
    case "created":
      return "Заявка создана";
    case "status_changed":
      return `Статус: ${statusLabel(event.payload.from as OrderStatus)} → ${statusLabel(
        event.payload.to as OrderStatus,
      )}`;
    case "price_changed": {
      const from =
        event.payload.from === null ? "не задана" : formatRub(Number(event.payload.from));
      const to =
        event.payload.to === null ? "снята" : formatRub(Number(event.payload.to));
      return `Цена: ${from} → ${to}`;
    }
    case "time_changed":
      return `Время визита: ${
        event.payload.date
          ? `${formatDate(String(event.payload.date))}, ${formatTimeRange(
              String(event.payload.from ?? ""),
              String(event.payload.to ?? ""),
            )}`
          : "снято"
      }`;
    case "note_changed":
      return "Заметка обновлена";
    default:
      return event.type;
  }
}

const ACTOR: Record<string, string> = {
  client: "клиент",
  owner: "владелец",
  system: "система",
};

export default async function AdminOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAdminOrder(getDb(), id);
  if (!detail) notFound();

  const { order, items, photos, events } = detail;
  const normalized = normalizePhone(order.phone) ?? order.phone;
  const allManual =
    order.breakdown.lines.length > 0 &&
    order.breakdown.manualItemsCount === order.breakdown.lines.length;

  const desired =
    order.desiredDate
      ? `${formatDate(order.desiredDate)}${order.desiredTimeFrom ? `, ${formatTimeRange(order.desiredTimeFrom, order.desiredTimeTo)}` : ""}`
      : "не указано";

  const agreed =
    order.agreedDate && order.agreedTimeFrom
      ? `${formatDate(order.agreedDate)}, ${formatTimeRange(order.agreedTimeFrom, order.agreedTimeTo)}`
      : "не согласовано";

  return (
    <div>
      <Link
        href="/admin"
        className="small inline-flex min-h-11 items-center gap-1 text-ink-2 no-underline hover:text-ink"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        Заявки
      </Link>

      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="h2">Заявка №{order.publicNumber}</h1>
        <StatusBadge status={order.status} />
        <span className="caption ml-auto">
          создана {formatDateTime(order.createdAt)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="grid gap-3">
          <section className="card p-4 md:p-5" aria-labelledby="contact-title">
            <h2 id="contact-title" className="h3">
              Клиент
            </h2>
            <div className="mt-2 grid gap-1.5 text-[13.5px]">
              <div className="flex flex-wrap items-center gap-x-3">
                <span className="font-semibold">{order.name}</span>
                <a href={phoneHref(normalized)} className="link">
                  <PhoneIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                  {formatPhone(normalized)}
                </a>
              </div>
              <div className="flex items-start gap-1.5 text-ink-2">
                <MapPinIcon className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <span>
                  {order.address}
                  {order.outOfTown ? (
                    <span className="ml-1 text-warn">· за город</span>
                  ) : null}
                </span>
              </div>
              <div className="text-ink-2">
                <ClockIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
                Пожелание: {desired}
              </div>
              <div className="text-ink-2">
                Согласовано: <span className="text-ink">{agreed}</span>
              </div>
              {order.comment ? (
                <div className="mt-1 rounded-[10px] bg-surface-2 px-3 py-2 text-ink">
                  {order.comment}
                </div>
              ) : null}
              <div className="caption mt-1">
                Согласие на обработку: {formatDateTime(order.consentAt)} · версия{" "}
                {formatDate(order.consentVersion)}
              </div>
            </div>
          </section>

          <section className="card overflow-hidden" aria-labelledby="composition-title">
            <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3.5 md:px-5">
              <h2 id="composition-title" className="h3">
                Состав
              </h2>
              <span className="caption">
                {items.length} поз. · фото {photos.length}
              </span>
            </div>

            <ul className="divide-y divide-line">
              {items.map((item) => {
                const itemPhotos = photos.filter(
                  (photo) => photo.orderItemId === item.id,
                );
                return (
                  <li key={item.id} className="px-4 py-3.5 md:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold leading-5">
                          {item.label} · {item.variantLabel}
                          {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                        </div>
                        {item.manualDescription ? (
                          <div className="small mt-1 text-ink-2">
                            {item.manualDescription}
                          </div>
                        ) : null}
                        <div className="caption mt-1">{item.formula}</div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {item.heavySoiling ? (
                            <span className="badge badge-warn">грязь</span>
                          ) : null}
                          {item.secondSide ? (
                            <span className="badge badge-muted">две стороны</span>
                          ) : null}
                          {item.unitBasePrice === null ? (
                            <span className="badge badge-warn">по фото</span>
                          ) : null}
                        </div>
                      </div>
                      <div className="tabular whitespace-nowrap text-[14px] font-semibold">
                        {item.lineTotal === null ? "По фото" : formatRub(item.lineTotal)}
                      </div>
                    </div>

                    {itemPhotos.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-2">
                        {itemPhotos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-[12px] border border-line"
                            aria-label={`Фото: ${item.label}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={photo.url}
                              alt={`Фото: ${item.label} ${item.variantLabel}`}
                              width={72}
                              height={72}
                              className="h-[72px] w-[72px] rounded-[11px] object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="caption mt-2">Без фото</p>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-line bg-surface-2/40 px-4 py-3.5 md:px-5">
              <div className="flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
                <span>Работы</span>
                <span className="tabular">{formatRub(order.breakdown.itemsSubtotal)}</span>
              </div>
              {order.breakdown.minimumAdjustment > 0 ? (
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
                  <span>До минимума</span>
                  <span className="tabular">
                    +{formatRub(order.breakdown.minimumAdjustment)}
                  </span>
                </div>
              ) : null}
              {order.breakdown.outOfTownFee > 0 ? (
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
                  <span>Выезд за город</span>
                  <span className="tabular">
                    +{formatRub(order.breakdown.outOfTownFee)}
                  </span>
                </div>
              ) : null}
              {order.breakdown.roundingAdjustment > 0 ? (
                <div className="mt-1 flex items-baseline justify-between gap-3 text-[13px] text-ink-2">
                  <span>Округление</span>
                  <span className="tabular">
                    +{formatRub(order.breakdown.roundingAdjustment)}
                  </span>
                </div>
              ) : null}
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
                <span className="text-[14px] font-semibold">
                  {order.finalPrice !== null ? "Согласовано" : "Предварительно"}
                </span>
                <span className="tabular text-[17px] font-semibold">
                  {order.finalPrice !== null
                    ? formatRub(order.finalPrice)
                    : allManual
                      ? "По фото"
                      : formatRub(order.breakdown.total)}
                </span>
              </div>
            </div>
          </section>

          <section className="card p-4 md:p-5" aria-labelledby="history-title">
            <h2 id="history-title" className="h3">
              История
            </h2>
            <ol className="mt-2 grid gap-2">
              {events.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 text-[13px] last:border-0 last:pb-0"
                >
                  <span>{eventText(event)}</span>
                  <span className="caption">
                    {formatDateTime(event.createdAt)} ·{" "}
                    {ACTOR[event.actor] ?? event.actor}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4">
          <OrderEditor
            key={order.updatedAt.toISOString()}
            order={{
              id: order.id,
              publicNumber: order.publicNumber,
              status: order.status,
              finalPrice: order.finalPrice,
              agreedDate: order.agreedDate,
              agreedTimeFrom: order.agreedTimeFrom,
              agreedTimeTo: order.agreedTimeTo,
              ownerNote: order.ownerNote,
            }}
          />
          <p className="caption mt-3">
            Публичная страница:{" "}
            <Link href={`/z/${order.token}`} className="link" target="_blank">
              /z/{order.token.slice(0, 8)}…
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
