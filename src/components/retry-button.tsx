"use client";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="btn btn-primary mt-5 w-auto px-6"
    >
      Попробовать снова
    </button>
  );
}
