"use client";

import Link from "next/link";

import { EmptyCartIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { useCart, useCartHydrated } from "@/lib/cart-store";

export function SiteHeader({
  name,
  city,
  showCart = true,
}: {
  name: string;
  city: string;
  showCart?: boolean;
}) {
  const { items } = useCart();
  const hydrated = useCartHydrated();
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <header className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-5 pb-5 pt-6 md:px-8 md:pt-8 lg:px-10">
      <Link
        href="/"
        className="flex items-center gap-2.5 rounded-[10px] text-ink no-underline"
        aria-label={`${name} — на главную`}
      >
        <Logo />
        <span className="text-[15px] font-semibold tracking-[-0.01em]">{name}</span>
      </Link>
      <span className="caption ml-1 hidden sm:block">{city}</span>

      <div className="ml-auto flex items-center gap-2">
        {showCart ? (
          <Link
            href="/cart"
            className="relative grid h-11 w-11 place-items-center rounded-[12px] border border-line bg-surface text-ink transition-colors duration-[180ms] hover:border-line-strong"
            aria-label={count > 0 ? `Корзина, позиций: ${count}` : "Корзина"}
          >
            <EmptyCartIcon className="h-5 w-5" />
            {hydrated && count > 0 ? (
              <span className="tabular absolute -right-1 -top-1 grid h-[20px] min-w-[20px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-[var(--accent-contrast)]">
                {count}
              </span>
            ) : null}
          </Link>
        ) : null}
        <ThemeToggle />
      </div>
    </header>
  );
}
