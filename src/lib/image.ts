import sharp from "sharp";

import type { SniffedType } from "@/lib/image-sniff";

export type NormalizedPhoto = {
  data: Buffer;
  mime: "image/webp";
  width: number;
  height: number;
  bytes: number;
};

export type PhotoProblem = "too_large" | "unsupported" | "broken";

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const MAX_DIMENSION = 1600;

/**
 * Серверная проверка и перекодирование. Тип определяется по содержимому
 * (sharp/metadata), EXIF и прочая метаинформация срезаются.
 */
export async function normalizePhoto(
  input: Buffer,
  maxBytes = MAX_INPUT_BYTES,
): Promise<NormalizedPhoto | { error: PhotoProblem }> {
  if (input.length === 0) return { error: "unsupported" };
  if (input.length > maxBytes) return { error: "too_large" };

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

  const allowed: SniffedType[] = ["jpeg", "png", "webp"];
  if (!format || !allowed.includes(format as SniffedType)) {
    return { error: "unsupported" };
  }

  try {
    const result = await sharp(input, {
      limitInputPixels: 50_000_000,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80, effort: 4 })
      .toBuffer({ resolveWithObject: true });

    if (result.data.length > MAX_INPUT_BYTES) {
      return { error: "too_large" };
    }

    return {
      data: result.data,
      mime: "image/webp",
      width: result.info.width,
      height: result.info.height,
      bytes: result.data.length,
    };
  } catch {
    return { error: "broken" };
  }
}

export function photoErrorMessage(problem: PhotoProblem): string {
  switch (problem) {
    case "too_large":
      return "Файл больше 10 МБ. Сожмите или выберите другой.";
    case "unsupported":
      return "Нужен JPG, PNG или WebP.";
    case "broken":
      return "Файл не открывается. Попробуйте другой.";
  }
}
