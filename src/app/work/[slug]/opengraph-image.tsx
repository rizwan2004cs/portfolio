import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PROJECTS, projectById } from "@/content/data";
import { SITE } from "@/content/site";

// Each write-up unfurls as its own card: project name, what it does, its stack, and a screenshot when there is one.
export const alt = "Project by Syed Mohammad Rizwan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// rendered at build time: the screenshots are read from public/, which a serverless function doesn't ship
export const generateStaticParams = () => PROJECTS.map((p) => ({ slug: p.id }));

const INK = "#171717", SOFT = "#4f4d48", MUTED = "#6b6964", LINE = "rgba(176,168,155,.28)", OK = "#1f7a45", BG = "#f9f8f5";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const p = projectById((await params).slug) ?? PROJECTS[0];
  // the 960px version: big enough for the card, small enough to keep the PNG light
  const shot = p.image ? `data:image/jpeg;base64,${(await readFile(join(process.cwd(), "public/img", p.image.replace(/\.jpg$/, "-960.jpg")))).toString("base64")}` : null;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: BG, color: INK,
        backgroundImage: `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`, backgroundSize: "40px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: MUTED }}>
          <div style={{ width: 12, height: 12, background: OK }} />
          {`${SITE.name} · ${p.year}`}
        </div>
        <div style={{ display: "flex", gap: 48, alignItems: "center" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: p.title.length > 16 ? 64 : 84, fontWeight: 600, letterSpacing: -3, lineHeight: 1.02 }}>{p.title}</div>
            <div style={{ fontSize: 30, marginTop: 22, color: SOFT, lineHeight: 1.3 }}>{p.oneLiner}</div>
          </div>
          {shot && (
            <img src={shot} width={480} height={270} alt="" style={{ objectFit: "cover", objectPosition: "top", border: `1px solid ${INK}` }} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 22 }}>
          <div style={{ display: "flex", gap: 10 }}>
            {p.stack.slice(0, 4).map((s) => (
              <div key={s} style={{ display: "flex", padding: "6px 12px", border: `1px solid ${INK}`, background: BG }}>{s}</div>
            ))}
          </div>
          <div style={{ display: "flex", color: MUTED }}>{`mohammad-rizwan.tech/work/${p.id}`}</div>
        </div>
      </div>
    ),
    size,
  );
}
