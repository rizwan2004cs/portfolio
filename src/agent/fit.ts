// Role fit: the model extracts requirements from a job description; this matches each one to his work
// deterministically, so every row of the report is evidence the visitor can open, never a claim.
import { MARQUEE_A, MARQUEE_B, PROJECTS, TOOLKIT } from "@/content/data";
import type { Project } from "@/content/types";

export type FitStatus = "match" | "toolkit" | "none";
export interface FitRow { requirement: string; status: FitStatus; projects: { id: string; title: string; evidence: string }[] }

const STOP = new Set("and or the a an with for of to in on at by from over into across like such using use uses build building experience knowledge strong solid good ability skills skill familiarity proficiency years year plus etc we need want looking engineer developer role team work working hands production real world system systems pipeline pipelines app apps application applications service services platform platforms solution solutions development design designing".split(" "));
const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9+#.\s-]/g, " ").replace(/\s+/g, " ").trim();
const words = (t: string) => norm(t).split(" ").filter((w) => w.length > 2 && !STOP.has(w));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "").slice(0, 6);

// what a job description says → the words his write-ups use for it
const ALIASES: [RegExp, string[]][] = [
  [/\bllms?\b|large language model|\bagents?\b|agentic/, ["agent", "langgraph", "model chain", "multi-agent"]],
  [/tool.?calling|function.?calling|tool use/, ["tool-use", "validated action", "agent", "tool"]],
  [/retrieval|vector (db|database|search)|\brag\b|knowledge base|internal docs/, ["rag", "retriev", "pinecone", "embedd", "cite"]],
  [/real.?time|websocket|live updates?/, ["realtime", "live", "push"]],
  [/speech|voice|tts|stt/, ["voice", "speech", "livekit", "deepgram"]],
  [/front.?end|\bui\b|react/, ["react", "next.js"]],
  [/back.?end|\bapis?\b|\brest\b|fastapi/, ["fastapi", "spring boot", "backend"]],
  [/mobile|ios|android|react native/, ["mobile", "expo", "react native", "pwa"]],
  [/multi.?agent|orchestrat/, ["multi-agent", "langgraph", "state machine"]],
  [/postgres|\bsql\b|database/, ["postgres", "supabase", "neon"]],
  [/reliab|fallback|resilien|fault.?toleran/, ["fallback", "checkpoint", "never stalls", "resume"]],
  [/ci.?cd|continuous (integration|delivery|deployment)|devops/, ["github actions", "docker", "azure devops"]],
  [/security|pentest|vapt|vulnerab|exploit|hack(?!athon)|\bctf\b|owasp/, ["security", "vapt", "penetration", "attacker", "filtered server-side", "verified", "ctf"]],
];
// a term counts at the start of a word only: "eval" must not match inside "retrieval"
// …and "hack" must not match "hackathon", the one word in his write-ups that starts with a skill it isn't
const has = (h: string, t: string) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!athon)`).test(h);
const TOOLKIT_TERMS = [...MARQUEE_A, ...MARQUEE_B, ...TOOLKIT.flatMap(([, l]) => l)].map((t) => t.toLowerCase());

function haystack(p: Project) {
  return norm(`${p.title} ${p.oneLiner} ${p.facts.join(" ")} ${p.stack.join(" ")} ${(p.keywords ?? []).join(" ")} ${p.tags.join(" ")}`);
}

function evidence(p: Project, req: string[]): string {
  const facts = [...p.facts, `Built with ${p.stack.join(", ")}.`];
  const scored = facts.map((f) => ({ f, n: req.filter((w) => has(norm(f), w)).length })).sort((a, b) => b.n - a.n);
  return scored[0].n > 0 ? scored[0].f : p.oneLiner;
}

export function fitRows(requirements: string[]): FitRow[] {
  return requirements.slice(0, 8).map((requirement) => {
    const r = norm(requirement);
    const aliases = ALIASES.filter(([re]) => re.test(r));
    // what the requirement says beyond the broad area: "LLM evaluation" is about evaluation, and an LLM project
    // without it is not evidence. When such words exist, at least one must appear in the project.
    const specific = words(aliases.reduce((t, [re]) => t.replace(new RegExp(re.source, "g"), " "), r)).map(stem);
    const terms = [...new Set([...words(r).map(stem), ...aliases.flatMap(([, t]) => t)])];
    const ranked = PROJECTS.map((p) => {
      const h = haystack(p);
      return { p, n: terms.filter((t) => has(h, t)).length, spec: specific.filter((t) => has(h, t)).length };
    }).filter((x) => x.n > 0 && (!specific.length || x.spec > 0)).sort((a, b) => b.n - a.n);
    // the best match, plus a second only when it is nearly as strong (no stray one-word hits)
    const best = ranked[0]?.n ?? 0;
    const top = ranked.filter((x, i) => i === 0 || x.n >= Math.max(2, best * 0.6)).slice(0, 2);
    if (top.length) return { requirement, status: "match" as const, projects: top.map(({ p }) => ({ id: p.id, title: p.title, evidence: evidence(p, terms) })) };
    const own = specific.length ? specific : terms;
    const inToolkit = TOOLKIT_TERMS.some((t) => own.some((w) => t.includes(w)) || r.includes(t));
    return { requirement, status: inToolkit ? ("toolkit" as const) : ("none" as const), projects: [] };
  });
}

/** Plain-text summary for the model and for grounding: exactly what the report shows. */
export const fitSummary = (rows: FitRow[]) =>
  rows.map((r) => `${r.requirement}: ${r.status === "match" ? r.projects.map((p) => `${p.title} (${p.evidence})`).join("; ") : r.status === "toolkit" ? "listed in his toolkit, no public project shows it" : "no public evidence"}`).join(" | ");

/** Requirements out of free text when no model is available: split on lines, commas, semicolons and "and". */
export const roughRequirements = (text: string) =>
  // strip a lead-in up to its colon ("We need an engineer for: …") or just the lead word ("We need Python, …"),
  // and drop trailing questions ("Is he a fit?")
  text.replace(/^.*?\b(need|looking for|requirements?|must have|we want)\b(?:[^:\n]*:)?/i, "").split(/[\n,;•·]|\band\b|[.?!](?:\s|$)/).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 80 && !/^(is|does|can|would|will|how|what)\b/i.test(s)).slice(0, 8);

/** One plain sentence for a fit report: how many requirements his work shows, and which it doesn't. */
export function fitLine(rows: FitRow[]): string {
  const n = rows.filter((r) => r.status === "match").length, gap = rows.filter((r) => r.status !== "match").map((r) => r.requirement);
  return `${n} of ${rows.length} requirements show up in his public projects${gap.length ? `; not shown: ${gap.join(", ")}` : ""}. The report has the evidence for each.`;
}
