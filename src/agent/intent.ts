import { EVENTS, mentionsTool, PROJECTS, TOOLKIT, toolUses, type Event, type ToolUse } from "@/content/data";
import type { Project } from "@/content/types";

/** One reading of a visitor's question, shared by the fact answers, the router, the tool policy and the
 *  panel fallback: what kind of thing is asked about decides which panel is evidence for the answer. */

/** Which part of his profile a question is about; none means the whole profile. */
export type ProfileFocus = "events" | "work" | "education";
const FOCUS: [ProfileFocus, RegExp][] = [
  ["events", /\b(won|win|wins|winning|prizes?|awards?|achiev\w*|hackathons?|events?|competitions?|contests?|ctfs?)\b/i],
  ["work", /\b(jobs?|employers?|company|companies|works? at|work experience|experience|intern\w*|novulis|supraja|employ\w*|currently|career|roles?)\b/i],
  ["education", /\b(educat\w*|stud(y|ied|ies)|college|university|degree|cgpa|gpa|grades?|school|b\.?tech|graduat\w*|masters?|master(’|')s|phd|ph\.d|m\.?tech|mba|postgrad\w*|higher studies|qualifications?)\b/i],
];
export const profileFocus = (text: string): ProfileFocus | undefined => FOCUS.find(([, r]) => r.test(text))?.[0];

// a group of projects asked about by what they are: "AI projects", "projects related to AI", "what has he built with Supabase?"
const LIST_Q = /\b(projects|apps|applications|things|builds|which (projects?|apps?|ones?)|any (projects?|apps?)|(show|list)\b[^?]{0,24}\bwork|(what|anything)\b[^?]{0,24}\b(built|build|made|make|shipped)|(has|did) he (built|build|made|make|shipped|done))\b/i;
// questions that want reasoning, not a list: the model answers those
export const REASONING = /\b(how(?! (much|many|long))|why|explain|compare|versus|vs\.?|difference|best|strongest|most|favou?rite|hardest|biggest)\b/i;

const AI_TAGS = ["agents", "multi-agent", "ai", "rag", "voice", "classifier"];
const isAi = (p: Project) => p.tags.some((t) => AI_TAGS.includes(t)) || p.stack.some((s) => /\b(groq|gemini|openai|langgraph|whisper|deepgram|llm)/i.test(s));
/** Words visitors use for a group that no tag or stack name spells out. */
const ALIASES: [RegExp, string, (p: Project) => boolean][] = [
  [/\b(ai|a\.i\.|artificial intelligence|llms?|gen ?ai|generative|machine learning|ml|language models?|agentic)\b/i, "AI", isAi],
  [/\b(agents?|multi-?agent)\b/i, "agents", (p) => p.tags.includes("agents")],
  [/\bfull[ -]?stack|web apps?\b/i, "full-stack", (p) => p.tags.includes("full-stack")],
  [/\breal[ -]?time\b/i, "realtime", (p) => p.tags.includes("realtime")],
  [/\b(blockchain|crypto|web3)\b/i, "web3", (p) => (p.keywords ?? []).includes("web3")],
  [/\b(iot|embedded|robots?|robotics|hardware)\b/i, "hardware", (p) => p.tags.includes("hardware")],
  [/\b(mobile|android|ios|phone apps?)\b/i, "mobile", (p) => p.tags.includes("mobile") || p.stack.some((s) => /react native|expo/i.test(s))],
];
// tags too broad to sort projects by, and toolkit names that are also everyday words ("the rest of", "render")
const NOT_TOPICS = new Set(["team", "personal", "team project", "phone as head", "ultrasonic sensor", "servo motors"]);
const NOT_TOOL_TOPICS = new Set(["REST APIs", "Render"]);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const strip = (s: string) => s.toLowerCase().replace(/\s+\d+(\.\d+)?$/, "").trim(); // "Next.js 16" → "next.js", "Java 21" → "java"
/** Every name a project goes by in its own data: tags, keywords, stack. */
const SPELLED = new Map(PROJECTS.flatMap((p) => [...(p.keywords ?? []), ...p.stack, ...p.tags].map((x) => [strip(x), x.replace(/\s+\d+(\.\d+)?$/, "")] as const)).reverse());
const NAMES = [...SPELLED.keys()].filter((n) => n.length > 1 && !NOT_TOPICS.has(n));
const nameRe = (n: string) => new RegExp(`(?<![\\w.-])${esc(n)}s?(?![\\w-])`, "i");
const NAME_RES = NAMES.map((n) => [n, nameRe(n)] as const);
const goesBy = (p: Project, n: string) => [...p.tags, ...(p.keywords ?? []), ...p.stack].some((x) => strip(x) === n || nameRe(n).test(x));

export interface Topic { label: string; ids: string[]; elsewhere: ToolUse[] }
/** The topics a question names, each with the projects it covers. A shorter name inside a longer one that also
 *  matched ("voice" inside "Ten Days of Voice Agents") is the same topic, not a second one. */
export function topicsIn(text: string): Topic[] {
  const found: Topic[] = [];
  for (const [re, label, test] of ALIASES) if (re.test(text)) found.push({ label, ids: PROJECTS.filter(test).map((p) => p.id), elsewhere: [] });
  const names = NAME_RES.filter(([, re]) => re.test(text)).map(([n]) => n);
  for (const n of names) {
    // "mobile app" is the "mobile" alias again; "voice" inside "ten days of voice agents" is the longer name
    if (names.some((m) => m !== n && m.includes(n)) || found.some((t) => t.label.toLowerCase() === n) || ALIASES.some(([re, label]) => found.some((t) => t.label === label) && re.test(n))) continue;
    found.push({ label: SPELLED.get(n) ?? n, ids: PROJECTS.filter((p) => goesBy(p, n)).map((p) => p.id), elsewhere: [] });
  }
  // a toolkit item no project lists by name ("Azure", "LangGraph" in a skill): where it shows instead
  for (const tool of TOOLKIT.flatMap(([, l]) => l)) {
    if (NOT_TOOL_TOPICS.has(tool) || !mentionsTool(text, tool) || found.some((t) => mentionsTool(t.label, tool))) continue;
    const uses = toolUses(tool);
    found.push({ label: tool.replace(/\s*\(.*\)$/, ""), ids: uses.filter((u) => u.href.startsWith("#") && u.href !== "#other" && u.href !== "#work").map((u) => u.href.slice(1)), elsewhere: uses.filter((u) => !u.href.startsWith("#") || u.href === "#other" || u.href === "#work") });
  }
  if (/\bazure\b/i.test(text) && !found.some((t) => /azure/i.test(t.label))) found.push({ label: "Azure", ids: [], elsewhere: toolUses("Azure App Service") });
  return found;
}

export interface Filter { label: string; projects: Project[]; elsewhere: ToolUse[] }
/** "AI projects", "projects related to AI", "what has he built with React and Supabase?": the projects that fit
 *  every named topic (or any of them, when none fits all). Undefined when the question isn't asking for a group. */
export function projectFilter(text: string, named?: Project, loose = false): Filter | undefined {
  if (named || !LIST_Q.test(text) || (!loose && REASONING.test(text)) || text.split(/\s+/).length > 16) return;
  const topics = topicsIn(text);
  if (!topics.length) return;
  const all = topics.map((t) => new Set(t.ids)), every = PROJECTS.filter((p) => all.every((s) => s.has(p.id)));
  const projects = every.length ? every : PROJECTS.filter((p) => all.some((s) => s.has(p.id)));
  const label = topics.map((t) => t.label).join(every.length ? " and " : " or ");
  return { label, projects, elsewhere: [...new Map(topics.flatMap((t) => t.elsewhere).map((u) => [u.label, u])).values()] };
}

// the words that name one event and no other ("monad", "terralogic", "devfest", "ctf"), from its own title and venue
const EVENT_WORDS_OFF = new Set("hackathon bangalore bengaluru events community school technology voice agents google with".split(" "));
const words = (e: Event) => `${e.title} ${e.where}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !EVENT_WORDS_OFF.has(w) && !/^\d+$/.test(w));
const EVENT_NAMES = EVENTS.map((e) => {
  const own = words(e).filter((w) => !EVENTS.some((o) => o !== e && words(o).includes(w)));
  const also = e.title.match(/capture the flag/i) ? ["ctf"] : e.where.match(/murf/i) ? ["murf"] : [];
  return { e, re: new RegExp(`\\b(${[...own, ...also, ...(e.kind === "attended" ? [] : [e.result.toLowerCase()])].map(esc).join("|")})\\b`, "i") };
});
/** The events a question names: by a word only that event has, or by what happened there ("his first hackathon"). */
export const eventsIn = (text: string): Event[] => EVENT_NAMES.filter(({ re }) => re.test(text)).map(({ e }) => e);
