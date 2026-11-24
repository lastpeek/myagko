export const LOGO_ICON_SIZES = [180, 192, 512] as const;

export type LogoIconSize = (typeof LOGO_ICON_SIZES)[number];

export function isLogoIconSize(value: string): value is `${LogoIconSize}` {
  return LOGO_ICON_SIZES.some((size) => String(size) === value);
}

export function logoIconKey(logoKey: string, size: LogoIconSize): string {
  const base = logoKey.replace(/\.webp$/, "");
  return `${base}.${size}.png`;
}

export function logoUrl(
  logoKey: string | null | undefined,
  size?: LogoIconSize,
): string | null {
  if (!logoKey) return null;
  const path = size ? `/api/logo/${size}` : "/api/logo";
  return `${path}?v=${encodeURIComponent(logoKey.slice(0, 8))}`;
}
