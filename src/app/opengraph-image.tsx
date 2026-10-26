import { ImageResponse } from "next/og";
import { SITE } from "@/content/site";

export const alt = SITE.title;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STEPS: [string, "ok" | "x" | "fb"][] = [["visitor", "ok"], ["scope + guard", "ok"], ["gpt-oss-120b", "x"], ["gpt-oss-20b", "fb"], ["grounded answer", "ok"]];

export default function OgImage() {
  const line = "rgba(176,168,155,.28)";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f9f8f5", color: "#171717",
        backgroundImage: `linear-gradient(${line} 1px, transparent 1px), linear-gradient(90deg, ${line} 1px, transparent 1px)`, backgroundSize: "40px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 24, color: "#6b6964" }}>
          <div style={{ width: 12, height: 12, background: "#1f7a45" }} />
          Bangalore, Karnataka · mohammad-rizwan.tech
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -4, lineHeight: 1 }}>Syed Mohammad Rizwan</div>
          <div style={{ fontSize: 40, marginTop: 20, color: "#4f4d48" }}>AI engineer. I build reliable AI agents.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 22 }}>
          {STEPS.map(([s, k], i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {i > 0 && <div style={{ color: "#6b6964" }}>→</div>}
              <div style={{ display: "flex", padding: "8px 14px", border: `1px ${k === "ok" ? "solid" : "dashed"} ${k === "x" ? "#b93a0b" : k === "fb" ? "#8a5300" : "#171717"}`,
                color: k === "x" ? "#b93a0b" : k === "fb" ? "#8a5300" : "#171717", textDecoration: k === "x" ? "line-through" : "none", background: i === 4 ? "#171717" : "#f9f8f5", ...(i === 4 ? { color: "#fff" } : {}) }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
