export type SniffedType = "jpeg" | "png" | "webp" | null;

/**
 * Тип по сигнатуре файла, не по расширению и не по Content-Type.
 * Используется на клиенте для раннего отказа; на сервере истина — sharp.
 */
export function sniffImageType(bytes: Uint8Array): SniffedType {
  if (bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...bytes.slice(start, end));

  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    return "webp";
  }

  return null;
}

export const ACCEPTED_IMAGE_TYPES = "JPG, PNG, WebP";
