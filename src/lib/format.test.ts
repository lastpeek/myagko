import { describe, expect, it } from "vitest";

import { formatRub } from "@/lib/format";

describe("formatRub", () => {
  it("показывает копейки только если они есть", () => {
    expect(formatRub(3187)).toBe("3\u00a0187\u00a0₽");
    expect(formatRub(3187.5)).toBe("3\u00a0187,50\u00a0₽");
    expect(formatRub(3187.05)).toBe("3\u00a0187,05\u00a0₽");
  });

  it("не выдумывает сумму для «По фото»", () => {
    expect(formatRub(null)).toBe("По фото");
    expect(formatRub(undefined)).toBe("По фото");
  });
});
