import type { SessionState } from "./state";

/** One proactive next step from what the conversation has established, or none. Rules, not a model: the chip goes
 *  first in the next-step row, and each one fires only while its condition holds, so it never nags. */
export function nextOffer(state: SessionState | undefined, shownNow: readonly string[] = [], thisTurn: { fitRan?: boolean; resumeOffered?: boolean } = {}): { chip: string; why: string } | null {
  if (!state) return null;
  const projects = new Set([...state.shown, ...shownNow].filter((x) => !x.includes(":") && !["profile", "index", "harness"].includes(x)));
  if (state.visitor.hiringFor && !state.fit && !thisTurn.fitRan) return { chip: "Is he a fit for your role?", why: `the visitor is hiring for ${state.visitor.hiringFor} and no fit check has run` };
  if (projects.size >= 3 && !state.offered.includes("resume") && !state.shown.includes("done:resume") && !thisTurn.resumeOffered) return { chip: "Get resume", why: `${projects.size} projects on screen and the resume not offered yet` };
  return null;
}
