import { getDb } from "@/lib/db";
import { getPublicOrder } from "@/lib/orders";
import { apiError, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const order = await getPublicOrder(getDb(), token);

  if (!order) {
    return apiError("Заявка не найдена", 404);
  }

  return json(order);
}
