"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // В логи не попадают данные клиента — только факт ошибки.
    console.error("page_error", error.name);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center px-5 py-12">
      <div className="card p-6">
        <div className="kicker">Ошибка</div>
        <h1 className="h1 mt-2">Что-то пошло не так</h1>
        <p className="body mt-2 text-ink-2">
          Страница не открылась. Попробуйте ещё раз — черновик заказа остался в
          браузере.
        </p>
        <button type="button" onClick={reset} className="btn btn-primary mt-5 w-auto px-6">
          Попробовать снова
        </button>
      </div>
    </main>
  );
}
