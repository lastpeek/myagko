"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  SpinnerIcon,
} from "@/components/icons";
import { CheckoutPhotoTiles } from "@/components/checkout-photo-tiles";
import {
  photosMissingText,
  priceCart,
  resetCart,
  updateCheckout,
  useCart,
  useCartHydrated,
} from "@/lib/cart-store";
import { formatRub } from "@/lib/format";
import { clearPhotos, getPhoto } from "@/lib/photo-store";
import type { PublicRules, PublicTariff } from "@/lib/ui-types";

type FieldErrors = Record<string, string>;

export function CheckoutForm({
  tariffs,
  rules,
  territory,
  maxPhotos,
}: {
  tariffs: PublicTariff[];
  rules: PublicRules;
  territory: string;
  maxPhotos: number;
}) {
  const { items, checkout } = useCart();
  const hydrated = useCartHydrated();
  const router = useRouter();

  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const result = priceCart(items, tariffs, rules, checkout.outOfTown);

  const today = useMemo(() => {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }, []);

  useEffect(() => {
    if (hydrated && items.length === 0 && !busy) {
      router.replace("/cart");
    }
  }, [hydrated, items.length, busy, router]);

  const allManual =
    result.lines.length > 0 &&
    result.manualItemsCount === result.lines.length;
  const totalLabel = allManual ? "По фото" : formatRub(result.total);
  const missingText = photosMissingText(items);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBanner(null);
    const nextErrors: FieldErrors = {};

    if (checkout.name.trim().length < 2) nextErrors.name = "Как к вам обращаться";
    const digits = checkout.phone.replace(/\D/g, "");
    if (digits.length < 10) nextErrors.phone = "Укажите телефон";
    if (checkout.address.trim().length < 5) {
      nextErrors.address = "Укажите улицу, дом и квартиру";
    }
    if (checkout.desiredTimeFrom && !checkout.desiredDate) {
      nextErrors.desiredDate = "Без даты время не принимается";
    }
    if (checkout.desiredTimeFrom && checkout.desiredTimeTo && checkout.desiredTimeFrom >= checkout.desiredTimeTo) {
      nextErrors.desiredTimeTo = "Начало должно быть раньше конца";
    }
    if (!checkout.consent) nextErrors.consent = "Нужно согласие на обработку данных";

    for (const item of items) {
      if (item.category === "other" && item.manualDescription.trim().length < 10) {
        nextErrors.items = "Опишите «Другое» — минимум 10 символов";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setBanner("Проверьте отмеченные поля.");
      return;
    }

    setErrors({});
    setBusy(true);

    try {
      const payload = {
        items: items.map((item) => ({
          tariffId: item.tariffId,
          quantity: item.quantity,
          heavySoiling: item.heavySoiling,
          secondSide: item.secondSide,
          manualDescription:
            item.category === "other" ? item.manualDescription.trim() : undefined,
        })),
        customer: {
          name: checkout.name.trim(),
          phone: checkout.phone.trim(),
          address: checkout.address.trim(),
          outOfTown: checkout.outOfTown,
          desiredDate: checkout.desiredDate || undefined,
          desiredTimeFrom: checkout.desiredTimeFrom || undefined,
          desiredTimeTo: checkout.desiredTimeTo || undefined,
          comment: checkout.comment.trim() || undefined,
        },
        consent: true,
        idempotencyKey: checkout.idempotencyKey,
      };

      const form = new FormData();
      form.append("payload", JSON.stringify(payload));

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        for (const photo of item.photos) {
          const stored = await getPhoto(photo.id);
          if (stored) {
            form.append(`photo:${index}`, stored.blob, `${photo.id}.webp`);
          }
        }
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        body: form,
      });

      const data = (await response.json().catch(() => null)) as
        | { token?: string; error?: string; fields?: FieldErrors }
        | null;

      if (!response.ok || !data?.token) {
        if (response.status === 429) {
          setBanner("Слишком много попыток. Подождите пару минут.");
        } else {
          setBanner(data?.error ?? "Не получилось отправить заявку. Попробуйте ещё раз.");
          if (data?.fields) setErrors(data.fields);
        }
        setBusy(false);
        return;
      }

      resetCart();
      await clearPhotos();
      router.replace(`/z/${data.token}?new=1`);
    } catch {
      setBanner(
        "Связь пропала. Данные сохранены — попробуйте отправить ещё раз.",
      );
      setBusy(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-5 py-8 md:px-8">
        <div className="skeleton h-8 w-48" />
        <div className="mt-6 grid gap-3">
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
          <div className="skeleton h-14 w-full" />
        </div>
      </div>
    );
  }

  const manualHasPhotoIssue = items.some(
    (item) => item.category === "other" && item.photos.length === 0,
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-5 pb-36 pt-2 md:px-8 md:pb-40">
      <Link
        href="/cart"
        className="small inline-flex min-h-11 items-center gap-1 text-ink-2 no-underline hover:text-ink"
      >
        <ChevronLeftIcon className="h-4 w-4" />
        В корзину
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="h1">Оформление</h1>
        <span className="caption">Шаг 2 из 2</span>
      </div>

      {banner ? (
        <div
          role="alert"
          className="mt-4 rounded-[14px] border border-[var(--danger)] bg-surface px-4 py-3 text-[13px] leading-5 text-danger"
        >
          {banner}
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="mt-4 grid gap-3">
        <div>
          <label htmlFor="name" className="label mb-1.5 block text-ink-2">
            Как вас зовут
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            value={checkout.name}
            onChange={(event) => updateCheckout({ name: event.target.value })}
            aria-invalid={errors.name ? "true" : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="input"
            placeholder="Анна"
          />
          {errors.name ? (
            <p id="name-error" className="field-error">
              {errors.name}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="phone" className="label mb-1.5 block text-ink-2">
            Телефон
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={checkout.phone}
            onChange={(event) => updateCheckout({ phone: event.target.value })}
            aria-invalid={errors.phone ? "true" : undefined}
            aria-describedby={errors.phone ? "phone-error" : undefined}
            className="input"
            placeholder="+7 913 000-00-00"
          />
          {errors.phone ? (
            <p id="phone-error" className="field-error">
              {errors.phone}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="address" className="label mb-1.5 block text-ink-2">
            Адрес
          </label>
          <input
            id="address"
            name="address"
            autoComplete="street-address"
            value={checkout.address}
            onChange={(event) => updateCheckout({ address: event.target.value })}
            aria-invalid={errors.address ? "true" : undefined}
            aria-describedby={errors.address ? "address-error" : "address-hint"}
            className="input"
            placeholder="Улица, дом, квартира"
          />
          <p id="address-hint" className="mt-1.5 text-[11.5px] leading-4 text-ink-3">
            <MapPinIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Мастер приедет по этому адресу. {territory}
          </p>
          {errors.address ? (
            <p id="address-error" className="field-error">
              {errors.address}
            </p>
          ) : null}
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[14px] border border-line bg-surface px-4 py-3">
          <input
            type="checkbox"
            checked={checkout.outOfTown}
            onChange={(event) =>
              updateCheckout({ outOfTown: event.target.checked })
            }
            className="h-[18px] w-[18px] flex-none accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-medium">Выезд за город</span>
            <span className="caption block">
              Доплата {formatRub(rules.outOfTownFee)} — если адрес за пределами
              города
            </span>
          </span>
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor="date" className="label mb-1.5 block text-ink-2">
              Дата
            </label>
            <input
              id="date"
              type="date"
              min={today}
              value={checkout.desiredDate}
              onChange={(event) => {
                const value = event.target.value;
                updateCheckout(
                  value
                    ? { desiredDate: value }
                    : {
                        desiredDate: "",
                        desiredTimeFrom: "",
                        desiredTimeTo: "",
                      },
                );
              }}
              aria-invalid={errors.desiredDate ? "true" : undefined}
              className="input"
            />
            {errors.desiredDate ? (
              <p className="field-error">{errors.desiredDate}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="time-from" className="label mb-1.5 block text-ink-2">
              Время с
            </label>
            <input
              id="time-from"
              type="time"
              step={300}
              value={checkout.desiredTimeFrom}
              disabled={!checkout.desiredDate}
              onChange={(event) =>
                updateCheckout({ desiredTimeFrom: event.target.value })
              }
              aria-invalid={errors.desiredTimeFrom ? "true" : undefined}
              className="input disabled:opacity-45"
            />
          </div>
          <div>
            <label htmlFor="time-to" className="label mb-1.5 block text-ink-2">
              Время по
            </label>
            <input
              id="time-to"
              type="time"
              step={300}
              value={checkout.desiredTimeTo}
              disabled={!checkout.desiredDate}
              onChange={(event) =>
                updateCheckout({ desiredTimeTo: event.target.value })
              }
              aria-invalid={errors.desiredTimeTo ? "true" : undefined}
              className="input disabled:opacity-45"
            />
            {errors.desiredTimeTo ? (
              <p className="field-error">{errors.desiredTimeTo}</p>
            ) : null}
          </div>
          <p className="col-span-2 text-[11.5px] leading-4 text-ink-3">
            <ClockIcon className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
            Дата и время необязательны. Время без даты не принимается.
          </p>
        </div>

        <div>
          <label htmlFor="comment" className="label mb-1.5 block text-ink-2">
            Комментарий
          </label>
          <textarea
            id="comment"
            rows={3}
            maxLength={500}
            value={checkout.comment}
            onChange={(event) => updateCheckout({ comment: event.target.value })}
            className="input resize-none"
            placeholder="Код домофона, особенности, пожелания"
          />
        </div>

        <section className="card mt-1 p-4 md:p-5" aria-label="Состав заявки">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="h3">Состав</h2>
            <Link href="/cart" className="link text-[13px]">
              Изменить
            </Link>
          </div>

          <ul className="mt-3 grid gap-4">
            {items.map((item) => {
              const line = result.lines.find((entry) => entry.key === item.uid);
              return (
                <li key={item.uid} className="grid gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold leading-5">
                        {item.label} · {item.variantLabel}
                        {item.quantity > 1 ? ` × ${item.quantity}` : ""}
                      </div>
                      {item.category === "other" ? (
                        <div className="caption mt-1 line-clamp-2">
                          {item.manualDescription || "Описание не заполнено"}
                        </div>
                      ) : null}
                      {item.heavySoiling || item.secondSide ? (
                        <div className="caption mt-0.5">
                          {[
                            item.heavySoiling ? "сильные загрязнения" : "",
                            item.secondSide ? "две стороны" : "",
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </div>
                      ) : null}
                      <div className="caption mt-1">
                        Фото {item.photos.length} / {maxPhotos}
                      </div>
                    </div>
                    <div className="tabular whitespace-nowrap text-[14px] font-semibold">
                      {item.category === "other"
                        ? "По фото"
                        : formatRub(line?.lineTotal ?? null)}
                    </div>
                  </div>

                  <CheckoutPhotoTiles
                    itemUid={item.uid}
                    label={`${item.label} · ${item.variantLabel}`}
                    photos={item.photos}
                    max={maxPhotos}
                  />
                </li>
              );
            })}
          </ul>

          <div className="mt-4 border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3 text-[13.5px] text-ink-2">
              <span>Чистка</span>
              <span className="tabular">{formatRub(result.itemsSubtotal)}</span>
            </div>
            {result.minimumAdjustment > 0 ? (
              <div className="mt-1 flex items-baseline justify-between gap-3 text-[13.5px] text-ink-2">
                <span>До минимума</span>
                <span className="tabular">
                  +{formatRub(result.minimumAdjustment)}
                </span>
              </div>
            ) : null}
            {result.outOfTownFee > 0 ? (
              <div className="mt-1 flex items-baseline justify-between gap-3 text-[13.5px] text-ink-2">
                <span>Выезд за город</span>
                <span className="tabular">+{formatRub(result.outOfTownFee)}</span>
              </div>
            ) : null}
            <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-2">
              <span className="text-[15px] font-semibold">Предварительно</span>
              <span className="tabular text-[18px] font-semibold">
                {totalLabel}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-start gap-2 text-[12px] leading-[18px] text-ink-2">
            <InfoIcon className="mt-0.5 h-3.5 w-3.5 flex-none text-accent" />
            <span>{missingText}</span>
          </div>

          {manualHasPhotoIssue ? (
            <p className="small mt-2 text-warn">
              У «Другого» нет фото — добавьте его в плитке позиции, иначе
              заявка не уйдёт.
            </p>
          ) : null}

          <p className="caption mt-2">
            Всего фото:{" "}
            {items.reduce((sum, item) => sum + item.photos.length, 0)} · до{" "}
            {maxPhotos} на позицию
          </p>
        </section>

        <div>
          <label className="flex cursor-pointer items-start gap-2.5 py-1">
            <input
              type="checkbox"
              checked={checkout.consent}
              onChange={(event) =>
                updateCheckout({ consent: event.target.checked })
              }
              aria-invalid={errors.consent ? "true" : undefined}
              aria-describedby={errors.consent ? "consent-error" : undefined}
              className="mt-0.5 h-[18px] w-[18px] flex-none accent-[var(--accent)]"
            />
            <span className="text-[12px] leading-[18px] text-ink-2">
              Согласен на обработку персональных данных и с{" "}
              <Link href="/privacy" className="link">
                политикой конфиденциальности
              </Link>
            </span>
          </label>
          {errors.consent ? (
            <p id="consent-error" className="field-error">
              {errors.consent}
            </p>
          ) : null}
        </div>

        {errors.items ? (
          <p className="small text-warn" role="alert">
            {errors.items}
          </p>
        ) : null}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper">
          <div className="mx-auto w-full max-w-[720px] px-5 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:flex md:items-center md:gap-4 md:px-8">
            <div className="flex items-baseline justify-between gap-3 md:block md:flex-1">
              <div className="text-[12.5px] leading-4 text-ink-2">
                Предварительно
              </div>
              <div className="tabular text-[21px] font-semibold leading-7 tracking-[-0.02em]">
                {totalLabel}
              </div>
            </div>
            <button
              type="submit"
              disabled={busy || manualHasPhotoIssue}
              aria-busy={busy}
              className="btn btn-primary mt-2.5 w-full md:mt-0 md:w-auto md:px-6"
            >
              {busy ? (
                <>
                  <SpinnerIcon className="h-4 w-4" />
                  Отправляем…
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4" />
                  Отправить заявку
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
