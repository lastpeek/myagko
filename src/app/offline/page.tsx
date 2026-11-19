import type { Metadata } from "next";
import Link from "next/link";

import { companyConfig } from "@/config/company";
import { Logo } from "@/components/logo";
import { RetryButton } from "@/components/retry-button";

export const metadata: Metadata = {
  title: "Нет сети",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-5 py-12">
      <div className="flex items-center gap-2.5">
        <Logo />
        <span className="text-[15px] font-semibold">{companyConfig.name}</span>
      </div>

      <div className="card mt-8 p-6">
        <div className="kicker">Офлайн</div>
        <h1 className="h1 mt-2">Нет соединения</h1>
        <p className="body mt-2 text-ink-2">
          Страница не загрузилась: пропала сеть. Проверьте интернет и попробуйте
          снова — черновик заказа сохранён в браузере.
        </p>
        <RetryButton />
      </div>

      <p className="caption mt-4">
        Заявки и фото не теряются: они остаются в этом браузере до отправки.
      </p>

      <Link href="/privacy" className="link mt-6 w-fit text-[13px]">
        Политика конфиденциальности
      </Link>
    </main>
  );
}
