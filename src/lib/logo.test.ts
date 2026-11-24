import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  deleteLogoAssets,
  MAX_LOGO_BYTES,
  prepareLogo,
  storeLogoAssets,
} from "@/lib/logo";
import { logoIconKey, logoUrl } from "@/lib/logo-assets";
import { isStorageKey, MemoryStorage } from "@/lib/storage";

const KEY = "123e4567-e89b-12d3-a456-426614174000.webp";

describe("prepareLogo", () => {
  it("делает WebP 512 и PNG-иконки", async () => {
    const input = await sharp({
      create: {
        width: 700,
        height: 500,
        channels: 4,
        background: { r: 21, g: 92, b: 76, alpha: 1 },
      },
    })
      .png()
      .toBuffer();

    const result = await prepareLogo(input);
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    const main = await sharp(result.main).metadata();
    expect(main.format).toBe("webp");
    expect(main.width).toBe(512);
    expect(main.height).toBe(512);

    const sizes = await Promise.all(
      result.icons.map(async (icon) => ({
        expected: icon.size,
        ...(await sharp(icon.data).metadata()),
      })),
    );
    expect(sizes.map((icon) => icon.expected)).toEqual([180, 192, 512]);
    for (const icon of sizes) {
      expect(icon.format).toBe("png");
      expect(icon.width).toBe(icon.expected);
      expect(icon.height).toBe(icon.expected);
    }
  });

  it("не принимает SVG", async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64"/></svg>',
    );
    await expect(prepareLogo(svg)).resolves.toEqual({ error: "svg" });
  });

  it("не принимает файл больше 2 МБ", async () => {
    await expect(
      prepareLogo(Buffer.alloc(MAX_LOGO_BYTES + 1, 7)),
    ).resolves.toEqual({ error: "too_large" });
  });

  it("сохраняет логотип и иконки рядом, затем удаляет", async () => {
    const input = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 21, g: 92, b: 76, alpha: 1 },
      },
    })
      .png()
      .toBuffer();
    const prepared = await prepareLogo(input);
    if ("error" in prepared) throw new Error(prepared.error);

    const storage = new MemoryStorage();
    const stored = await storeLogoAssets(prepared, storage);
    expect(storage.objects.has(stored.logoKey)).toBe(true);
    expect(storage.objects.has(logoIconKey(stored.logoKey, 192))).toBe(true);
    expect(storage.objects.has(logoIconKey(stored.logoKey, 512))).toBe(true);

    await deleteLogoAssets(stored.logoKey, storage);
    expect(storage.objects.size).toBe(0);
  });
});

describe("адреса логотипа", () => {
  it("версионирует публичные адреса", () => {
    expect(logoUrl(KEY)).toBe("/api/logo?v=123e4567");
    expect(logoUrl(KEY, 192)).toBe("/api/logo/192?v=123e4567");
    expect(logoUrl(null)).toBeNull();
  });

  it("ключи логотипа и иконок проходят проверку storage", () => {
    expect(isStorageKey(KEY)).toBe(true);
    expect(isStorageKey(logoIconKey(KEY, 180))).toBe(true);
    expect(isStorageKey(logoIconKey(KEY, 192))).toBe(true);
    expect(isStorageKey(logoIconKey(KEY, 512))).toBe(true);
    expect(isStorageKey("../../secret.webp")).toBe(false);
  });
});
