import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/admin-nav";
import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { LogoutButton } from "@/components/admin/logout-button";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { getAdminUser } from "@/lib/auth";
import { getCompany } from "@/lib/company";

export const metadata: Metadata = {
  title: "Кабинет",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, company] = await Promise.all([getAdminUser(), getCompany()]);

  if (!user) redirect("/admin/login");

  if (user.mustChangePassword) {
    return (
      <div className="min-h-dvh bg-paper">
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex h-[52px] w-full max-w-[1120px] items-center gap-2.5 px-5">
            <Logo />
            <span className="text-[14px] font-semibold">{company.name} · кабинет</span>
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[520px] px-5 py-10">
          <div className="card p-6">
            <div className="kicker">Первый вход</div>
            <h1 className="h1 mt-2">Смените пароль</h1>
            <p className="small mt-2 text-ink-2">
              Пароль выдан при передаче доступа. Придумайте свой — минимум 10
              символов. Пока пароль не сменён, остальные разделы закрыты.
            </p>
            <div className="mt-5">
              <ChangePasswordForm gate />
            </div>
          </div>
          <p className="caption mt-3">Вход: {user.email}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-paper">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-[52px] w-full max-w-[1120px] items-center gap-2.5 px-5">
          <Logo />
          <span className="text-[14px] font-semibold">{company.name} · кабинет</span>
          <span className="caption ml-2 hidden sm:block">{user.email}</span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1120px] flex-col md:flex-row md:items-stretch">
        <AdminNav />
        <main className="min-w-0 flex-1 px-5 py-5 md:px-6 md:py-6">{children}</main>
      </div>
    </div>
  );
}
