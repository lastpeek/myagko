import { describe, expect, it } from "vitest";

import { syncTerritoryCity, territoryLabel } from "./company-text";

describe("syncTerritoryCity", () => {
  it("меняет город в начале территории", () => {
    expect(
      syncTerritoryCity(
        "Новосибирск",
        "Красноярск",
        "Новосибирск и пригород. Выезд за город — 500 ₽.",
      ),
    ).toBe("Красноярск и пригород. Выезд за город — 500 ₽.");
  });

  it("не трогает территорию с другим началом", () => {
    expect(
      syncTerritoryCity("Новосибирск", "Красноярск", "Выезд по области"),
    ).toBe("Выезд по области");
  });

  it("работает при вводе города по буквам", () => {
    expect(syncTerritoryCity("Новосибирск", "К", "Новосибирск и пригород")).toBe(
      "К и пригород",
    );
    expect(syncTerritoryCity("К", "Кр", "К и пригород")).toBe("Кр и пригород");
  });
});

describe("territoryLabel", () => {
  it("не дублирует город", () => {
    expect(territoryLabel("Красноярск", "Красноярск и пригород")).toBe(
      "Красноярск и пригород",
    );
  });

  it("добавляет город к произвольной территории", () => {
    expect(territoryLabel("Красноярск", "Выезд по области")).toBe(
      "Красноярск · Выезд по области",
    );
  });
});
