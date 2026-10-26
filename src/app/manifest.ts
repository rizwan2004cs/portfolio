import type { MetadataRoute } from "next";
import { SITE } from "@/content/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — AI Engineer`,
    short_name: "Rizwan",
    description: SITE.description,
    start_url: "/",
    display: "browser",
    background_color: "#f9f8f5",
    theme_color: "#f9f8f5",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }, { src: "/apple-icon", sizes: "180x180", type: "image/png" }],
  };
}
