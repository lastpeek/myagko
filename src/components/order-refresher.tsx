"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { RefreshIcon } from "@/components/icons";
import { formatClock } from "@/lib/time";

/**
 * Приватная ссылка обновляется сама: опрос раз в 20 секунд только
 * при видимой вкладке, с паузой в фоне и затуханием при ошибках.
 */
export function OrderRefresher({
  token,
  updatedAt,
}: {
  token: string;
  updatedAt: string;
}) {
  const router = useRouter();
  const lastUpdated = useRef(updatedAt);
  const failures = useRef(0);
  const timer = useRef<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    lastUpdated.current = updatedAt;
  }, [updatedAt]);

  const check = useCallback(
    async (manual = false) => {
      if (manual) setRefreshing(true);
      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("bad status");
        const data = (await response.json()) as { updatedAt?: string };
        failures.current = 0;
        setCheckedAt(formatClock(new Date()));
        if (data.updatedAt && data.updatedAt !== lastUpdated.current) {
          lastUpdated.current = data.updatedAt;
          router.refresh();
        }
      } catch {
        failures.current = Math.min(failures.current + 1, 4);
      } finally {
        if (manual) setRefreshing(false);
      }
    },
    [router, token],
  );

  useEffect(() => {
    function clear() {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
    }

    function schedule() {
      clear();
      if (document.visibilityState !== "visible") return;
      const delay = Math.min(20_000 * 2 ** failures.current, 90_000);
      timer.current = window.setTimeout(async () => {
        await check();
        schedule();
      }, delay);
    }

    function onVisibility() {
      if (document.visibilityState === "visible") {
        void check();
      }
      schedule();
    }

    const initial = window.setTimeout(() => {
      void check();
    }, 0);
    schedule();

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initial);
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [check]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void check(true)}
        aria-busy={refreshing}
        className="btn btn-ghost min-h-11 w-auto px-3.5 text-[12.5px]"
      >
        <RefreshIcon className="h-3.5 w-3.5" />
        Обновить
      </button>
      <span className="caption" aria-live="polite">
        {checkedAt ? `Обновлено в ${checkedAt}` : "Проверяем изменения…"}
      </span>
    </div>
  );
}
