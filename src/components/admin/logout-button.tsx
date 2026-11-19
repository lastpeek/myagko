"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SpinnerIcon } from "@/components/icons";

export function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={busy}
      aria-busy={busy}
      className={`btn btn-ghost h-10 min-h-10 w-auto px-4 text-[13px] ${className}`}
    >
      {busy ? <SpinnerIcon className="h-3.5 w-3.5" /> : null}
      Выйти
    </button>
  );
}
