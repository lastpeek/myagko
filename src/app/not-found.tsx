import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { getCompany } from "@/lib/company";

export default async function NotFound() {
  const company = await getCompany();

  return (
    <>
      <SiteHeader name={company.name} city={company.city} showCart={false} />
      <main className="mx-auto w-full max-w-[560px] px-5 py-12 md:px-8">
        <div className="card p-6 md:p-8">
          <div className="kicker">404</div>
          <h1 className="h1 mt-2">Страница не найдена</h1>
          <p className="body mt-2 text-ink-2">
            Ссылка устарела или в адресе опечатка. Заявка по чужой ссылке не
            открывается — это нормально.
          </p>
          <Link href="/" className="btn btn-primary mt-5 w-auto px-6">
            На главную
          </Link>
        </div>
      </main>
    </>
  );
}
