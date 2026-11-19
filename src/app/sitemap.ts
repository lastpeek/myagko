import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl.replace(/\/$/, "");
  const updated = new Date();

  return [
    { url: `${base}/`, lastModified: updated, changeFrequency: "monthly", priority: 1 },
    {
      url: `${base}/privacy`,
      lastModified: updated,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${base}/attribution`,
      lastModified: updated,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
