"use client";

import { useState } from "react";

import { CheckIcon, CopyIcon } from "@/components/icons";

export function CopyEmail({
  email,
  variant = "link",
}: {
  email: string;
  variant?: "link" | "button";
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    setFailed(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(email);
      } else {
        const area = document.createElement("textarea");
        area.value = email;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) throw new Error("copy");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  const linkClass =
    variant === "button"
      ? "btn btn-ghost w-auto max-w-full px-5"
      : "link w-fit break-all";

  return (
    <span className="flex max-w-full flex-wrap items-center gap-2">
      <a href={`mailto:${email}`} className={linkClass}>
        {email}
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Скопировать почту"
        title="Скопировать почту"
        className="inline-flex min-h-8 flex-none items-center gap-1 rounded-[8px] border border-line px-2 text-[11.5px] font-medium text-ink-2 transition-colors duration-[180ms] hover:border-line-strong hover:text-ink"
      >
        {copied ? (
          <CheckIcon className="h-3.5 w-3.5" />
        ) : (
          <CopyIcon className="h-3.5 w-3.5" />
        )}
        {copied ? "Скопировано" : failed ? "Не вышло" : "Скопировать"}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? "Почта скопирована" : failed ? "Не удалось скопировать почту" : ""}
      </span>
    </span>
  );
}
