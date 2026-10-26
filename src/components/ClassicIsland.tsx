"use client";
import { useEffect } from "react";

/** Mounts the classic-page behaviour onto the server-rendered content. Renders nothing itself. */
export function ClassicIsland() {
  useEffect(() => {
    let cleanup: (() => void) | undefined, gone = false;
    void import("@/client/classic").then(({ mountClassic }) => {
      const root = document.getElementById("classic");
      if (!gone && root) cleanup = mountClassic(root);
    });
    return () => { gone = true; cleanup?.(); };
  }, []);
  return null;
}
