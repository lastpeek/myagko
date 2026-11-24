import { getCompany } from "@/lib/company";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=3600, stale-while-revalidate=60";

export async function GET() {
  const company = await getCompany();
  if (!company.logoKey) {
    return new Response(null, { status: 404 });
  }

  const object = await getStorage().get(company.logoKey);
  if (!object) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": CACHE,
    },
  });
}
