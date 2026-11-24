import { getCompany } from "@/lib/company";
import {
  isLogoIconSize,
  logoIconKey,
  type LogoIconSize,
} from "@/lib/logo-assets";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = "public, max-age=3600, stale-while-revalidate=60";

export async function GET(
  _request: Request,
  context: { params: Promise<{ size: string }> },
) {
  const { size } = await context.params;
  if (!isLogoIconSize(size)) return new Response(null, { status: 404 });

  const company = await getCompany();
  if (!company.logoKey) return new Response(null, { status: 404 });

  const iconSize = Number(size) as LogoIconSize;
  const object = await getStorage().get(
    logoIconKey(company.logoKey, iconSize),
  );
  if (!object) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(object.data), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": CACHE,
    },
  });
}
