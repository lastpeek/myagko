import { randomUUID } from "node:crypto";

import sharp from "sharp";

import {
  LOGO_ICON_SIZES,
  logoIconKey,
  type LogoIconSize,
} from "@/lib/logo-assets";
import { getStorage, type PhotoStorage } from "@/lib/storage";

export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_SIZE = 512;

export type LogoProblem = "too_large" | "svg" | "unsupported" | "broken";

export type PreparedLogo = {
  main: Buffer;
  icons: Array<{ size: LogoIconSize; data: Buffer }>;
};

export type StoredLogo = {
  logoKey: string;
  iconKeys: Record<LogoIconSize, string>;
};

function looksLikeSvg(input: Buffer): boolean {
  const head = input.subarray(0, 4096).toString("utf8").toLowerCase();
  return head.includes("<svg");
}

export async function prepareLogo(
  input: Buffer,
): Promise<PreparedLogo | { error: LogoProblem }> {
  if (input.length === 0) return { error: "unsupported" };
  if (looksLikeSvg(input)) return { error: "svg" };
  if (input.length > MAX_LOGO_BYTES) return { error: "too_large" };

  let format: string | undefined;
  try {
    const metadata = await sharp(input, {
      limitInputPixels: 50_000_000,
      failOn: "error",
    }).metadata();
    format = metadata.format;
  } catch {
    return { error: "broken" };
  }

  if (format === "svg") return { error: "svg" };
  if (!format || !["jpeg", "png", "webp"].includes(format)) {
    return { error: "unsupported" };
  }

  try {
    const main = await sharp(input, {
      limitInputPixels: 50_000_000,
      failOn: "error",
    })
      .rotate()
      .resize(LOGO_SIZE, LOGO_SIZE, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    const icons: PreparedLogo["icons"] = [];
    for (const size of LOGO_ICON_SIZES) {
      const data = await sharp(main)
        .resize(size, size, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      icons.push({ size, data });
    }

    return { main, icons };
  } catch {
    return { error: "broken" };
  }
}

export async function storeLogoAssets(
  prepared: PreparedLogo,
  storage: PhotoStorage = getStorage(),
): Promise<StoredLogo> {
  const base = randomUUID();
  const logoKey = `${base}.webp`;
  const iconKeys = {} as Record<LogoIconSize, string>;
  const stored: string[] = [];

  try {
    await storage.put(logoKey, prepared.main, "image/webp");
    stored.push(logoKey);

    for (const icon of prepared.icons) {
      const key = logoIconKey(logoKey, icon.size);
      await storage.put(key, icon.data, "image/png");
      stored.push(key);
      iconKeys[icon.size] = key;
    }

    return { logoKey, iconKeys };
  } catch (error) {
    await Promise.all(
      stored.map((key) => storage.delete(key).catch(() => undefined)),
    );
    throw error;
  }
}

export async function deleteLogoAssets(
  logoKey: string | null | undefined,
  storage: PhotoStorage = getStorage(),
): Promise<void> {
  if (!logoKey) return;
  const keys = [
    logoKey,
    ...LOGO_ICON_SIZES.map((size) => logoIconKey(logoKey, size)),
  ];
  await Promise.all(
    keys.map(async (key) => {
      try {
        await storage.delete(key);
      } catch {
        // старый файл мог не сохраниться — не мешаем смене логотипа
      }
    }),
  );
}

export function logoErrorMessage(problem: LogoProblem): string {
  switch (problem) {
    case "svg":
      return "SVG не поддерживаем, загрузите PNG.";
    case "too_large":
      return "Файл больше 2 МБ. Сожмите или выберите другой.";
    case "unsupported":
      return "Нужен PNG, JPEG или WebP. SVG не поддерживаем, загрузите PNG.";
    case "broken":
      return "Файл не открывается. Попробуйте другой.";
  }
}
