import { describe, expect, it } from "vitest";

import { companyPageTitle } from "./company-title";

describe("companyPageTitle", () => {
  it("собирает старый заголовок, если поле пустое", () => {
    expect(
      companyPageTitle({
        name: "Мягко",
        city: "Новосибирск",
        browserTitle: "",
      }),
    ).toBe("Мягко — услуги на выезде в Новосибирск");
  });

  it("использует введённый заголовок без суффиксов", () => {
    expect(
      companyPageTitle({
        name: "Мягко",
        city: "Новосибирск",
        browserTitle: "Химчистка мебели в Красноярске",
      }),
    ).toBe("Химчистка мебели в Красноярске");
  });
});
