import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createOrderHandler } from "@/app/api/orders/route";
import { GET as getOrderHandler } from "@/app/api/orders/[token]/route";
import { eq } from "drizzle-orm";
import {
  createSession,
  destroyAllUserSessions,
  findSessionUser,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { closeDb, getDb, runMigrations } from "@/lib/db";
import {
  adminUsers,
  company,
  orderPhotos,
  orders,
  tariffItems,
  tariffSettings,
} from "@/lib/db/schema";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  deleteOrder,
  updateOrder,
  AdminOrderError,
} from "@/lib/admin-orders";
import {
  createOrder,
  findPhotoForOrderToken,
  getPublicOrder,
} from "@/lib/orders";
import { MemoryStorage } from "@/lib/storage";
import type { CreateOrderPayload } from "@/lib/validation";

const DB_PATH = path.join(process.cwd(), ".data", "test-db");
const ORIGIN = "http://localhost:3000";

process.env.DATABASE_URL = `pglite://${DB_PATH}`;
process.env.NEXT_PUBLIC_SITE_URL = ORIGIN;
process.env.AUTH_SECRET = "test-secret-for-hmac-0123456789";

let png: Buffer;

function basePayload(overrides: Partial<CreateOrderPayload> = {}): CreateOrderPayload {
  return {
    items: [
      {
        tariffId: "sofa-3",
        quantity: 1,
        heavySoiling: false,
        secondSide: false,
      },
    ],
    customer: {
      name: "Анна К.",
      phone: "+7 913 000-00-00",
      address: "Улица Ленина, 1, кв. 2",
      outOfTown: false,
      comment: "",
    },
    consent: true,
    idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}aaaaaa`,
    ...overrides,
  };
}

async function postOrder(
  payload: CreateOrderPayload,
  photos: Array<{ index: number; blob: Blob }> = [],
  ip = "10.0.0.1",
): Promise<Response> {
  const form = new FormData();
  form.append("payload", JSON.stringify(payload));
  for (const photo of photos) {
    form.append(`photo:${photo.index}`, photo.blob, "photo.png");
  }
  return createOrderHandler(
    new Request(`${ORIGIN}/api/orders`, {
      method: "POST",
      headers: { origin: ORIGIN, "x-forwarded-for": ip },
      body: form,
    }),
  );
}

beforeAll(async () => {
  await fs.rm(DB_PATH, { recursive: true, force: true });
  await runMigrations();

  const db = getDb();

  await db.insert(company).values({
    id: 1,
    name: "Мягко",
    city: "Новосибирск",
    phone: "+7 913 000-00-00",
    email: "hello@myagko.test",
    territory: "Новосибирск и пригород",
    accentColor: "#155C4C",
    heroTitle: "Что почистим?",
    heroSubtitle: "Предварительная цена — сразу",
    otherRequiresPhoto: true,
  });

  await db.insert(tariffSettings).values({
    id: 1,
    minOrder: 2500,
    soilingPercent: 30,
    secondSidePercent: 50,
    outOfTownFee: 500,
    roundingStep: 10,
    maxPhotosPerItem: 3,
    maxPhotosPerOrder: 15,
    maxOrderFileBytes: 60_000_000,
    startingOrderNumber: 1001,
  });

  const tariffs = [
    {
      id: "sofa-2",
      category: "sofa" as const,
      label: "Диван",
      variantLabel: "2 места",
      basePrice: 2500,
      allowsSoiling: true,
      allowsSecondSide: false,
    },
    {
      id: "sofa-3",
      category: "sofa" as const,
      label: "Диван",
      variantLabel: "3 места",
      basePrice: 3200,
      allowsSoiling: true,
      allowsSecondSide: false,
    },
    {
      id: "mattress-double",
      category: "mattress" as const,
      label: "Матрас",
      variantLabel: "Двуспальный",
      basePrice: 2400,
      allowsSoiling: true,
      allowsSecondSide: true,
    },
    {
      id: "other",
      category: "other" as const,
      label: "Другое",
      variantLabel: "По фото",
      basePrice: null,
      allowsSoiling: false,
      allowsSecondSide: false,
      requiresPhoto: true,
      isManual: true,
    },
  ];

  for (const [index, tariff] of tariffs.entries()) {
    await db.insert(tariffItems).values({
      ...tariff,
      requiresPhoto: tariff.requiresPhoto ?? false,
      isManual: tariff.isManual ?? false,
      sortOrder: index * 10 + 10,
      isActive: true,
    });
  }

  png = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 21, g: 92, b: 76 },
    },
  })
    .png()
    .toBuffer();
});

afterAll(async () => {
  await closeDb();
  await fs.rm(DB_PATH, { recursive: true, force: true }).catch(() => undefined);
});

describe("POST /api/orders", () => {
  it("создаёт заявку и считает сумму на сервере", async () => {
    const payload = basePayload({
      items: [
        {
          tariffId: "sofa-3",
          quantity: 1,
          heavySoiling: true,
          secondSide: false,
        },
      ],
    });

    const response = await postOrder(payload, [], "10.0.0.2");
    expect(response.status).toBe(201);
    const data = (await response.json()) as { token: string; number: number };
    expect(data.number).toBeGreaterThanOrEqual(1001);
    expect(data.token.length).toBeGreaterThan(16);

    const order = await getPublicOrder(getDb(), data.token);
    expect(order?.totals.total).toBe(4160);
    expect(order?.items[0]?.lineTotal).toBe(4160);
    expect(order?.items[0]?.formula).toBe("3\u00a0200 × 1.3 = 4\u00a0160 ₽");

    const stored = await getDb()
      .select({ snapshot: orders.priceSnapshot, breakdown: orders.breakdown })
      .from(orders)
      .where(eq(orders.token, data.token))
      .limit(1);
    expect(stored[0]?.snapshot.rules.minOrder).toBe(2500);
    expect(stored[0]?.snapshot.tariff.length).toBeGreaterThanOrEqual(4);
    expect(stored[0]?.breakdown.lines[0]?.lineTotal).toBe(4160);
  });

  it("игнорирует цену, присланную из браузера", async () => {
    const payload = {
      ...basePayload(),
      total: 1,
      items: [
        {
          tariffId: "sofa-2",
          quantity: 1,
          heavySoiling: false,
          secondSide: false,
          lineTotal: 1,
          basePrice: 1,
        },
      ],
    } as unknown as CreateOrderPayload;

    const response = await postOrder(payload, [], "10.0.0.3");
    expect(response.status).toBe(201);
    const data = (await response.json()) as { token: string };
    const order = await getPublicOrder(getDb(), data.token);
    expect(order?.totals.total).toBe(2500);
  });

  it("не даёт отправить несуществующий вариант", async () => {
    const payload = basePayload({
      items: [
        {
          tariffId: "sofa-999",
          quantity: 1,
          heavySoiling: false,
          secondSide: false,
        },
      ],
    });
    const response = await postOrder(payload, [], "10.0.0.4");
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("нет в прайсе");
  });

  it("требует фото для «Другого»", async () => {
    const payload = basePayload({
      items: [
        {
          tariffId: "other",
          quantity: 1,
          heavySoiling: false,
          secondSide: false,
          manualDescription: "Изголовье кровати и две подушки",
        },
      ],
    });
    const response = await postOrder(payload, [], "10.0.0.5");
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("фото");
  });

  it("требует описание для «Другого»", async () => {
    const payload = basePayload({
      items: [
        {
          tariffId: "other",
          quantity: 1,
          heavySoiling: false,
          secondSide: false,
          manualDescription: "мало",
        },
      ],
    });
    const response = await postOrder(
      payload,
      [{ index: 0, blob: new Blob([new Uint8Array(png)]) }],
      "10.0.0.6",
    );
    expect(response.status).toBe(400);
  });

  it("принимает валидный файл и отсекает не-картинку", async () => {
    const withPhoto = basePayload({
      items: [
        {
          tariffId: "other",
          quantity: 1,
          heavySoiling: false,
          secondSide: false,
          manualDescription: "Изголовье кровати и две подушки",
        },
      ],
    });

    const ok = await postOrder(
      withPhoto,
      [{ index: 0, blob: new Blob([new Uint8Array(png)]) }],
      "10.0.0.7",
    );
    expect(ok.status).toBe(201);

    const bad = await postOrder(
      { ...withPhoto, idempotencyKey: `key-${Math.random().toString(36).slice(2, 12)}bbbbbb` },
      [{ index: 0, blob: new Blob(["это не картинка"]) }],
      "10.0.0.8",
    );
    expect(bad.status).toBe(400);
  });

  it("не создаёт дубль по тому же idempotency key", async () => {
    const payload = basePayload();
    const first = await postOrder(payload, [], "10.0.0.9");
    const second = await postOrder(payload, [], "10.0.0.10");

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    const a = (await first.json()) as { token: string };
    const b = (await second.json()) as { token: string };
    expect(a.token).toBe(b.token);
  });

  it("отсекает чужой Origin", async () => {
    const payload = basePayload();
    const response = await createOrderHandler(
      new Request(`${ORIGIN}/api/orders`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: JSON.stringify(payload),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("валидирует телефон на сервере", async () => {
    const payload = basePayload({
      customer: {
        ...basePayload().customer,
        phone: "12345",
      },
    });
    const response = await postOrder(payload, [], "10.0.0.11");
    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("телефон");
  });
});

describe("GET /api/orders/[token]", () => {
  it("отдаёт заявку по токену и не раскрывает заметку владельца", async () => {
    const created = await createOrder(
      getDb(),
      basePayload(),
      [],
      { storage: new MemoryStorage() },
    );

    const response = await getOrderHandler(
      new Request(`${ORIGIN}/api/orders/${created.token}`),
      { params: Promise.resolve({ token: created.token }) },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.number).toBe(created.publicNumber);
    expect(body).not.toHaveProperty("ownerNote");
    expect(body).not.toHaveProperty("events");
    expect(body).not.toHaveProperty("phone");
    expect(body).toHaveProperty("totals");
  });

  it("возвращает 404 на чужой токен", async () => {
    const response = await getOrderHandler(
      new Request(`${ORIGIN}/api/orders/nonexistent-token-123`),
      { params: Promise.resolve({ token: "nonexistent-token-123" }) },
    );
    expect(response.status).toBe(404);
  });
});

describe("статусы и действия владельца", () => {
  it("не согласует без цены и времени", async () => {
    const created = await createOrder(getDb(), basePayload(), [], {
      storage: new MemoryStorage(),
    });

    await expect(
      updateOrder(getDb(), created.id, { status: "agreed" }, "owner@test"),
    ).rejects.toBeInstanceOf(AdminOrderError);
  });

  it("согласует с ценой и временем, пишет историю, запрещает правки после завершения", async () => {
    const storage = new MemoryStorage();
    const created = await createOrder(getDb(), basePayload(), [], { storage });

    const future = new Date(Date.now() + 3 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    await updateOrder(
      getDb(),
      created.id,
      {
        status: "agreed",
        finalPrice: 5200,
        agreedDate: future,
        agreedTimeFrom: "14:00",
        agreedTimeTo: "16:00",
      },
      "owner@test",
    );

    let order = await getPublicOrder(getDb(), created.token);
    expect(order?.status).toBe("agreed");
    expect(order?.finalPrice).toBe(5200);
    expect(order?.agreed.from).toBe("14:00");

    await updateOrder(getDb(), created.id, { status: "done" }, "owner@test");
    order = await getPublicOrder(getDb(), created.token);
    expect(order?.status).toBe("done");

    await expect(
      updateOrder(getDb(), created.id, { finalPrice: 100 }, "owner@test"),
    ).rejects.toBeInstanceOf(AdminOrderError);
  });

  it("возвращает отменённую заявку в новые", async () => {
    const created = await createOrder(getDb(), basePayload(), [], {
      storage: new MemoryStorage(),
    });

    await updateOrder(getDb(), created.id, { status: "cancelled" }, "owner@test");
    await updateOrder(getDb(), created.id, { status: "new" }, "owner@test");

    const order = await getPublicOrder(getDb(), created.token);
    expect(order?.status).toBe("new");
  });

  it("удаляет заявку вместе с файлами", async () => {
    const storage = new MemoryStorage();
    const created = await createOrder(
      getDb(),
      basePayload({
        items: [
          {
            tariffId: "other",
            quantity: 1,
            heavySoiling: false,
            secondSide: false,
            manualDescription: "Изголовье кровати и две подушки",
          },
        ],
      }),
      [
        {
          itemIndex: 0,
          photo: {
            data: png,
            mime: "image/webp",
            width: 32,
            height: 32,
            bytes: png.length,
          },
        },
      ],
      { storage },
    );

    expect(storage.objects.size).toBe(1);
    await deleteOrder(getDb(), created.id, storage);
    expect(storage.objects.size).toBe(0);
    expect(await getPublicOrder(getDb(), created.token)).toBeNull();

    const rows = await getDb().select().from(orders);
    expect(rows.some((row) => row.id === created.id)).toBe(false);
  });
});

describe("доступ и фото", () => {
  it("хэширует пароль argon2id и проверяет его", async () => {
    const hash = await hashPassword("Myagko-demo-2026");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(hash, "Myagko-demo-2026")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("гасит все сессии пользователя", async () => {
    const email = `owner-${Date.now()}@test`;
    const inserted = await getDb()
      .insert(adminUsers)
      .values({ email, passwordHash: await hashPassword("password-12345") })
      .returning({ id: adminUsers.id });

    const userId = inserted[0]!.id;
    const token = await createSession(getDb(), userId);
    expect(await findSessionUser(getDb(), token)).not.toBeNull();

    await destroyAllUserSessions(getDb(), userId);
    expect(await findSessionUser(getDb(), token)).toBeNull();
  });

  it("не отдаёт фото по чужому токену", async () => {
    const storage = new MemoryStorage();
    const created = await createOrder(
      getDb(),
      basePayload({
        items: [
          {
            tariffId: "other",
            quantity: 1,
            heavySoiling: false,
            secondSide: false,
            manualDescription: "Изголовье кровати и две подушки",
          },
        ],
      }),
      [
        {
          itemIndex: 0,
          photo: {
            data: png,
            mime: "image/webp",
            width: 32,
            height: 32,
            bytes: png.length,
          },
        },
      ],
      { storage },
    );

    const photoRows = await getDb().select().from(orderPhotos);
    const photo = photoRows.find((row) => row.orderId === created.id);
    expect(photo).toBeTruthy();

    expect(
      await findPhotoForOrderToken(getDb(), photo!.id, "wrong-token-12345"),
    ).toBeNull();

    expect(
      await findPhotoForOrderToken(getDb(), photo!.id, created.token),
    ).not.toBeNull();
  });
});

describe("rate limit", () => {  it("считает попытки в скользящем окне", async () => {
    const db = getDb();
    const key = `test-${Date.now()}`;

    expect((await checkRateLimit(db, { key, limit: 2, windowMs: 60_000 })).allowed).toBe(true);
    expect((await checkRateLimit(db, { key, limit: 2, windowMs: 60_000 })).allowed).toBe(true);

    const third = await checkRateLimit(db, { key, limit: 2, windowMs: 60_000 });
    expect(third.allowed).toBe(false);
    if (!third.allowed) expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });
});
