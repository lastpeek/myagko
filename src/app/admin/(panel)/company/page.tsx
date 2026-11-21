import type { Metadata } from "next";

import { CompanyForm } from "@/components/admin/company-form";
import { TelegramSettings } from "@/components/admin/telegram-settings";
import { getCompany } from "@/lib/company";
import { getDb } from "@/lib/db";
import {
  getBotUsername,
  getTelegramLink,
  isTelegramConfigured,
} from "@/lib/telegram";

export const metadata: Metadata = {
  title: "Компания",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminCompanyPage() {
  const [company, telegram] = await Promise.all([
    getCompany(),
    getTelegramLink(getDb()),
  ]);

  return (
    <div>
      <h1 className="h2">Компания</h1>
      <p className="small mt-1.5 max-w-[60ch] text-ink-2">
        Название, контакты и акцент. Эти данные видит клиент на сайте и в заявке.
      </p>
      <div className="mt-4 grid gap-3">
        <CompanyForm company={company} />
        <TelegramSettings
          initial={{
            configured: isTelegramConfigured(),
            botUsername: getBotUsername(),
            connected: Boolean(telegram.chatId),
            chatId: telegram.chatId,
            username: telegram.username,
          }}
        />
      </div>
    </div>
  );
}
