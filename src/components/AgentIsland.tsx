"use client";
import { useEffect } from "react";

/** Mounts the agent controller onto the server-rendered shell. Renders nothing itself. */
export function AgentIsland() {
  useEffect(() => {
    let cleanup: (() => void) | undefined, gone = false;
    void import("@/client/agent").then(({ mountAgent }) => {
      const shell = document.getElementById("shell");
      if (!gone && shell) cleanup = mountAgent(shell);
    });
    return () => { gone = true; cleanup?.(); };
  }, []);
  return null;
}
