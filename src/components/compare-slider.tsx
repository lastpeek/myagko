"use client";

import { useRef, useState } from "react";

import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

/**
 * Сравнение «до / после» с перетаскиваемым разделителем.
 * Позиция по умолчанию — 50%, без анимаций, чтобы фото не «прыгало».
 */
export function CompareSlider({
  beforeSrc,
  afterSrc,
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
}) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function update(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.min(100, Math.max(0, next)));
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event.clientX);
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!dragging.current) return;
    event.stopPropagation();
    update(event.clientX);
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    dragging.current = false;
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    let next: number | null = null;
    if (event.key === "ArrowLeft") next = position - 2;
    if (event.key === "ArrowRight") next = position + 2;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 100;

    if (next === null) return;
    event.preventDefault();
    setPosition(Math.min(100, Math.max(0, next)));
  }

  const rounded = Math.round(position);

  return (
    <div
      ref={containerRef}
      data-compare
      className={`overflow-hidden bg-surface-2 select-none ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div
        className="absolute inset-0"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeSrc}
          alt=""
          draggable={false}
          className="h-full w-full object-cover"
        />
      </div>

      <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-[rgba(25,23,20,0.55)] px-2 py-1 text-[11px] font-medium leading-none text-white">
        До
      </span>
      <span className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-[rgba(25,23,20,0.55)] px-2 py-1 text-[11px] font-medium leading-none text-white">
        После
      </span>

      <span
        className="pointer-events-none absolute top-0 z-20 h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(25,23,20,0.18)]"
        style={{ left: `${position}%` }}
      />

      <button
        type="button"
        role="slider"
        aria-label="Сравнение до и после чистки"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={rounded}
        aria-valuetext={`${rounded}%`}
        aria-orientation="horizontal"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        className="pointer-events-auto absolute top-1/2 z-30 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize touch-none items-center justify-center rounded-full border border-line bg-surface p-0 text-ink shadow-[var(--shadow)]"
        style={{ left: `clamp(1.25rem, ${position}%, calc(100% - 1.25rem))` }}
      >
        <ChevronLeftIcon className="h-4 w-4" />
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
