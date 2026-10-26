import type { MetadataRoute } from "next";
import { PROJECTS } from "@/content/data";
import { SITE } from "@/content/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE.url, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE.url}/agent`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    ...PROJECTS.map((p) => ({ url: `${SITE.url}/work/${p.id}`, lastModified: now, changeFrequency: "yearly" as const, priority: 0.7 })),
  ];
}
