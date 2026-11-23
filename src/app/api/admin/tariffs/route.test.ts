import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    requireAdmin: async () => ({
      ok: true,
      user: {
        id: "00000000-0000-0000-0000-000000000001",
        email: "owner@test.local",
        mustChangePassword: false,
      },
    }),
  };
});

import { PUT } from "./route";

process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

function requestWith(body: unknown): Request {
  return new Request("http://localhost:3000/api/admin/tariffs", {
    method: "PUT",
    headers: {
      origin: "http://localhost:3000",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const settings = {
  minOrder: 2500,
  outOfTownFee: 500,
  roundingStep: 10,
};

function payloadWithOption(kind: string, value: unknown) {
  return {
    settings,
    services: [
      {
        id: "windows",
        label: "Окна",
        hint: "",
        icon: "other",
        sortOrder: 10,
        isActive: true,
      },
    ],
    options: [
      {
        id: "frames",
        label: "Рамы",
        kind,
        value,
        sortOrder: 10,
        isActive: true,
      },
    ],
    items: [],
  };
}

describe("PUT /api/admin/tariffs", () => {
  it("отвечает 400 на процент выше 500", async () => {
    const response = await PUT(requestWith(payloadWithOption("percent", 501)));
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Процент");
  });

  it("отвечает 400 на отрицательное значение", async () => {
    const response = await PUT(requestWith(payloadWithOption("fixed", -1)));
    expect(response.status).toBe(400);
  });

  it("отвечает 400 на мусор вместо числа", async () => {
    const response = await PUT(requestWith(payloadWithOption("fixed_order", "100")));
    expect(response.status).toBe(400);
  });

  it("отвечает 400 на фикс выше 1 000 000", async () => {
    const response = await PUT(
      requestWith(payloadWithOption("fixed", 1_000_001)),
    );
    expect(response.status).toBe(400);
  });
});
