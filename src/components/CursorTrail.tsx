"use client";
import { useEffect } from "react";

/** A short trail of grid-snapped squares behind the pointer. Pure decoration: the cursor itself is
 *  OS-drawn, so this never adds input lag. Fine pointers only; off for reduced motion. */
export function CursorTrail() {
  useEffect(() => {
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const G = 8, STEP = 28, MAX = 10;
    let lx = -999, ly = -999, live = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || Math.hypot(e.clientX - lx, e.clientY - ly) < STEP || live >= MAX) return;
      lx = e.clientX; ly = e.clientY;
      const sq = document.createElement("i");
      sq.className = "trail" + ((e.target as Element | null)?.closest?.("a, button, [role=button], [role=tab]") ? " on" : "");
      const x = Math.round(lx / G) * G - 3, y = Math.round(ly / G) * G - 3;
      document.body.appendChild(sq);
      live++;
      sq.animate(
        [{ transform: `translate(${x}px,${y}px)`, opacity: 0.6 }, { transform: `translate(${x}px,${y}px) scale(.5)`, opacity: 0 }],
        { duration: 520, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" },
      ).finished.catch(() => {}).finally(() => { sq.remove(); live--; });
    };
    addEventListener("pointermove", onMove, { passive: true });
    return () => removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
