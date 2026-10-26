import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { EVENTS, EXPERIENCE, PROJECTS } from "@/content/data";
import { SITE } from "@/content/site";

// The card a link to the site unfurls as (LinkedIn, WhatsApp, X, Slack): his face, name and role, and the proof in one line.
export const alt = `${SITE.name}, AI engineer in Bengaluru: portfolio and AI agent`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#171717", SOFT = "#4f4d48", MUTED = "#6b6964", LINE = "rgba(176,168,155,.28)", OK = "#1f7a45", BG = "#f9f8f5";

export default async function OgImage() {
  const portrait = `data:image/jpeg;base64,${(await readFile(join(process.cwd(), "public/img/portrait.jpg"))).toString("base64")}`;
  const now = EXPERIENCE.find((x) => x.now)!;
  const prize = EVENTS.find((e) => e.kind === "won");
  const proof = ["PACK", "CCR Compliance Advisor", "FinBoom"].filter((t) => PROJECTS.some((p) => p.title === t));
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: BG, color: INK,
        backgroundImage: `linear-gradient(${LINE} 1px, transparent 1px), linear-gradient(90deg, ${LINE} 1px, transparent 1px)`, backgroundSize: "40px 40px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 0 64px 72px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: MUTED }}>
            <div style={{ width: 12, height: 12, background: OK }} />
            mohammad-rizwan.tech
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 30, color: MUTED, letterSpacing: 1 }}>SYED</div>
            <div style={{ fontSize: 92, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>Mohammad Rizwan</div>
            <div style={{ fontSize: 38, marginTop: 22, color: SOFT }}>AI engineer · Bengaluru</div>
            <div style={{ fontSize: 26, marginTop: 10, color: MUTED }}>{`${now.role} at ${now.title}`}</div>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 20 }}>
            {[...proof, ...(prize ? [`${prize.result.replace(/^won /, "")} CTF prize`] : [])].map((t) => (
              <div key={t} style={{ display: "flex", padding: "7px 12px", border: `1px solid ${INK}`, background: BG }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ width: 400, display: "flex", alignItems: "center", justifyContent: "center", paddingRight: 72 }}>
          <img src={portrait} width={328} height={328} alt="" style={{ objectFit: "cover", border: `1px solid ${INK}` }} />
        </div>
      </div>
    ),
    size,
  );
}
