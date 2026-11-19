import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  deriveAccentTheme,
  hslToRgb,
  normalizeHex,
  rgbToHsl,
  validateAccent,
} from "./theme";

describe("normalizeHex", () => {
  it("приводит короткую запись к полной", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
  });

  it("отклоняет не HEX", () => {
    expect(normalizeHex("зелёный")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("155C4C")).toBeNull();
  });
});

describe("цветовые преобразования", () => {
  it("HSL и RGB сходятся", () => {
    const [h, s, l] = rgbToHsl(21, 92, 76);
    expect(h).toBeGreaterThan(150);
    expect(h).toBeLessThan(175);
    expect(s).toBeGreaterThan(55);
    const [r, g, b] = hslToRgb(h, s, l);
    expect(Math.abs(Math.round(r) - 21)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.round(g) - 92)).toBeLessThanOrEqual(1);
    expect(Math.abs(Math.round(b) - 76)).toBeLessThanOrEqual(1);
  });

  it("считает контраст белого и почти чёрного", () => {
    expect(contrastRatio("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });
});

describe("deriveAccentTheme", () => {
  it("из демо-акцента получает точные токены DESIGN.md", () => {
    const theme = deriveAccentTheme("#155C4C");
    expect(theme.light.accent).toBe("#155C4C");
    expect(theme.light.accentSoft).toBe("#E3EFE9");
    expect(theme.light.accentInk).toBe("#0F4A3D");
    expect(theme.dark.accent).toBe("#5FBF9F");
    expect(theme.dark.accentSoft).toBe("#1D332C");
    expect(theme.dark.accentInk).toBe("#8AD6BB");
  });

  it("демо-акцент проходит проверку контраста в обеих темах", () => {
    expect(validateAccent("#155C4C").ok).toBe(true);
  });

  it("не пропускает кислотно-жёлтый акцент", () => {
    const result = validateAccent("#FFE600");
    expect(result.ok).toBe(false);
  });
});
