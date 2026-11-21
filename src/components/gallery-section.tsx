"use client";

import { useEffect, useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "@/components/icons";
import { CompareSlider } from "@/components/compare-slider";

export type GalleryPublicItem = {
  id: string;
  src: string;
  beforeSrc: string | null;
  caption: string;
  alt: string;
};

export function GallerySection({ items }: { items: GalleryPublicItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const swiped = useRef(false);

  const isOpen = openIndex !== null;
  const current = openIndex !== null ? items[openIndex] : null;

  function step(delta: number) {
    setOpenIndex((index) => {
      if (index === null || items.length === 0) return index;
      return (index + delta + items.length) % items.length;
    });
  }

  useEffect(() => {
    if (!isOpen) return;

    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpenIndex(null);
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setOpenIndex((index) =>
          index === null
            ? index
            : (index - 1 + items.length) % items.length,
        );
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setOpenIndex((index) =>
          index === null ? index : (index + 1) % items.length,
        );
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [isOpen, items.length]);

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    swiped.current = false;
  }

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;

    const end = event.changedTouches[0]?.clientX ?? start;
    const delta = end - start;
    if (Math.abs(delta) > 40) {
      swiped.current = true;
      step(delta < 0 ? 1 : -1);
    }
  }

  function onBackdropClick() {
    if (swiped.current) {
      swiped.current = false;
      return;
    }
    setOpenIndex(null);
  }

  return (
    <section
      className="mx-auto mt-14 w-full max-w-[1120px] px-5 md:mt-20 md:px-8 lg:px-10"
      aria-labelledby="gallery-title"
    >
      <div className="kicker">Наши работы</div>
      <h2 id="gallery-title" className="h2 mt-2">
        Мебель после чистки
      </h2>

      <div
        data-gallery-grid
        className="mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-3"
      >
        {items.map((item, index) => (
          <figure key={item.id} className="min-w-0">
            <div className="relative aspect-square w-full overflow-hidden rounded-[20px] border border-line bg-surface-2">
              {item.beforeSrc ? (
                <>
                  <CompareSlider
                    beforeSrc={item.beforeSrc}
                    afterSrc={item.src}
                    className="pointer-events-none absolute inset-0 z-20"
                  />
                  <button
                    type="button"
                    onClick={() => setOpenIndex(index)}
                    aria-label={`Открыть фото: ${item.alt}`}
                    className="absolute inset-0 z-10 rounded-[20px]"
                  />
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenIndex(index)}
                  aria-label={`Открыть фото: ${item.alt}`}
                  className="block h-full w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              )}
            </div>
            {item.caption ? (
              <figcaption className="mt-2 text-[12.5px] leading-4 text-ink-2">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>

      {current ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр работ"
          className="fixed inset-0 z-[60] bg-[#141311] text-[#f4f1ec]"
          onClick={onBackdropClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            touchStartX.current = null;
          }}
        >
          <button
            ref={closeRef}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setOpenIndex(null);
            }}
            aria-label="Закрыть"
            className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full border border-[#3d3830] bg-[#1c1a17] text-[#f4f1ec] md:right-5 md:top-5"
          >
            <CloseIcon className="h-5 w-5" />
          </button>

          {items.length > 1 ? (
            <button
              type="button"
              aria-label="Предыдущее фото"
              onClick={(event) => {
                event.stopPropagation();
                step(-1);
              }}
              className="absolute left-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#3d3830] bg-[#1c1a17] text-[#f4f1ec] md:left-5"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
          ) : null}

          <div className="flex h-dvh items-center justify-center px-4 md:px-20">
            <figure
              className="w-full max-w-full"
              onClick={(event) => event.stopPropagation()}
            >
              {current.beforeSrc ? (
                <div
                  className="mx-auto aspect-square overflow-hidden rounded-[16px] bg-surface-2"
                  style={{ width: "min(72dvh, 100%)" }}
                >
                  <CompareSlider
                    beforeSrc={current.beforeSrc}
                    afterSrc={current.src}
                    className="relative h-full w-full"
                  />
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.src}
                  alt={current.alt}
                  className="mx-auto max-h-[72dvh] w-auto max-w-full rounded-[16px] object-contain"
                />
              )}
              {current.caption ? (
                <figcaption className="mx-auto mt-3 max-w-[60ch] text-center text-[13px] leading-5 text-[#d8d2c8]">
                  {current.caption}
                </figcaption>
              ) : null}
              <p
                className="tabular mt-1 text-center text-[11.5px] leading-4 text-[#a8a199]"
                aria-live="polite"
              >
                {(openIndex ?? 0) + 1} / {items.length}
              </p>
            </figure>
          </div>

          {items.length > 1 ? (
            <button
              type="button"
              aria-label="Следующее фото"
              onClick={(event) => {
                event.stopPropagation();
                step(1);
              }}
              className="absolute right-2 top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-[#3d3830] bg-[#1c1a17] text-[#f4f1ec] md:right-5"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
