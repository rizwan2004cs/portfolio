import { PROJECTS, projectById } from "@/content/data";
import type { Project } from "@/content/types";

/** A side-by-side of two or three projects, one row per aspect, every cell read off the project's own write-up. */
export interface CompareRow { aspect: string; cells: Record<string, string> }
export const ASPECTS = ["Year", "Team", "Stack", "Deployed", "Tests", "Failure handling", "Scale"] as const;

const TESTY = /\b(vitest|jest|pytest|playwright|cypress|junit|test files?|tests?\b|testing)\b/i;
const NUMBERY = /\b\d[\d,.]*\s*(?:[a-z%][a-z-]*\s?){1,3}/i;
const first = (p: Project, re: RegExp) => p.facts.find((f) => re.test(f));

function cell(aspect: (typeof ASPECTS)[number], p: Project): string {
  switch (aspect) {
    case "Year": return String(p.year);
    case "Team": return p.team;
    case "Stack": return p.stack.join(", ");
    case "Deployed": return p.links.live ? `live at ${p.links.live.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : p.links.source ? "source on GitHub, no public demo" : "no public demo or repo";
    case "Tests": { const f = first(p, TESTY); return f ?? "no tests mentioned"; }
    case "Failure handling": return p.fallbacks.length ? `${p.fallbacks.length} handled failure${p.fallbacks.length > 1 ? "s" : ""}: ${p.fallbacks.join(", ")}` : first(p, /\b(fallback|fails?|failure|retry|retries|resume|crash|stall)\b/i) ?? "none described";
    case "Scale": { const f = p.facts.find((x) => NUMBERY.test(x) && !/\bmodel\b/i.test(x)); return f ?? "no figures given"; }
  }
}

/** The table for the given ids (unknown ids are dropped; fewer than two leaves nothing to compare). */
export function compareTable(ids: string[]): { projects: Project[]; rows: CompareRow[] } {
  const projects = [...new Set(ids)].map((id) => projectById(id)).filter((p): p is Project => !!p).slice(0, 3);
  if (projects.length < 2) return { projects, rows: [] };
  return { projects, rows: ASPECTS.map((aspect) => ({ aspect, cells: Object.fromEntries(projects.map((p) => [p.id, cell(aspect, p)])) })) };
}

/** The table as plain lines: what the model and the grounding check read. */
export const compareText = (t: ReturnType<typeof compareTable>) => t.rows.map((r) => `${r.aspect}: ${t.projects.map((p) => `${p.title}: ${r.cells[p.id]}`).join(" · ")}`);

/** Project ids a message names, in the order named: "compare PACK and FinBoom" → ["pack", "finboom"]. */
export function namedProjects(text: string): string[] {
  const t = text.toLowerCase();
  return PROJECTS.map((p) => ({ p, at: t.indexOf(p.title.toLowerCase()) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at).map((x) => x.p.id);
}
