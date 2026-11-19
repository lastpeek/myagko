"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Заявки" },
  { href: "/admin/tariffs", label: "Тарифы" },
  { href: "/admin/company", label: "Компания" },
  { href: "/admin/access", label: "Доступ" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Разделы кабинета"
      className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 md:block md:w-[216px] md:flex-none md:border-b-0 md:border-r md:px-3 md:py-4"
    >
      {LINKS.map((link) => {
        const active =
          link.href === "/admin"
            ? pathname === "/admin" || pathname.startsWith("/admin/orders")
            : pathname.startsWith(link.href);

        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-[10px] px-3 py-2.5 text-[13.5px] no-underline transition-colors duration-[160ms] ${
              active
                ? "bg-surface-2 font-semibold text-ink"
                : "text-ink-2 hover:bg-surface-2/60 hover:text-ink"
            }`}
          >
            <span
              className={`h-[5px] w-[5px] flex-none rounded-full ${
                active ? "bg-accent" : "bg-ink-3"
              }`}
            />
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
