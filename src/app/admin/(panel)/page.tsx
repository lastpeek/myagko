import type { Metadata } from "next";
import Link from "next/link";
import { sql } from "drizzle-orm";

import { RefreshButton } from "@/components/admin/refresh-button";
import { StatusBadge } from "@/components/admin/status-badge";
import { ChevronRightIcon, SearchIcon } from "@/components/icons";
import { listOrders, parseStatus } from "@/lib/admin-orders";
import { getDb } from "@/lib/db";
import { orders, type OrderStatus } from "@/lib/db/schema";
import { formatDate, formatRub, formatTimeRange } from "@/lib/format";
import { formatPhone } from "@/lib/phone";

export const metadata: Metadata = {
  title: "Заявки",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const TABS: { key: OrderStatus | "all"; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "new", label: "Новые" },
  { key: "agreed", label: "Согласованы" },
  { key: "done", label: "Завершены" },
  { key: "cancelled", label: "Отменены" },
];

function summaryOf(lines: Array<{ label: string; quantity: number }>): string {
  if (lines.length === 0) return "—";
  return lines
    .slice(0, 3)
    .map((line) => `${line.label}${line.quantity > 1 ? ` × ${line.quantity}` : ""}`)
    .join(", ")
    .concat(lines.length > 3 ? ` +${lines.length - 3}` : "");
}

/** Доплаты берём из снимка заявки, а не из текущего прайса. */
function extrasOf(row: {
  breakdown: { lines: Array<{ heavySoiling: boolean; secondSide: boolean }> };
  outOfTown: boolean;
}): string {
  const flags: string[] = [];
  if (row.breakdown.lines.some((line) => line.heavySoiling)) flags.push("грязь");
  if (row.breakdown.lines.some((line) => line.secondSide)) {
    flags.push("вторая сторона");
  }
  if (row.outOfTown) flags.push("выезд за город");
  return flags.length > 0 ? flags.join(" · ") : "без доплат";
}

function photosAndExtras(row: {
  photosCount: number;
  manualCount: number;
  breakdown: { lines: Array<{ heavySoiling: boolean; secondSide: boolean }> };
  outOfTown: boolean;
}): string {
  const manual =
    row.manualCount > 0 ? `по фото ${row.manualCount} · ` : "";
  return `фото ${row.photosCount} · ${manual}${extrasOf(row)}`;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const status = parseStatus(params.status);

  const db = getDb();

  const [rows, countsRows] = await Promise.all([
    listOrders(db, { query, status }),
    db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .groupBy(orders.status),
  ]);

  const counts = new Map<OrderStatus, number>(
    countsRows.map((row) => [row.status, row.count]),
  );
  const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);

  function tabHref(key: OrderStatus | "all"): string {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (key !== "all") search.set("status", key);
    const suffix = search.toString();
    return suffix ? `/admin?${suffix}` : "/admin";
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h2">Заявки</h1>
        <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <form
            action="/admin"
            method="get"
            className="flex w-full items-center gap-2 sm:w-auto"
          >
            {status !== "all" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <label htmlFor="q" className="sr-only">
              Поиск по имени, телефону или адресу
            </label>
            <div className="relative min-w-0 flex-1 sm:w-[260px] sm:flex-none">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              <input
                id="q"
                name="q"
                defaultValue={query}
                placeholder="Имя, телефон, адрес"
                className="input h-10 w-full py-0 pl-9 text-[13px]"
              />
            </div>
            <button type="submit" className="btn-small flex-none">
              Искать
            </button>
          </form>
          <RefreshButton />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 border-b border-line">
        {TABS.map((tab) => {
          const active = status === tab.key;
          const count = tab.key === "all" ? total : (counts.get(tab.key) ?? 0);
          return (
            <Link
              key={tab.key}
              href={tabHref(tab.key)}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 pb-3 text-[13px] no-underline ${
                active
                  ? "border-accent font-semibold text-ink"
                  : "border-transparent text-ink-2 hover:text-ink"
              }`}
            >
              {tab.label} · {count}
            </Link>
          );
        })}
      </div>

      {query ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="small text-ink-2">Поиск: «{query}»</span>
          <Link href={status === "all" ? "/admin" : `/admin?status=${status}`} className="link text-[12.5px]">
            Сбросить
          </Link>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="card mt-4 flex flex-col items-center px-6 py-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-3">
            <SearchIcon className="h-6 w-6" />
          </span>
          <h2 className="h3 mt-4">
            {query || status !== "all" ? "Ничего не нашлось" : "Заявок пока нет"}
          </h2>
          <p className="small mt-1.5 max-w-[38ch] text-ink-2">
            {query || status !== "all"
              ? "Измените запрос или выберите другой статус."
              : "Как только клиент отправит заявку, она появится здесь."}
          </p>
          {query || status !== "all" ? (
            <Link href="/admin" className="btn btn-secondary mt-5 w-auto px-5">
              Показать все
            </Link>
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-4 hidden overflow-hidden rounded-[14px] border border-line bg-surface md:block">
            <table className="w-full border-collapse text-[13px]">
              <caption className="sr-only">Список заявок</caption>
              <thead>
                <tr>
                  {["Клиент", "Состав", "Когда", "Сумма", "Статус", ""].map(
                    (heading) => (
                      <th
                        key={heading}
                        scope="col"
                        className="border-b border-line px-3 py-3 text-left text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink-3"
                      >
                        {heading}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const when = row.agreedDate
                    ? `${formatDate(row.agreedDate)}, ${formatTimeRange(row.agreedTimeFrom, row.agreedTimeTo)}`
                    : row.desiredDate
                      ? `${formatDate(row.desiredDate)}${row.desiredTimeFrom ? `, ${formatTimeRange(row.desiredTimeFrom, row.desiredTimeTo)}` : ""}`
                      : "уточняется";
                  const allManual =
                    row.itemsCount > 0 && row.manualCount === row.itemsCount;
                  const price =
                    row.finalPrice ??
                    (allManual ? null : row.estimatedTotal);

                  return (
                    <tr key={row.id} className="group">
                      <td className="border-b border-line px-3 py-3.5 align-middle">
                        <Link
                          href={`/admin/orders/${row.id}`}
                          className="font-semibold text-ink no-underline"
                        >
                          {row.name}
                        </Link>
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {formatPhone(row.phone)}
                        </div>
                        <div className="text-[11.5px] text-ink-3">
                          №{row.publicNumber}
                        </div>
                      </td>
                      <td className="border-b border-line px-3 py-3.5 align-middle">
                        <div className="font-medium">
                          {summaryOf(row.breakdown.lines)}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {photosAndExtras(row)}
                        </div>
                      </td>
                      <td className="border-b border-line px-3 py-3.5 align-middle">
                        <div className="font-medium">{when}</div>
                        <div className="mt-0.5 text-[11.5px] text-ink-3">
                          {formatDate(row.createdAt.toISOString().slice(0, 10))}
                        </div>
                      </td>
                      <td className="tabular border-b border-line px-3 py-3.5 text-right align-middle font-semibold">
                        {price === null ? "По фото" : formatRub(price)}
                      </td>
                      <td className="border-b border-line px-3 py-3.5 align-middle">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="border-b border-line px-2 py-3.5 align-middle">
                        <Link
                          href={`/admin/orders/${row.id}`}
                          aria-label={`Открыть заявку №${row.publicNumber}`}
                          className="grid h-9 w-9 place-items-center rounded-[10px] text-ink-3 hover:bg-surface-2 hover:text-ink"
                        >
                          <ChevronRightIcon className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2.5 md:hidden">
            {rows.map((row) => {
              const allManual =
                row.itemsCount > 0 && row.manualCount === row.itemsCount;
              const price =
                row.finalPrice ?? (allManual ? null : row.estimatedTotal);
              const when = row.agreedDate
                ? `${formatDate(row.agreedDate)}, ${formatTimeRange(row.agreedTimeFrom, row.agreedTimeTo)}`
                : row.desiredDate
                  ? `${formatDate(row.desiredDate)}${row.desiredTimeFrom ? `, ${formatTimeRange(row.desiredTimeFrom, row.desiredTimeTo)}` : ""}`
                  : "уточняется";

              return (
                <Link
                  key={row.id}
                  href={`/admin/orders/${row.id}`}
                  className="card block p-4 no-underline"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold">
                        {row.name}
                        <span className="ml-2 text-[12px] font-normal text-ink-3">
                          №{row.publicNumber}
                        </span>
                      </div>
                      <div className="caption mt-0.5">{formatPhone(row.phone)}</div>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="mt-2 text-[13.5px]">
                    {summaryOf(row.breakdown.lines)}
                  </div>
                  <div className="caption mt-1">{photosAndExtras(row)}</div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <span className="caption">{when}</span>
                    <span className="tabular text-[15px] font-semibold">
                      {price === null ? "По фото" : formatRub(price)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
