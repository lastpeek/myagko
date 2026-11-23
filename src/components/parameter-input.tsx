"use client";

import { useState } from "react";

import { formatDecimal } from "@/lib/format";

function align(value: number, min: number, max: number, step: number): number {
  if (!Number.isFinite(value)) return min;
  const safeStep = step > 0 ? step : 1;
  const steps = Math.round((value - min) / safeStep);
  const aligned = min + steps * safeStep;
  const clamped = Math.min(max, Math.max(min, aligned));
  return Math.round(clamped * 100) / 100;
}

export function ParameterInput({
  id,
  label,
  unit,
  value,
  min,
  max,
  step,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));

  function commit(next: number) {
    const normalized = align(next, min, max, step);
    onChange(normalized);
    setText(String(normalized));
  }

  return (
    <div>
      <label htmlFor={id} className="label mb-1.5 block text-ink-2">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={text}
          disabled={disabled}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = Number(event.target.value.replace(",", "."));
            if (event.target.value !== "" && Number.isFinite(parsed)) {
              onChange(parsed);
            }
          }}
          onBlur={() => {
            const parsed = Number(text.replace(",", "."));
            commit(Number.isFinite(parsed) ? parsed : value);
          }}
          className="input h-11 tabular"
        />
        {unit ? (
          <span className="flex min-w-12 items-center justify-center rounded-[14px] border border-line bg-surface-2 px-3 text-[13px] text-ink-2">
            {unit}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[11.5px] leading-4 text-ink-3">
        От {formatDecimal(min)} до {formatDecimal(max)}, шаг{" "}
        {formatDecimal(step)} {unit}
      </p>
    </div>
  );
}
