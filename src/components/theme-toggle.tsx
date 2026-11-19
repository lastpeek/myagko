"use client";

import { MoonIcon, SunIcon } from "@/components/icons";

export function ThemeToggle({ className = "" }: { className?: string }) {
  function currentTheme(): "light" | "dark" {
    const stored = document.documentElement.getAttribute("data-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("myagko-theme", next);
    } catch {
      // приватный режим — тема просто не запомнится
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Сменить тему"
      title="Сменить тему"
      className={`grid h-11 w-11 place-items-center rounded-[12px] border border-line bg-surface text-ink-2 transition-colors duration-[180ms] hover:border-line-strong hover:text-ink ${className}`}
    >
      <MoonIcon className="theme-icon-moon h-5 w-5" />
      <SunIcon className="theme-icon-sun h-5 w-5" />
    </button>
  );
}
