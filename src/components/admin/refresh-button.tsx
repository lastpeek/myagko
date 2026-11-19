"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { RefreshIcon } from "@/components/icons";

export function RefreshButton({ label = "Обновить" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function refresh() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
      window.setTimeout(() => setSpinning(false), 600);
    });
  }

  return (
    <button
      type="button"
      onClick={refresh}
      aria-busy={pending}
      className="btn-small"
    >
      <RefreshIcon className={`h-3.5 w-3.5 ${spinning ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
}
