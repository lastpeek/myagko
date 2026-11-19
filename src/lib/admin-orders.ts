import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { Database } from "@/lib/db";
import {
  orderEvents,
  orderItems,
  orderPhotos,
  orders,
  type OrderBreakdown,
  type OrderEventPayload,
  type OrderStatus,
} from "@/lib/db/schema";
import type { OrderUpdate } from "@/lib/validation";
import { isValidDate, isValidTime, isPastDate } from "@/lib/time";
import { getStorage, type PhotoStorage } from "@/lib/storage";

export class AdminOrderError extends Error {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "AdminOrderError";
    this.field = field;
  }
}

export type AdminOrderSummary = {
  id: string;
  publicNumber: number;
  status: OrderStatus;
  name: string;
  phone: string;
  address: string;
  desiredDate: string | null;
  desiredTimeFrom: string | null;
  desiredTimeTo: string | null;
  agreedDate: string | null;
  agreedTimeFrom: string | null;
  agreedTimeTo: string | null;
  estimatedTotal: number | null;
  finalPrice: number | null;
  createdAt: Date;
  outOfTown: boolean;
  itemsCount: number;
  photosCount: number;
  manualCount: number;
  breakdown: OrderBreakdown;
};

export async function listOrders(
  db: Database,
  args: { query?: string; status?: OrderStatus | "all"; limit?: number },
): Promise<AdminOrderSummary[]> {
  const conditions = [];

  if (args.status && args.status !== "all") {
    conditions.push(eq(orders.status, args.status));
  }

  const search = args.query?.trim();
  if (search) {
    const like = `%${search}%`;
    const digits = search.replace(/\D/g, "");
    const parts = [
      ilike(orders.name, like),
      ilike(orders.address, like),
      sql`${orders.publicNumber}::text = ${search}`,
    ];
    if (digits.length >= 3) parts.push(ilike(orders.phone, `%${digits}%`));
    conditions.push(or(...parts));
  }

  const rows = await db
    .select({
      id: orders.id,
      publicNumber: orders.publicNumber,
      status: orders.status,
      name: orders.name,
      phone: orders.phone,
      address: orders.address,
      desiredDate: orders.desiredDate,
      desiredTimeFrom: orders.desiredTimeFrom,
      desiredTimeTo: orders.desiredTimeTo,
      agreedDate: orders.agreedDate,
      agreedTimeFrom: orders.agreedTimeFrom,
      agreedTimeTo: orders.agreedTimeTo,
      estimatedTotal: orders.estimatedTotal,
      finalPrice: orders.finalPrice,
      createdAt: orders.createdAt,
      outOfTown: orders.outOfTown,
      breakdown: orders.breakdown,
    })
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt))
    .limit(Math.min(args.limit ?? 100, 200));

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const itemCounts = await db
    .select({
      orderId: orderItems.orderId,
      count: sql<number>`count(*)::int`,
      manual: sql<number>`count(*) filter (where ${orderItems.lineTotal} is null)::int`,
    })
    .from(orderItems)
    .where(inArray(orderItems.orderId, ids))
    .groupBy(orderItems.orderId);

  const photoCounts = await db
    .select({
      orderId: orderPhotos.orderId,
      count: sql<number>`count(*)::int`,
    })
    .from(orderPhotos)
    .where(inArray(orderPhotos.orderId, ids))
    .groupBy(orderPhotos.orderId);

  const itemMap = new Map(itemCounts.map((r) => [r.orderId, r]));
  const photoMap = new Map(photoCounts.map((r) => [r.orderId, r.count]));

  return rows.map((row) => ({
    ...row,
    itemsCount: itemMap.get(row.id)?.count ?? 0,
    manualCount: itemMap.get(row.id)?.manual ?? 0,
    photosCount: photoMap.get(row.id) ?? 0,
  }));
}

export type AdminOrderDetail = {
  order: typeof orders.$inferSelect;
  items: (typeof orderItems.$inferSelect)[];
  photos: (typeof orderPhotos.$inferSelect & { url: string })[];
  events: (typeof orderEvents.$inferSelect)[];
};

export async function getAdminOrder(
  db: Database,
  id: string,
): Promise<AdminOrderDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;

  const rows = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  const order = rows[0];
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, id))
    .orderBy(asc(orderItems.sortOrder));

  const photos = await db
    .select()
    .from(orderPhotos)
    .where(eq(orderPhotos.orderId, id))
    .orderBy(asc(orderPhotos.sortOrder));

  const events = await db
    .select()
    .from(orderEvents)
    .where(eq(orderEvents.orderId, id))
    .orderBy(desc(orderEvents.createdAt));

  return {
    order,
    items,
    photos: photos.map((photo) => ({
      ...photo,
      url: `/api/photos/${photo.id}`,
    })),
    events,
  };
}

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["agreed", "cancelled"],
  agreed: ["done", "cancelled"],
  done: [],
  cancelled: ["new"],
};

function isEditable(status: OrderStatus): boolean {
  return status === "new" || status === "agreed";
}

export async function updateOrder(
  db: Database,
  id: string,
  input: OrderUpdate,
  actor: string,
): Promise<void> {
  const current = await getAdminOrder(db, id);
  if (!current) throw new AdminOrderError("Заявка не найдена");

  const order = current.order;
  const editorAllowed = isEditable(order.status);

  const touchesPrice =
    input.finalPrice !== undefined && input.finalPrice !== order.finalPrice;
  const touchesNote =
    input.ownerNote !== undefined && input.ownerNote !== order.ownerNote;
  const touchesTime =
    (input.agreedDate !== undefined &&
      input.agreedDate !== order.agreedDate) ||
    (input.agreedTimeFrom !== undefined &&
      input.agreedTimeFrom !== order.agreedTimeFrom) ||
    (input.agreedTimeTo !== undefined &&
      input.agreedTimeTo !== order.agreedTimeTo);

  if (!editorAllowed && (touchesPrice || touchesNote || touchesTime)) {
    throw new AdminOrderError("Завершённую или отменённую заявку менять нельзя");
  }

  const nextPrice =
    input.finalPrice === undefined ? order.finalPrice : input.finalPrice;
  const nextDate =
    input.agreedDate === undefined ? order.agreedDate : input.agreedDate;
  const nextFrom =
    input.agreedTimeFrom === undefined
      ? order.agreedTimeFrom
      : input.agreedTimeFrom;
  const nextTo =
    input.agreedTimeTo === undefined ? order.agreedTimeTo : input.agreedTimeTo;

  const nextStatus = input.status ?? order.status;

  if (nextStatus !== order.status) {
    if (!TRANSITIONS[order.status].includes(nextStatus)) {
      throw new AdminOrderError(
        `Из «${statusLabel(order.status)}» нельзя перейти в «${statusLabel(nextStatus)}»`,
      );
    }
  }

  if (nextDate || nextFrom || nextTo) {
    if (!nextDate || !nextFrom || !nextTo) {
      throw new AdminOrderError(
        "Нужны дата и время «с» и «по»",
        "agreedDate",
      );
    }
    if (!isValidDate(nextDate)) {
      throw new AdminOrderError("Проверьте дату визита", "agreedDate");
    }
    if (isPastDate(nextDate)) {
      throw new AdminOrderError("Дата визита уже прошла", "agreedDate");
    }
    if (!isValidTime(nextFrom) || !isValidTime(nextTo)) {
      throw new AdminOrderError("Время в формате ЧЧ:ММ", "agreedTimeFrom");
    }
    if (nextFrom >= nextTo) {
      throw new AdminOrderError(
        "Начало должно быть раньше конца",
        "agreedTimeTo",
      );
    }
  }

  if (nextStatus === "agreed") {
    if (nextPrice === null || nextPrice === undefined) {
      throw new AdminOrderError(
        "Для статуса «Согласована» нужна итоговая цена",
        "finalPrice",
      );
    }
    if (!nextDate || !nextFrom || !nextTo) {
      throw new AdminOrderError(
        "Для статуса «Согласована» нужны дата и время",
        "agreedDate",
      );
    }
  }

  if (nextPrice !== null && nextPrice !== undefined && nextPrice < 0) {
    throw new AdminOrderError("Цена не может быть отрицательной", "finalPrice");
  }

  const clearAgreed =
    order.status === "cancelled" && nextStatus === "new";

  const events: { type: string; payload: OrderEventPayload }[] = [];

  if (nextStatus !== order.status) {
    events.push({
      type: "status_changed",
      payload: { from: order.status, to: nextStatus },
    });
  }

  if (touchesPrice) {
    events.push({
      type: "price_changed",
      payload: { from: order.finalPrice, to: nextPrice ?? null },
    });
  }

  if (touchesTime && !clearAgreed) {
    events.push({
      type: "time_changed",
      payload: {
        date: nextDate ?? null,
        from: nextFrom ?? null,
        to: nextTo ?? null,
      },
    });
  }

  if (touchesNote) {
    events.push({ type: "note_changed", payload: { changed: 1 } });
  }

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        status: nextStatus,
        finalPrice: nextPrice ?? null,
        agreedDate: clearAgreed ? null : nextDate,
        agreedTimeFrom: clearAgreed ? null : nextFrom,
        agreedTimeTo: clearAgreed ? null : nextTo,
        ownerNote: input.ownerNote ?? order.ownerNote,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, id));

    if (events.length > 0) {
      await tx.insert(orderEvents).values(
        events.map((event) => ({
          orderId: id,
          type: event.type,
          actor,
          payload: event.payload,
        })),
      );
    }
  });
}

export function statusLabel(status: OrderStatus): string {
  switch (status) {
    case "new":
      return "Новая";
    case "agreed":
      return "Согласована";
    case "done":
      return "Завершена";
    case "cancelled":
      return "Отменена";
  }
}

export async function deleteOrder(
  db: Database,
  id: string,
  storage: PhotoStorage = getStorage(),
): Promise<void> {
  const photoRows = await db
    .select({ storageKey: orderPhotos.storageKey })
    .from(orderPhotos)
    .where(eq(orderPhotos.orderId, id));

  const deleted = await db
    .delete(orders)
    .where(eq(orders.id, id))
    .returning({ id: orders.id });

  if (deleted.length === 0) {
    throw new AdminOrderError("Заявка не найдена");
  }

  await Promise.all(
    photoRows.map((photo) => storage.delete(photo.storageKey).catch(() => undefined)),
  );
}

export function parseStatus(value: string | null | undefined): OrderStatus | "all" {
  if (value === "new" || value === "agreed" || value === "done" || value === "cancelled") {
    return value;
  }
  return "all";
}
