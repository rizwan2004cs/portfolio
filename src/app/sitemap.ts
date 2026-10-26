import type { MetadataRoute } from "next";
import { PROJECTS } from "@/content/data";
import { SITE } from "@/content/site";

// lastModified is when the content changed (SITE.updated), not the build: a date that moves on every deploy
// teaches search engines to ignore it. Images are listed so project screenshots and his portrait can be found.
export default function sitemap(): MetadataRoute.Sitemap {
  const updated = new Date(SITE.updated);
  return [
    { url: SITE.url, lastModified: updated, changeFrequency: "monthly", priority: 1, images: [`${SITE.url}/img/portrait.jpg`] },
    { url: `${SITE.url}/agent`, lastModified: updated, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE.url}/films`, lastModified: updated, changeFrequency: "yearly", priority: 0.5 },
    ...PROJECTS.map((p) => ({
      url: `${SITE.url}/work/${p.id}`, lastModified: updated, changeFrequency: "yearly" as const, priority: 0.7,
      ...(p.image ? { images: [`${SITE.url}/img/${p.image}`] } : {}),
    })),
  ];
}
