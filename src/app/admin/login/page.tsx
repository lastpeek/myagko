import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/admin/login-form";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAdminUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";

export const metadata: Metadata = {
  title: "Вход в кабинет",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  const [user, company] = await Promise.all([getAdminUser(), getCompany()]);
  if (user) redirect("/admin");

  return (
    <div className="min-h-dvh bg-paper">
      <header className="mx-auto flex w-full max-w-[520px] items-center gap-2.5 px-5 py-6">
        <Logo />
        <span className="text-[15px] font-semibold">{company.name}</span>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[520px] px-5 pb-12">
        <div className="card p-6 md:p-7">
          <div className="kicker">Кабинет владельца</div>
          <h1 className="h1 mt-2">Вход</h1>
          <p className="small mt-2 text-ink-2">
            Заявки, цены и настройки компании видны только владельцу.
          </p>
          <div className="mt-5">
            <LoginForm />
          </div>
        </div>

        <p className="caption mt-4">
          Забыли пароль — попросите сбросить его через командную строку проекта.
          Восстановления по почте нет.
        </p>

        <Link href="/" className="link mt-5 block w-fit text-[13px]">
          Вернуться на сайт
        </Link>
      </main>
    </div>
  );
}
