import type { OrderStatus } from "@/lib/db/schema";

const LABEL: Record<OrderStatus, string> = {
  new: "Новая",
  agreed: "Согласована",
  done: "Завершена",
  cancelled: "Отменена",
};

const CLASS: Record<OrderStatus, string> = {
  new: "badge",
  agreed: "badge",
  done: "badge badge-muted",
  cancelled: "badge badge-faint",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={CLASS[status]}>{LABEL[status]}</span>;
}

export function statusLabel(status: OrderStatus): string {
  return LABEL[status];
}
