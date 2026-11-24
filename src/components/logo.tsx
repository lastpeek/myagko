import { SofaIcon } from "@/components/icons";

export function Logo({
  src = null,
  alt = "",
  size = 30,
  radius = 9,
  className = "",
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  radius?: number;
  className?: string;
}) {
  return (
    <span
      className={`grid flex-none place-items-center overflow-hidden ${
        src ? "bg-white" : "bg-accent text-[var(--accent-contrast)]"
      } ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          data-brand-logo
        />
      ) : (
        <SofaIcon
          style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55) }}
        />
      )}
    </span>
  );
}
