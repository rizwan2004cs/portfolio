import { isProjectId } from "@/content/data";
import { clearPick, scoreProjects } from "./router";
import { isFocus, isToolName, type ToolName } from "./tools";
import { profileFocus, projectFilter } from "./intent";

export type Decision =
  | { action: "allow"; name: ToolName; args: Record<string, unknown>; detail?: string }
  | { action: "drop"; detail: string; reason: string };

const ASKS: Partial<Record<ToolName, [RegExp, string]>> = {
  offer_resume: [/\b(resume|cv)\b/i, "resume"],
  offer_contact: [/\b(contact|email|hire|hiring|reach|mail|phone|call|available|availability|open to|notice period)\b/i, "contact"],
};

const SITE_Q = /\b(this (site|agent|portfolio|chat)|the site|how (do|does) you work|your (model|harness|guard))\b/i;
export const ABOUT_HIM = /\b(won|win|wins|prizes?|awards?|achiev\w*|hackathons?|events?|competitions?|contests?|educat\w*|stud(y|ied|ies)|college|university|degree|cgpa|gpa|grades?|based|located|location|who is (?:he|rizwan|syed)|background|intern\w*|job|employer|company|works? at|currently|where (?:does|did) he work|novulis|supraja|employ\w*)\b/i;

const WORK_Q = /\b(super ?power|super ?hero|spirit animal|secret weapon|three words|describe him|kryptonite|avenger|pitch|tagline|vibe|motto|in \w+ words|built|build|made|projects?|work|portfolio|shipped|apps?|experience|skills?|stack|hire|role|job|tech\w*|engineer\w*|cod(e|ing)|develop\w*|program\w*|strong\w*|best|good at|ai|agents?|rag|llm\w*|backend|frontend|full.?stack|systems?|fail\w*|architecture|internals?|example|show)\b/i;

/** Every model tool call passes through here before anything reaches the visitor. */
export function checkToolCall(call: { name: string; args: Record<string, unknown> }, ctx: { last: string; subject?: string; shown: string[]; openedThisRun: Set<string> }): Decision {
  if (!isToolName(call.name)) return { action: "drop", detail: `blocked unknown tool ${call.name.slice(0, 40)}`, reason: "unknown tool" };
  const name = call.name;
  const args = { ...call.args };
  let detail: string | undefined;

  if (name === "open_project") {
    if (!isProjectId(String(args.id))) return { action: "drop", detail: `blocked open_project: no project “${String(args.id).slice(0, 30)}”`, reason: "unknown project id" };
    // the latest message points at one project: opening a different one is answering an older question
    const now = clearPick(ctx.last);
    const mentioned = (scoreProjects(ctx.last).find((x) => x.p.id === args.id)?.s ?? 0) > 0;
    if (now && now.id !== args.id && !mentioned) return { action: "drop", detail: `blocked opening ${String(args.id)}: the latest message is about ${now.title}`, reason: `the visitor's latest message is about ${now.title} (id ${now.id}); open that instead` };
    // "how does this site work?" is about the harness: a project nobody named would be noise under it
    if (!mentioned && SITE_Q.test(ctx.last))
      return { action: "drop", detail: `blocked opening ${String(args.id)}: the question is about this site, not a project`, reason: "the visitor asked about this site; call show_harness and do not open a project they did not name" };
    // "has he won anything?" is answered by his profile; a project nobody named is noise under it
    if (!mentioned && ABOUT_HIM.test(ctx.last) && !(ctx.subject && (scoreProjects(ctx.subject).find((x) => x.p.id === args.id)?.s ?? 0) > 0))
      return { action: "drop", detail: `blocked opening ${String(args.id)}: the question is about him, not a project`, reason: "the visitor asked about Rizwan himself; answer from show_profile and do not open a project they did not name" };
    if (!mentioned && !(ctx.subject && (scoreProjects(ctx.subject).find((x) => x.p.id === args.id)?.s ?? 0) > 0) && !WORK_Q.test(ctx.last))
      return { action: "drop", detail: `blocked opening ${String(args.id)}: the message isn’t about his work`, reason: "the visitor did not ask about his projects or skills; answer briefly and show nothing" };
    if (/\b(architecture|internals?|diagram|pipeline|under the hood)\b/i.test(ctx.last) && args.view !== "architecture") {
      args.view = "architecture";
      detail = "switched open_project to the architecture view: you asked how it works";
    }
    const key = `${args.id}:${args.view === "architecture" ? "a" : "c"}`;
    if (ctx.openedThisRun.has(key)) return { action: "drop", detail: `skipped opening ${args.id} twice`, reason: "already opened this turn" };
    ctx.openedThisRun.add(key);
  }
  const subject = ctx.subject ?? ctx.last;
  // the full list only answers broad questions; "what did he build at Impact Lab?" has one clear answer (DUO)
  const pick = clearPick(subject);
  if (name === "list_projects" && pick)
    return { action: "drop", detail: `blocked the full list: the question points at ${pick.title}`, reason: `the question is about ${pick.title}; open that project instead` };
  // the harness is only for questions about this site itself; "how does NGO handle failures?" or
  // "ask about Rizwan" must go to the project or his profile instead
  if (name === "show_harness") {
    const aboutSite = /\b(this (site|agent|portfolio|chat|page)|site|website|harness|you|your|guard|cache|router|fallback|gpt|model|offline|break)\b/i.test(ctx.last);
    if (scoreProjects(subject)[0].s >= 10 && !/\b(this (site|agent|portfolio|chat)|you|your)\b/i.test(ctx.last))
      return { action: "drop", detail: "blocked show_harness: the question names a project", reason: "the question is about a named project; open that project instead" };
    if (!aboutSite)
      return { action: "drop", detail: "blocked show_harness: not a question about this site", reason: "not about this site; for questions about Rizwan himself call show_profile" };
  }

  // the panel shows what the question is about: "AI projects" lists those, "has he won anything?" shows his events
  if (name === "list_projects" && !(Array.isArray(args.ids) && args.ids.length)) {
    const group = projectFilter(ctx.last, undefined, true);
    if (group && group.projects.length > 1) { args.ids = group.projects.map((p) => p.id); detail = `listed only the ${group.projects.length} projects that match “${group.label}”`; }
  }
  if (name === "show_profile" && !isFocus(args.focus)) {
    const focus = profileFocus(ctx.last);
    if (focus) { args.focus = focus; detail = `showed only his ${focus === "events" ? "events and prizes" : focus}: that’s what you asked about`; }
  }

  // the list and his profile answer questions about his work and about him; under "hello" or "can you hear me" they are noise
  const WORKY = /\b(built|build|made|projects?|work|portfolio|everything|shipped|apps?|experience|skills?|stack|hire|role|job|resume|cv|tech\w*|engineer\w*|cod(e|ing)|develop\w*|program\w*|strong\w*|best|good at|ai|agents?|backend|frontend|full.?stack|systems?)\b/i;
  if (name === "list_projects" && !WORKY.test(ctx.last) && !projectFilter(ctx.last, undefined, true))
    return { action: "drop", detail: "blocked the project list: the message doesn’t ask about his work", reason: "the visitor did not ask about his projects; answer briefly and show nothing" };
  if (name === "show_profile" && !ABOUT_HIM.test(ctx.last) && !profileFocus(ctx.last) && !/\b(he|him|his|rizwan|syed|who)\b/i.test(ctx.last) && !WORKY.test(ctx.last))
    return { action: "drop", detail: "blocked his profile: the message isn’t about him", reason: "the visitor did not ask about Rizwan; answer briefly and show nothing" };

  const ask = ASKS[name];
  if (ask && (!ask[0].test(ctx.last) || ctx.shown.includes(`done:${ask[1]}`)))
    return { action: "drop", detail: `blocked ${name}: the visitor didn’t ask for it`, reason: "visitor did not ask for this" };

  return { action: "allow", name, args, detail };
}
