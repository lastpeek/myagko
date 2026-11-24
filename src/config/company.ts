/**
 * Конфиг компании — только значения для первого сида.
 * Источник правды после установки: таблица `company` (правится в кабинете).
 */

export const companyConfig = {
  name: "Мягко",
  city: "Новосибирск",
  phone: "+7 913 000-00-00",
  email: "hello@myagko.ru",
  territory:
    "Новосибирск и пригород. Выезд за город — 500 ₽, добираемся своим транспортом.",
  accentColor: "#155C4C",
  heroTitle: "Что почистим?",
  heroSubtitle:
    "Предварительная цена — сразу. Точную мастер подтвердит после фото.",
  browserTitle: "",
  logoKey: null,
  otherRequiresPhoto: true,
} as const;

export type CompanyConfig = typeof companyConfig;
