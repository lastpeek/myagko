import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { apiError, json, requireAdmin } from "@/lib/api";
import { getDb } from "@/lib/db";
import { company } from "@/lib/db/schema";
import { deleteLogoAssets, logoErrorMessage, prepareLogo, storeLogoAssets } from "@/lib/logo";
import { logoUrl } from "@/lib/logo-assets";
import { isSameOrigin } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentLogoKey(): Promise<string | null> {
  const rows = await getDb()
    .select({ logoKey: company.logoKey })
    .from(company)
    .where(eq(company.id, 1))
    .limit(1);
  return rows[0]?.logoKey ?? null;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("Не удалось прочитать файл", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return apiError("Выберите файл логотипа", 400);
  }

  const prepared = await prepareLogo(Buffer.from(await file.arrayBuffer()));
  if ("error" in prepared) {
    return apiError(logoErrorMessage(prepared.error), 400);
  }

  const previous = await currentLogoKey();
  let stored;
  try {
    stored = await storeLogoAssets(prepared);
  } catch {
    return apiError("Не удалось сохранить логотип", 500);
  }

  try {
    const updated = await getDb()
      .update(company)
      .set({ logoKey: stored.logoKey, updatedAt: new Date() })
      .where(eq(company.id, 1))
      .returning({ id: company.id });

    if (!updated[0]) {
      await deleteLogoAssets(stored.logoKey);
      return apiError("Компания не настроена", 400);
    }
  } catch {
    await deleteLogoAssets(stored.logoKey);
    return apiError("Не удалось сохранить логотип", 500);
  }

  await deleteLogoAssets(previous);
  revalidatePath("/", "layout");
  return json({ ok: true, logoUrl: logoUrl(stored.logoKey) }, 201);
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) {
    return apiError("Запрос с чужого сайта отклонён", 403);
  }

  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const previous = await currentLogoKey();
  await getDb()
    .update(company)
    .set({ logoKey: null, updatedAt: new Date() })
    .where(eq(company.id, 1));

  await deleteLogoAssets(previous);
  revalidatePath("/", "layout");
  return json({ ok: true });
}
