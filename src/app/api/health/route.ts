import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return json({ ok: true });
  } catch {
    return json({ ok: false }, 503);
  }
}
