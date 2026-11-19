import { SofaIcon } from "@/components/icons";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] bg-accent text-[var(--accent-contrast)] ${className}`}
    >
      <SofaIcon className="h-4 w-4" />
    </span>
  );
}
