import Link from "next/link";

import { CopyEmail } from "@/components/copy-email";
import { Logo } from "@/components/logo";
import { formatPhone, phoneHref } from "@/lib/phone";

export function SiteFooter({
  name,
  city,
  phone,
  email,
  territory,
}: {
  name: string;
  city: string;
  phone: string;
  email: string;
  territory: string;
}) {
  const phoneText = formatPhone(phone);
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1120px] gap-8 px-5 py-10 md:grid-cols-[1.2fr_1fr_1fr] md:px-8 lg:px-10">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[15px] font-semibold">{name}</span>
          </div>
          <p className="small mt-3 max-w-[36ch] text-ink-2">
            Услуги на выезде. {territory.trim() || `${city} и пригород`}
          </p>
        </div>

        <div>
          <div className="label mb-3 text-ink-2">Связаться</div>
          <div className="flex flex-col gap-2 text-[14px]">
            <a className="link w-fit" href={phoneHref(phone)}>
              {phoneText}
            </a>
            <CopyEmail email={email} />
          </div>
        </div>

        <div>
          <div className="label mb-3 text-ink-2">Документы</div>
          <div className="flex flex-col gap-2 text-[14px]">
            <Link className="link w-fit" href="/privacy">
              Политика конфиденциальности
            </Link>
            <Link className="link w-fit" href="/attribution">
              Сторонние ресурсы
            </Link>
            <Link className="link w-fit" href="/admin">
              Кабинет владельца
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-2 border-t border-line px-5 py-5 md:px-8 lg:px-10">
        <span className="caption">
          © {new Date().getFullYear()} {name}. Цены предварительные, итоговую
          подтверждает мастер.
        </span>
      </div>
    </footer>
  );
}
