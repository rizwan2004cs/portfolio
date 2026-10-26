import { ImageResponse } from "next/og";

// the same mark as icon.svg, as a PNG: iOS home screens and some search results don't use SVG icons
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#171717" }}>
      <div style={{ width: 45, height: 45, background: "#f9f8f5" }} />
    </div>,
    size,
  );
}
