import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { MAX_INPUT_BYTES, normalizePhoto } from "./image";

describe("normalizePhoto", () => {
  it("перекодирует валидный PNG в WebP и уменьшает сторону до 1600", async () => {
    const png = await sharp({
      create: {
        width: 3000,
        height: 2000,
        channels: 3,
        background: { r: 200, g: 180, b: 150 },
      },
    })
      .png()
      .toBuffer();

    const result = await normalizePhoto(png);
    expect("error" in result).toBe(false);
    if (!("error" in result)) {
      expect(result.mime).toBe("image/webp");
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1600);
      expect(result.bytes).toBeGreaterThan(0);
    }
  });

  it("отсекает файл больше 10 МБ до разбора", async () => {
    const result = await normalizePhoto(Buffer.alloc(MAX_INPUT_BYTES + 1));
    expect(result).toEqual({ error: "too_large" });
  });

  it("не доверяет расширению: текст вместо картинки не проходит", async () => {
    const result = await normalizePhoto(Buffer.from("<!doctype html><h1>не фото</h1>"));
    expect("error" in result).toBe(true);
  });
});
