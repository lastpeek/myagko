import type { Metadata } from "next";

import { ChangePasswordForm } from "@/components/admin/change-password-form";
import { LogoutButton } from "@/components/admin/logout-button";
import { getAdminUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Доступ",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const user = await getAdminUser();

  return (
    <div>
      <h1 className="h2">Доступ</h1>
      <p className="small mt-1.5 max-w-[60ch] text-ink-2">
        Вход по почте и паролю. Восстановления по почте нет — пароль сбрасывается
        командой на сервере.
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <section className="card p-4 md:p-5">
          <h2 className="h3">Смена пароля</h2>
          <p className="caption mt-1">
            После смены все другие устройства выйдут из кабинета.
          </p>
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </section>

        <section className="card h-fit p-4 md:p-5">
          <h2 className="h3">Сессия</h2>
          <p className="small mt-2 text-ink-2">
            Вы вошли как <span className="font-semibold">{user?.email}</span>.
            Сессия живёт в httpOnly cookie и не доступна скриптам страницы.
          </p>
          <div className="mt-4">
            <LogoutButton />
          </div>
        </section>
      </div>
    </div>
  );
}
