import type { Metadata, Viewport } from "next";
import { Doto, Geist, Geist_Mono, Instrument_Serif, Space_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { CursorTrail } from "@/components/CursorTrail";
import { SITE } from "@/content/site";
import { ldJson, siteGraph } from "@/seo/jsonld";
import "./globals.css";

const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-grotesk", display: "swap" });
const sans = Geist({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--f-sans", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono", display: "swap" });
const dot = Doto({ subsets: ["latin"], weight: ["700"], variable: "--f-dot", display: "swap" });
const serif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--f-serif", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: SITE.title, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.name, url: SITE.url }],
  creator: SITE.name,
  keywords: ["Syed Mohammad Rizwan", "AI engineer", "Bangalore", "AI agents", "LangGraph", "RAG", "voice agents", "portfolio"],
  openGraph: { type: "profile", siteName: SITE.name, title: SITE.title, description: SITE.description, url: SITE.url, locale: "en_IN" },
  twitter: { card: "summary_large_image", title: SITE.title, description: SITE.description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#f9f8f5", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${grotesk.variable} ${sans.variable} ${mono.variable} ${serif.variable} ${dot.variable}`} suppressHydrationWarning>
      <body>
        {children}
        <CursorTrail />
        {/* cookieless page views and real-visitor loading times, read in the Vercel dashboard; their scripts
            are served only on Vercel, so local and CI servers skip them instead of logging 404s */}
        {process.env.VERCEL && <><Analytics /><SpeedInsights /></>}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(siteGraph) }} />
      </body>
    </html>
  );
}
