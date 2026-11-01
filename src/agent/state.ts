import { isProjectId, projectById } from "@/content/data";
import type { Visitor } from "./classify";
import { fitRows } from "./fit";
import type { AgentEvent } from "./types";

/** What the conversation has established so far. The server computes it after every turn and sends it as an AG-UI
 *  state snapshot; the client echoes it back with the next message. Nothing in it opens a panel by itself: it only
 *  tells the model and the router what has already happened. */
export interface SessionState {
  /** the project the conversation is about, when one is */
  focus: string | null;
  /** project ids and panels already on screen */
  shown: string[];
  offered: ("resume" | "contact")[];
  visitor: Visitor;
  /** what the visitor has searched for, oldest first */
  topics: string[];
  /** the last fit check: its requirements, which of them his projects show, and the rest */
  fit?: { requirements: string[]; matched: string[]; gaps: string[] };
  /** a question the agent asked this turn, with the answers it can act on; gone after the next turn */
  pending?: { question: string; options: string[] };
}

export const EMPTY_STATE: SessionState = { focus: null, shown: [], offered: [], visitor: {}, topics: [] };
/** A fit check from its requirements, as the match_role tool computes it. */
export const fitFrom = (requirements: string[]): SessionState["fit"] => {
  const rows = fitRows(requirements);
  return { requirements: rows.map((r) => r.requirement), matched: rows.filter((r) => r.status === "match").map((r) => r.requirement), gaps: rows.filter((r) => r.status !== "match").map((r) => r.requirement) };
};
const PANELS = new Set(["profile", "index", "harness", "done:resume", "done:contact"]);
const VISITOR_FIELDS = ["name", "company", "role", "hiringFor"] as const;
const MAX = { list: 20, text: 80, topics: 10 } as const;

const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX.text) : "");
const unique = <T,>(xs: T[]) => [...new Set(xs)];

/** A state from the client is a claim, not a fact: unknown ids and fields are dropped, sizes are capped. */
export function sanitizeState(s: unknown): SessionState {
  if (!s || typeof s !== "object") return EMPTY_STATE;
  const o = s as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
  const visitor: Visitor = {};
  if (o.visitor && typeof o.visitor === "object") for (const f of VISITOR_FIELDS) { const v = str((o.visitor as Record<string, unknown>)[f]); if (v) visitor[f] = v; }
  // a fit is recomputed from its requirements, never trusted as sent
  const reqs = o.fit && typeof o.fit === "object" ? list((o.fit as Record<string, unknown>).requirements).slice(0, 8) : [];
  const pq = o.pending && typeof o.pending === "object" ? str((o.pending as Record<string, unknown>).question) : "", po = o.pending && typeof o.pending === "object" ? list((o.pending as Record<string, unknown>).options).slice(0, 3) : [];
  return {
    focus: isProjectId(str(o.focus)) ? str(o.focus) : null,
    shown: unique(list(o.shown).filter((x) => isProjectId(x) || PANELS.has(x))).slice(0, MAX.list),
    offered: unique(list(o.offered).filter((x): x is "resume" | "contact" => x === "resume" || x === "contact")),
    visitor,
    topics: unique(list(o.topics)).slice(-MAX.topics),
    ...(reqs.length ? { fit: fitFrom(reqs) } : {}),
    ...(pq && po.length >= 2 ? { pending: { question: pq, options: po } } : {}),
  };
}

/** The state after a turn: what the turn's events opened, offered and searched, on top of what was there. */
export function nextState(prev: SessionState, events: AgentEvent[], shown: string[] = [], visitor?: Visitor): SessionState {
  const opened = events.flatMap((e) => (e.type === "tool" && e.name === "open_project" && isProjectId(str(e.args.id)) ? [str(e.args.id)] : []));
  const panels = events.flatMap((e) => (e.type === "panel" && e.panel.id && isProjectId(e.panel.id) ? [e.panel.id] : e.type === "panel" && PANELS.has(e.panel.kind) ? [e.panel.kind] : []));
  const offered = events.flatMap((e): ("resume" | "contact")[] => (e.type === "approval" ? [e.action] : e.type === "tool" && e.name === "offer_resume" ? ["resume"] : e.type === "tool" && e.name === "offer_contact" ? ["contact"] : []));
  const topics = events.flatMap((e) => (e.type === "tool" && e.name === "search_projects" ? [str(e.args.query)].filter(Boolean) : []));
  const fitReqs = events.flatMap((e) => (e.type === "panel" && e.panel.kind === "fit" && e.panel.id ? [e.panel.id.split("|").map(str).filter(Boolean)] : [])).at(-1);
  // a question asked this turn is pending for exactly one turn: it is never carried from prev
  const asked = events.flatMap((e) => (e.type === "tool" && e.name === "ask_visitor" ? [{ question: str(e.args.question), options: (Array.isArray(e.args.options) ? e.args.options : []).map(str).filter(Boolean).slice(0, 3) }] : [])).at(-1);
  const { pending: _gone, ...rest } = prev; void _gone;
  return {
    ...(asked && asked.question && asked.options.length >= 2 ? { pending: asked } : {}),
    ...(fitReqs?.length ? { fit: fitFrom(fitReqs) } : rest.fit ? { fit: rest.fit } : {}),
    focus: opened.at(-1) ?? panels.filter(isProjectId).at(-1) ?? prev.focus,
    shown: unique([...prev.shown, ...shown.filter((x) => isProjectId(x) || PANELS.has(x)), ...opened, ...panels]).slice(-MAX.list),
    offered: unique([...prev.offered, ...offered]),
    visitor: { ...prev.visitor, ...visitor },
    topics: unique([...prev.topics, ...topics]).slice(-MAX.topics),
  };
}

const PANEL_NAMES: Record<string, string> = { profile: "his profile", index: "the project list", harness: "how this agent is built", "done:resume": "his resume", "done:contact": "his contact details" };
const title = (id: string) => projectById(id)?.title ?? PANEL_NAMES[id] ?? id;

/** The "conversation so far" block of the system prompt; empty when nothing has happened yet. */
export function contextBlock(s: SessionState): string {
  const lines: string[] = [];
  if (s.focus) lines.push(`Focused project: ${title(s.focus)}.`);
  if (s.shown.length) lines.push(`Already on screen: ${s.shown.map(title).join(", ")}.`);
  if (s.offered.length) lines.push(`Already offered: ${s.offered.join(", ")}.`);
  const v = s.visitor, who = [v.name, v.company, v.role].filter(Boolean).join(", ");
  if (who || v.hiringFor) lines.push(`Visitor: ${who || "unnamed"}${v.hiringFor ? `, hiring for ${v.hiringFor}` : ""}.${v.name ? " Use their name once, not every turn." : ""}${v.hiringFor ? " Tailor answers to that role." : ""}`);
  if (s.topics.length) lines.push(`Asked about so far: ${s.topics.join(", ")}.`);
  if (s.pending) lines.push(`You just asked: "${s.pending.question}" with the options ${s.pending.options.join(" / ")}; the visitor's reply may be an answer to it.`);
  if (s.fit) lines.push(`Fit so far: ${s.fit.matched.length} of ${s.fit.requirements.length} requirements shown in his projects${s.fit.gaps.length ? `; not shown: ${s.fit.gaps.join(", ")}` : ""}.`);
  return lines.length ? `Conversation so far:\n${lines.join("\n")}` : "";
}
