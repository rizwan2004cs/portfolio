import { EDUCATION, EVENTS, EXPERIENCE, isProjectId, PROFILE, PROJECTS, projectById, roleDetail } from "@/content/data";
import type { ProfileFocus } from "./intent";
import { scoreProjects } from "./router";
import { BAD_OUTPUT, offScope } from "./scope";
import { fitRows, fitSummary } from "./fit";
import type { Emit } from "./types";

export const TOOL_DEFS = [
  { name: "search_projects", description: "Find Rizwan's projects by topic. Returns ids, titles and one-liners.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "open_project", description: "Show one project panel. view='card' for an overview, 'architecture' for engineers.", parameters: { type: "object", properties: { id: { type: "string", enum: PROJECTS.map((p) => p.id) }, view: { type: "string", enum: ["card", "architecture"] } }, required: ["id"] } },
  { name: "match_role", description: "Map a job description or list of requirements to his work. Pass 3-8 short requirement phrases. Shows a fit report and returns the evidence per requirement.", parameters: { type: "object", properties: { requirements: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 } }, required: ["requirements"] } },
  { name: "list_projects", description: "Show Rizwan's projects as a list. Pass ids to list only the projects that fit the question (his AI projects, what he built with Supabase); omit ids for 'what has he built'.", parameters: { type: "object", properties: { ids: { type: "array", items: { type: "string", enum: PROJECTS.map((p) => p.id) } } } } },
  { name: "show_profile", description: "Show Rizwan's profile. focus='events' for hackathons, prizes and events; 'work' for his jobs and internships; 'education' for his degree; omit for who he is.", parameters: { type: "object", properties: { focus: { type: "string", enum: ["events", "work", "education"] } } } },
  { name: "show_harness", description: "Show how THIS portfolio agent is built (guard, cache, models, fallback router). Use for questions about this site, this agent, its model, or what happens if it breaks.", parameters: { type: "object", properties: {} } },
  { name: "offer_resume", description: "Ask the visitor for approval, then open Rizwan's resume.", parameters: { type: "object", properties: {} } },
  { name: "offer_contact", description: "Ask the visitor for approval, then show how to email Rizwan.", parameters: { type: "object", properties: {} } },
  { name: "switch_mode", description: "Frontend tool: switch the visitor's view. Use when they ask for the normal/classic/scrolling site or to go back to the agent.", parameters: { type: "object", properties: { mode: { type: "string", enum: ["classic", "agent"] } }, required: ["mode"] } },
  { name: "suggest", description: "End every turn with 2-3 short next steps (max 5 words each).", parameters: { type: "object", properties: { options: { type: "array", items: { type: "string" }, maxItems: 3 } }, required: ["options"] } },
] as const;

export type ToolName = (typeof TOOL_DEFS)[number]["name"];
const NAMES = new Set<string>(TOOL_DEFS.map((t) => t.name));
export const isToolName = (n: string): n is ToolName => NAMES.has(n);
export const isFocus = (f: unknown): f is ProfileFocus => f === "events" || f === "work" || f === "education";

// in order, so a model describing the site gets the flow right (the router is the last resort, not a dispatcher)
const HARNESS_FLOW = [
  "1. A prompt guard (llama-prompt-guard-2-86m) screens the visitor's message, then a scope filter refuses anything off-topic.",
  "2. Known paths (scripted tours, opening a project, resume, contact) are answered in the browser with no model call; repeated questions come from a response cache.",
  "3. Everything else goes to a model chain: gpt-oss-120b, then gpt-oss-20b, on each Groq key, then Gemini 2.5 Flash. The model can only call closed-world tools that pick content by id.",
  "4. A grounding check verifies every sentence against the facts and drops what it can't support.",
  "5. If every model fails, or the visitor takes the model offline, a deterministic router answers with no AI at all.",
];

/** Closed-world tools: content is always selected by id from the content model; the model never writes it. */
export function runTool(name: ToolName, args: Record<string, unknown>, emit: Emit): Record<string, unknown> {
  switch (name) {
    case "search_projects":
      return { results: scoreProjects(String(args.query ?? "")).filter((x) => x.s > 0).slice(0, 4).map((x) => ({ id: x.p.id, title: x.p.title, oneLiner: x.p.oneLiner, keywords: x.p.keywords })) };
    case "open_project": {
      const p = projectById(String(args.id));
      if (!p) return { error: "unknown project id" };
      emit({ type: "panel", panel: { kind: args.view === "architecture" ? "architecture" : "project", id: p.id } });
      return { id: p.id, title: p.title, team: p.team, facts: p.facts, stack: p.stack, source: p.source };
    }
    case "list_projects": {
      // only the projects asked about; an empty or unknown filter lists everything
      const ids = Array.isArray(args.ids) ? args.ids.map(String).filter(isProjectId) : [];
      const list = ids.length && ids.length < PROJECTS.length ? PROJECTS.filter((p) => ids.includes(p.id)) : PROJECTS;
      emit({ type: "panel", panel: { kind: "index", ...(list !== PROJECTS ? { id: list.map((p) => p.id).join(",") } : {}) } });
      return { shown: list.map((p) => ({ id: p.id, title: p.title, oneLiner: p.oneLiner, keywords: p.keywords })) };
    }
    case "show_profile": {
      // the part of his profile the question is about: "has he won anything?" shows events, not his photo and links
      const focus = isFocus(args.focus) ? args.focus : undefined;
      emit({ type: "panel", panel: { kind: "profile", ...(focus ? { id: focus } : {}) } });
      if (focus === "events") return { events: EVENT_LINES };
      if (focus === "work") return { work: EXPERIENCE.map((x) => `${x.role} at ${x.title} (${x.when}): ${roleDetail(x)}`) };
      if (focus === "education") return { education: PROFILE.education, earlier: EDUCATION.earlier.map(([s, g]) => `${s}: ${g}`) };
      return { ...PROFILE, events: EVENT_LINES };
    }
    case "match_role": {
      const reqs = (Array.isArray(args.requirements) ? args.requirements : []).map((r) => String(r).replace(/\|/g, "/").trim().slice(0, 80)).filter(Boolean).slice(0, 8);
      if (!reqs.length) return { error: "no requirements given" };
      const rows = fitRows(reqs);
      emit({ type: "panel", panel: { kind: "fit", id: reqs.join("|") } });
      return { report: fitSummary(rows), matched: rows.filter((r) => r.status === "match").length, total: rows.length };
    }
    case "show_harness":
      emit({ type: "panel", panel: { kind: "harness" } });
      return { flow: HARNESS_FLOW, note: "visitors can take the model offline with the Kill the model switch" };
    case "offer_resume":
      emit({ type: "approval", action: "resume" });
      return { status: "asked visitor for approval" };
    case "offer_contact":
      emit({ type: "approval", action: "contact" });
      return { status: "asked visitor for approval" };
    case "switch_mode":
      emit({ type: "frontend", name: "switch_mode", args: { mode: args.mode === "agent" ? "agent" : "classic" } });
      return { ok: true };
    case "suggest": {
      const options = tidyOptions(args.options);
      if (options.length) emit({ type: "suggest", options }); // none usable → the harness adds its own
      return { ok: true };
    }
  }
}

/** A chip is only useful if clicking it does something the agent can actually do. */
const INTENT = /^(everything he.?s built|what has he built\??|how does this site work\??|get (his )?resume|resume|contact( rizwan)?|view (his )?profile|(his )?profile|who is (he|rizwan)\??|internals of .+|open .+|how does .+ handle failures\??|(switch to )?classic( site)?|(list|show)( me)?( all)?( his)? (work|projects))$/i;
export const knownIntent = (o: string) => INTENT.test(o) || PROJECTS.some((p) => o.toLowerCase().includes(p.title.toLowerCase()));

/** "View PACK details", "See PACK", "Show me PACK" all mean "Open PACK"; "PACK architecture" means "Internals of PACK".
 *  One wording per action, so two chips never do the same thing. */
export function canonical(o: string): string {
  const p = PROJECTS.find((x) => o.toLowerCase().includes(x.title.toLowerCase()));
  if (!p) return o;
  if (/\b(architecture|internals?|under the hood|pipeline|diagram)\b/i.test(o)) return `Internals of ${p.title}`;
  if (new RegExp(`^(open|view|see|show( me)?|explore|check out|look at)\\s+(the\\s+)?${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+(details|project|card|write-?up))?$`, "i").test(o)) return `Open ${p.title}`;
  return o;
}

/** Model-written chips are visitor-facing text: trim, capitalise, dedupe, and drop anything long, off-scope,
 *  banned, or that maps to nothing the agent can do ("Switch mode", "Ask about projects"). */
export function tidyOptions(raw: unknown): string[] {
  const seen = new Set<string>();
  return (Array.isArray(raw) ? raw : [])
    .filter((o): o is string => typeof o === "string")
    .map((o) => o.replace(/^["'\s]+|["'.\s]+$/g, "").replace(/\s+/g, " "))
    .filter((o) => o.length >= 2 && o.length <= 48 && !offScope(o) && !BAD_OUTPUT.test(o) && knownIntent(o))
    .map((o) => o[0].toUpperCase() + o.slice(1))
    .map(canonical)
    .filter((o) => !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase()))
    .slice(0, 3);
}

/** Extra vocabulary each tool legitimately puts in play, for the grounding check. */
export function toolContext(name: ToolName): string {
  switch (name) {
    case "match_role": return "requirements requirement role fit report match matches evidence toolkit public projects";
    case "list_projects": return PROJECTS.map((p) => `${p.title} ${p.oneLiner} ${p.tags.join(" ")} ${p.stack.join(" ")}`).join(" ");
    case "show_harness": return `model models request requests visitor answer prompt guard llama-prompt-guard scope filter response cache cached scripted tours gpt-oss-120b gpt-oss-20b gemini fallback deterministic router outage offline grounding tokens panels tools approval routed ${HARNESS_FLOW.join(" ")}`;
    case "offer_resume": return "resume pdf approval approve open tab new";
    case "offer_contact": return "email contact approval approve address mail";
    case "show_profile": return `${JSON.stringify(PROFILE)} ${EVENT_LINES.join(" ")}`;
    default: return "";
  }
}

/** Baseline every answer may draw on: who Rizwan is and what his projects are called. */
/** Hackathons, prizes and events as plain lines: tool results and grounding source. */
// phrased to be read aloud: these lines double as extractive answers when a model sentence fails grounding
export const EVENT_LINES = EVENTS.map((e) => e.say);
const EVENT_DETAIL = EVENTS.map((e) => `${e.title}, ${e.where} (${e.when}): ${e.result}. ${e.body}`).join(" ");
export const BASE_SOURCE = `${JSON.stringify(PROFILE)} ${EVENT_LINES.join(" ")} ${EVENT_DETAIL} ${PROJECTS.map((p) => `${p.title} ${p.oneLiner} ${(p.keywords ?? []).join(" ")}`).join(" ")}`;

/** Everything the content model says, for checking "closest thing" pointers after a refusal. */
export const ALL_FACTS_SOURCE = `${BASE_SOURCE} ${PROJECTS.map((p) => `${p.facts.join(" ")} ${p.stack.join(" ")}`).join(" ")}`;
