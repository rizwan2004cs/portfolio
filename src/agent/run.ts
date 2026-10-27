import { EVENTS, EXPERIENCE, experienceLine, GAPS, PROFILE, PROJECTS, projectById, TOOLKIT, toolUses, WHY_HIM } from "@/content/data";
import type { Project } from "@/content/types";
import { clean, dedupeSentences, leakedCalls, repairLeak } from "./clean";
import { bestFact, groundAnswer } from "./grounding";
import { ABOUT_HIM, checkToolCall } from "./policy";
import { fitLine, fitRows } from "./fit";
import { profileFocus, projectFilter } from "./intent";
import { clearPick, ctxNext, DEFAULT_NEXT, factAnswer, router } from "./router";
import { BAD_OUTPUT, CODEY, GUARD_REFUSAL, isRefusal, offScope, REFUSAL, stripCode } from "./scope";
import { BEHAVIOR, PLAYFUL_IMAGES, PLAYFUL_WORDS, ruleKind } from "./behavior";
import { decide, type Classification, type Classifier } from "./classify";
import { ALL_FACTS_SOURCE, EVENT_LINES, runTool, tidyOptions, toolContext, type ToolName } from "./tools";
import { ModelError, type AgentEvent, type ChatMessage, type Emit, type ModelClient, type RunInput, type RunMeta, type Screen } from "./types";

/** Everything the site says about him, compact: the model reasons over this directly instead of looking it up. */
export const KNOWLEDGE = [
  `Profile: ${PROFILE.name}, ${PROFILE.role}, ${PROFILE.location}. ${PROFILE.summary} Education: ${PROFILE.education}.`,
  `Work: ${EXPERIENCE.map((x) => `${x.title}: ${x.body} (${x.when})`).join("; ")}.`,
  `Experience: ${experienceLine()}`,
  `Why him: ${WHY_HIM}`,
  `Gaps: ${GAPS}`,
  `Availability: this site does not say whether he is looking for a role; for hiring questions, offer his contact details (offer_contact).`,
  `Events: ${EVENTS.map((e) => e.say).join(" ")}`,
  `Toolkit: ${TOOLKIT.map(([h, l]) => `${h}: ${l.map((t) => { const u = toolUses(t).map((x) => x.label); return u.length ? `${t} (used in ${u.join(", ")})` : t; }).join(", ")}`).join("; ")}.`,
  ...PROJECTS.map((p) => `[${p.id}] ${p.title} (${p.year}; ${p.team}): ${p.oneLiner} Facts: ${p.facts.join(" ")} Stack: ${p.stack.join(", ")}.`),
].join("\n");

export const SYSTEM = `You are the agent on Syed Mohammad Rizwan's portfolio: a sharp, warm host who knows his work in depth. Rizwan is an AI engineer in Bangalore who builds AI agents and the systems around them.
What you know (the only source of truth; never add to it):
${KNOWLEDGE}
How to answer:
- Answer the visitor's latest message directly and specifically, in up to four short plain sentences. Earlier messages are context; never re-answer them. Reason across his work: compare projects, explain trade-offs, say which project best shows a skill.
- If the visitor pastes a job description or lists requirements, call match_role with the 3-8 key requirements as short phrases, then summarise its report in two or three sentences: what matches (with project names) and what shows no public evidence. Use only the report.
- The toolkit lists skills (call it "his toolkit", never "his resume"); "used in" names where a tool shows. A tool with no "used in" is toolkit only: say so plainly. Never tie a tool to a project or job unless the toolkit or a project fact says so, and never describe his job at Novulis Consulting beyond its Work line. Each Work line describes only its own role: never carry one role's duties to another.
- Recruiter questions get real answers from the lines above: "why hire him" from Why him, "weaknesses" from Gaps, "years of experience" from Experience, "did he build it alone" from the project's team, "is he open to work" with the Availability line. Never call anything "production-ready", "at scale" or "in production" unless a fact says so.
- A stack item is only a name: say what it does only when a fact says so ("built on Lovable", never "Lovable's safety layer").
- Never state or guess anything about his body, gender, sexuality, age, relationships, family, religion or health, and never repeat a claim about him the knowledge doesn't support: say "His write-up only covers his work."
- Use only the knowledge above. If it doesn't cover something, say "His write-up doesn't cover that" for the specific thing. Never guess, never generalise, never say whether he is looking for a job.
- Show, don't just tell: open the most relevant project with open_project (view="architecture" for engineering questions), at most two per answer; list_projects for "what has he built", with ids when they ask for a kind of project ("his AI projects"); show_profile for questions about him, with focus="events" for events or prizes and focus="work" for his jobs; show_harness only for questions about this site itself. Don't re-open anything listed as already on screen.
- Third person ("his", "Rizwan's"). No markdown, no lists, no apologies, no "Would you like…".
- Anything unrelated to Rizwan or this site: one short sentence, e.g. "Outside my lane. I only cover Rizwan's work."
- Before anything leaves the page (resume, contact details) call offer_resume / offer_contact.
- You already know every fact, so do it all in ONE reply: write your sentences and, in the same message, call open_project (or another panel tool) and suggest with 2-3 short follow-ups the visitor would want next.`;

export interface RunDeps {
  models: ModelClient[];
  screen: Screen;
  signal: AbortSignal;
  /** sorts each message into a kind first; without it the word rules decide */
  classify?: Classifier;
}

const MAX_STEPS = 4;
/** Event lines are fair fallback answers only for questions about events, hackathons or prizes. */
const EVENT_Q = /hackathon|event|prize|\bwon\b|\bwin\b|built at|build at|impact lab|monad|terralogic|murf|devfest|ctf|superteam|prompt to production/i;
const eventLinesFor = (q: string) => (EVENT_Q.test(q) ? EVENT_LINES : []);

/** Next steps that fit the panel on screen when no project is open. */
const NEXT_FOR: Record<string, string[]> = {
  profile: ["Everything he’s built", "Get resume", "Contact Rizwan"],
  index: ["How does this site work?", "Get resume", "Contact Rizwan"],
  harness: ["Everything he’s built", "Internals of PACK", "Get resume"],
  fit: ["Get resume", "Contact Rizwan", "Everything he’s built"],
};

/** What the harness says when every model sentence was dropped but something useful is on screen. */
const SAY_FOR: Record<string, string> = {
  contact: "His email, LinkedIn and GitHub are one click away.",
  resume: "His resume is ready when you are.",
  profile: "Here’s Rizwan’s profile.",
  harness: "Here’s how this agent is built.",
  index: "Everything he’s built is below.",
};
const MAX_DROPS = 2;

/** One visitor turn through the harness. Emits AgentEvents; resolves with how the turn was answered.
 *  Invariant: every completed turn emits at least one text event and one suggest event. */
const ROUTER = "deterministic router answered · no AI, 0 tokens";

/** Drops sentences that announce something on screen ("Here is his resume", "Opening PACK") when it isn't there. */
const ANNOUNCES = /^(here(’|')?s|here is|here are|opening|showing|pulling up|i(’|')?ve opened|i opened|i(’|')?m opening|let me (show|open)|below is|see (the|his) )/i;
export function narrated(text: string, shownNow: string): { text: string; cut: number } {
  let cut = 0;
  const kept = text.split(/(?<=[.!?])\s+/).filter((sentence) => {
    if (!ANNOUNCES.test(sentence.trim())) return true;
    const resume = /\bresume|\bcv\b/i.test(sentence), contact = /\b(contact|email|phone)\b/i.test(sentence);
    const project = PROJECTS.find((p) => new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(sentence));
    const ok = resume ? /resume/.test(shownNow) : contact ? /contact/.test(shownNow) : project ? shownNow.includes(project.title) : shownNow.trim().length > 0;
    if (!ok) cut++;
    return ok;
  });
  return { text: kept.join(" ").trim(), cut };
}

export async function runAgent(input: RunInput, emit: Emit, deps: RunDeps): Promise<RunMeta> {
  const last = input.turns.at(-1) ?? "";
  // "how does it handle failures?" after "Show me PACK" is about PACK: resolve the pronoun for the policy checks
  // a follow-up points back ("how does it handle failures?", "tell me more about that"); "projects that use AI" does not:
  // "that"/"this" only count in short messages, and never right after a noun as a relative pronoun
  const refersBack = /\b(it|its|they|them|their)\b/i.test(last) || (last.split(/\s+/).length <= 7 && /\b(this|that)\b/i.test(last) && !/\b\w+s? that\b/i.test(last.replace(/\b(about|on|of|with|is|was)\s+that\b/gi, "")));
  const subject = input.turns.length > 1 && !clearPick(last) && refersBack ? `${input.turns.at(-2)} ${last}` : last;
  // the project the visitor is talking about: named now, or named in the turn a pronoun points back to
  const subjectProject = clearPick(subject);
  if (offScope(last)) {
    emit({ type: "trace", step: "scope", detail: "off-scope request refused · 0 tokens", level: "warn" });
    emit({ type: "text", text: REFUSAL });
    emit({ type: "suggest", options: DEFAULT_NEXT });
    return { mode: "scope" };
  }
  // the outer agent: every message is sorted into one kind first (src/agent/behavior.ts says what each kind gets).
  // The prompt guard runs at the same time, so sorting adds no wait to the turns that do reach a model.
  const guarding = input.killModel ? null : deps.screen(last, deps.signal).catch(() => ({ ok: true, note: "unavailable · let through (tools are closed-world)" }));
  // a visitor who took the model offline gets no AI anywhere, the classifier included
  const sorted = await (input.killModel || !deps.classify ? Promise.resolve<Classification>({ kind: ruleKind(last), confidence: 1, source: "rules", note: "rules" }) : deps.classify(last, deps.signal, input.turns.at(-2)));
  const kind = decide(sorted);
  emit({ type: "trace", step: "intent", detail: kind === sorted.kind ? sorted.note : `${sorted.note} · too unsure, treated as ${kind}`, level: "ok" });
  if (BEHAVIOR[kind].reply) {
    emit({ type: "trace", step: "policy", detail: `${kind} · fixed reply from the behaviour policy, no model, no panel · 0 tokens`, level: "info" });
    emit({ type: "text", text: BEHAVIOR[kind].reply!(last) });
    emit({ type: "suggest", options: BEHAVIOR[kind].chips });
    return { mode: "scope" };
  }
  // earlier off-scope turns never reach the model
  const turns = input.turns.map((t, i) => (i < input.turns.length - 1 && offScope(t) ? "[removed: off-scope]" : t));

  // the guard judges only the newest message: an earlier "try to break it" must not taint every later question.
  // With the model killed it is skipped entirely; the deterministic router can't be steered by an injection.
  // one-answer questions (greetings, availability, prizes, who built it) never need a model, so they never risk one:
  // worked out first, so they also skip the guard's round trip (nothing is left for an injection to steer)
  const factual: AgentEvent[] = [];
  const isFact = factAnswer(subject, (e) => factual.push(e));
  const g = input.killModel ? { ok: true, note: "skipped · model offline, router can't be injected" }
    : isFact ? { ok: true, note: "skipped · answered from his facts, no model to steer" } : await guarding!;
  emit({ type: "trace", step: "guard", detail: g.note, level: g.ok ? "ok" : "warn" });
  if (!g.ok) {
    emit({ type: "text", text: GUARD_REFUSAL });
    emit({ type: "suggest", options: DEFAULT_NEXT });
    return { mode: "guard" };
  }

  let spoke = false, visible = false, offered: string[] = [], fitNote: string | null = null;
  let lastProject: Project | undefined, asked: "resume" | "contact" | undefined, lastKind = "", shownFacts: string[] = subjectProject?.facts ?? [];
  const out: Emit = (ev) => {
    if (ev.type === "suggest") { offered = ev.options; return; } // merged with context-aware chips in finish()
    if (ev.type === "text") spoke = true;
    if (ev.type === "panel" && ev.panel.id) lastProject = projectById(ev.panel.id);
    if (ev.type === "approval") asked = ev.action;
    if (ev.type === "panel") lastKind = ev.panel.kind;
    if (ev.type === "panel" || ev.type === "approval" || ev.type === "frontend") visible = true;
    emit(ev);
  };
  // questions about how something works are answered with its architecture, not just its card
  const DEEP = /\b(fail\w*|break\w*|internals?|architecture|pipeline|under the hood|how does|how do)\b/i;
  /** An answer that names exactly one project, with no project on screen yet, puts that project on screen. */
  const openNamed = (text: string) => {
    if (lastProject) return;
    const named = PROJECTS.filter((p) => new RegExp(`\\b${p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
    if (named.length !== 1 || input.shown.includes(named[0].id)) return;
    emit({ type: "trace", step: "harness", detail: `answer names ${named[0].title} · opened it`, level: "info" });
    const args = { id: named[0].id, view: DEEP.test(last) && named[0].pipeline.length ? "architecture" : "card" };
    out({ type: "tool", name: "open_project", args }); runTool("open_project", args, out);
  };
  /** The model answered from what it knows but showed nothing: put the thing the question is about on screen,
   *  so every answer comes with its evidence (the project, his profile, or how this site works). */
  const showContext = () => {
    const panel = (name: ToolName, args: Record<string, unknown>, why: string) => {
      emit({ type: "trace", step: "harness", detail: `nothing on screen · showed ${why}`, level: "info" });
      out({ type: "tool", name, args }); runTool(name, args, out);
    };
    if (subjectProject && !input.shown.includes(subjectProject.id)) {
      const deep = DEEP.test(last) && subjectProject.pipeline.length > 0;
      return panel("open_project", { id: subjectProject.id, view: deep ? "architecture" : "card" }, subjectProject.title);
    }
    if (/\b(this (site|agent|portfolio|chat)|the site|you work|your (model|harness))\b/i.test(last) && !input.shown.includes("harness")) return panel("show_harness", {}, "the harness");
    const group = projectFilter(last, undefined, true);
    if (group && group.projects.length > 1) return panel("list_projects", { ids: group.projects.map((p) => p.id) }, `the ${group.projects.length} projects that match “${group.label}”`);
    const focus = profileFocus(last);
    if (ABOUT_HIM.test(last) && !input.shown.includes("profile") && !input.shown.includes(focus ?? "profile")) return panel("show_profile", focus ? { focus } : {}, focus === "events" ? "his events and prizes" : focus ? `his ${focus}` : "his profile");
  };
  const finish = (meta: RunMeta): RunMeta => {
    if (!spoke) {
      // the model said nothing usable: answer from the facts on screen before falling back to a stock line;
      // "what is it built with?" is answered by the project's stack, which no fact sentence lists
      const p = lastProject ?? subjectProject;
      const stack = !asked && p && /\b(built (with|on|using)|made (with|in)|stack|tech(nolog\w*)?|frameworks?|languages?|tools? (does|did) (it|he))\b/i.test(last) ? `${p.title} is built with ${p.stack.join(", ")}.` : null;
      // "has he won anything?" has no word long enough for bestFact: answer with the prize itself
      const won = EVENTS.filter((e) => e.kind === "won").map((e) => e.say);
      const prize = !asked && !stack && won.length && /\b(won|wins?|winning|prizes?|awards?)\b/i.test(last) ? `${won.join(" ")}${won.length === 1 ? " That’s his only prize so far." : ""}` : null;
      // event lines first: "what did he build at Monad Blitz?" is answered by the event, not by PACK's internals
      const fact = stack ?? prize ?? (!asked && (shownFacts.length || eventLinesFor(last).length) ? bestFact([...eventLinesFor(last), ...shownFacts], last, p?.title ?? "") : null);
      out({ type: "text", text: fact ?? SAY_FOR[asked ?? lastKind] ?? (lastProject ? `Here’s ${lastProject.title}.` : "Here’s what I found.") });
      if (fact) openNamed(fact); else meta.stock = true;
    }
    // chips: the model's valid ones first, topped up with next steps that fit what is on screen
    const context = lastProject ? ctxNext(lastProject) : NEXT_FOR[lastKind] ?? DEFAULT_NEXT;
    const seen = new Set<string>();
    const options = [...offered, ...context].filter((o) => !seen.has(o.toLowerCase()) && seen.add(o.toLowerCase())).slice(0, 3);
    if (options.length > offered.length) emit({ type: "trace", step: "harness", detail: offered.length ? "topped up the next-step chips" : "added next-step chips", level: "info" });
    emit({ type: "suggest", options });
    return meta;
  };
  const fallbackToRouter = (detail: string): RunMeta => {
    emit({ type: "trace", step: "fallback", detail, level: "warn" });
    router(subject, out);
    return finish({ mode: "router" });
  };

  // one-answer questions (availability, experience, who built it) never need a model, so they never risk one
  if (isFact) {
    emit({ type: "trace", step: "facts", detail: "a question with one factual answer · answered from his facts, no model call", level: "ok" });
    factual.forEach(out);
    return finish({ mode: "facts" });
  }
  if (input.killModel) { emit({ type: "trace", step: "model", detail: "offline · taken down by visitor", level: "err" }); return fallbackToRouter(ROUTER); }
  if (!deps.models.length) { emit({ type: "trace", step: "model", detail: "no model configured", level: "err" }); return fallbackToRouter(ROUTER); }

  const base: ChatMessage[] = [
    { role: "system", content: SYSTEM + (input.shown.length ? `\nAlready on screen: ${input.shown.join(", ")}.` : "") + (BEHAVIOR[kind].tone ? `\n${BEHAVIOR[kind].tone}` : "") },
    ...turns.map((t) => ({ role: "user" as const, content: t })),
  ];

  // One run, one conversation: if a model fails mid-run, the next model picks up the same messages
  // (tool results included), so the visitor never gets a restarted or second answer.
  const messages = base.map((m) => ({ ...m })) as ChatMessage[];
  const opened = new Set<string>();
  const onScreen = [...new Set([...input.shown, ...(subjectProject ? [subjectProject.id] : [])])].map((id) => projectById(id)).filter((p): p is Project => !!p);
  let looked = false, tools = 0, drops = 0, lastTitle: string | null = subjectProject?.title ?? null, lastFacts: string[] = subjectProject?.facts ?? [], mi = 0;
  // facts of projects the visitor already has on screen are fair sources for follow-ups ("what vector DB does it use?")
  // the model was given every fact, so every fact is a fair source; number, prize and scope checks stay relational
  let source = `${ALL_FACTS_SOURCE} ${KNOWLEDGE} ${onScreen.map((p) => `${p.facts.join(" ")} ${p.stack.join(" ")}`).join(" ")}`;
  // a playful answer may use the question's own framing ("his superpower is…"): those words are the visitor's, not claims
  if (kind === "playful") source += ` ${last} superpower super power superhero hero spirit animal secret weapon kryptonite vibe tagline motto pitch words describe character would be like rate limits free tier ${PLAYFUL_IMAGES.join(" ")} ${PLAYFUL_WORDS.join(" ")}`;
  const texts: string[] = [];
  const t0 = Date.now();
  // keys still resting from an earlier rate limit are skipped without a call: one quiet line, not a red row each;
  // a mid-answer handoff is announced for the model that actually takes over
  let resting: string[] = [], handoff = false;
  const flushSkips = (next: string) => {
    if (resting.length) emit({ type: "trace", step: "model", detail: `${resting.join(", ")} still resting after rate limits · skipped → ${next}`, level: "info" });
    if (handoff && next !== "deterministic router") emit({ type: "trace", step: "handoff", detail: `${next} picks up mid-answer, with the tool results so far`, level: "warn" });
    resting = []; handoff = false;
  };
  for (;;) {
    const model = deps.models[mi];
    try {
      for (let step = messages.filter((m) => m.role === "assistant").length; step < MAX_STEPS; step++) {
        let answered = false;
        const s0 = Date.now();
        const msg = await model.complete(messages, deps.signal);
        // an empty reply with nothing said yet is a failure like any other: the next model in the chain gets the turn
        if (!msg.content?.trim() && !msg.tool_calls?.length && !texts.length && deps.models[mi + 1]) throw new ModelError("returned nothing");
        flushSkips(model.name); // this model answered: say which resting keys were passed over to reach it
        const leak = leakedCalls(msg.content ?? "");
        if (leak.calls.length) {
          emit({ type: "trace", step: "harness", detail: `model typed ${leak.calls.length} tool call${leak.calls.length > 1 ? "s" : ""} as text · cut from the answer and run properly`, level: "info" });
          msg.content = leak.text; msg.tool_calls = [...(msg.tool_calls ?? []), ...leak.calls];
        }
        const called = (msg.tool_calls ?? []).map((c) => c.function.name).filter((n) => n !== "suggest");
        const did = called.length ? `called ${[...new Set(called)].join(", ")}` : msg.content?.trim() ? "wrote the answer" : "returned nothing";
        emit({ type: "trace", step: "model", detail: `${model.name} · ${Date.now() - s0}ms · ${did}`, level: "ok" });
        // only the portable fields: provider extras (gpt-oss "reasoning") make the next model in the chain reject the history
        messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.function.name, arguments: c.function.arguments } })) } : {}) });

        if (msg.content) {
          const rep = repairLeak(msg.content);
          if (rep.options || rep.text !== msg.content) emit({ type: "trace", step: "harness", detail: "model typed its next-step chips into the answer · moved them out", level: "info" });
          if (rep.options) out({ type: "suggest", options: tidyOptions(rep.options) });
          const codey = CODEY.test(rep.text);
          let c = clean(codey ? stripCode(rep.text) : rep.text);
          if (codey) emit({ type: "trace", step: "output guard", detail: "cut code-shaped lines from the answer", level: "info" });
          if (BAD_OUTPUT.test(msg.content)) { emit({ type: "trace", step: "output guard", detail: "blocked unsafe model output (a secret, the prompt, or a job-seeking claim)", level: "warn" }); c = REFUSAL; }
          // generic model refusals ("I can't comply.") speak in the site's own voice
          else if (/^(sorry|i(’|')?m sorry|i can(’|')?t|i cannot|i won(’|')?t|i(’|')?m unable)\b/i.test(c) && !isRefusal(c)) { emit({ type: "trace", step: "harness", detail: "normalised a generic refusal", level: "info" }); c = REFUSAL; }
          if (c) { texts.push(c); answered = true; }
        }
        const calls = msg.tool_calls ?? [];
        if (!calls.length) break;
        for (const tc of calls) {
          let args: Record<string, unknown> = {};
          try {
            const parsed = JSON.parse(tc.function.arguments || "{}");
            args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
          } catch {
            emit({ type: "trace", step: "harness", detail: "rejected malformed tool args", level: "warn" });
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "malformed arguments" }) });
            drops++;
            continue;
          }
          // "Outside my lane." with his profile card under it reads as an answer: a refusal shows nothing
          if (tc.function.name !== "suggest" && texts.some(isRefusal)) {
            emit({ type: "trace", step: "policy", detail: `skipped ${tc.function.name}: the answer is a refusal, so nothing goes on screen`, level: "info" });
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: "not allowed: you refused this question; show nothing" }) });
            continue;
          }
          const d = checkToolCall({ name: tc.function.name, args }, { last, subject, shown: input.shown, openedThisRun: opened });
          if (d.action === "drop") {
            drops++;
            emit({ type: "trace", step: "policy", detail: d.detail, level: "info" });
            messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify({ error: `not allowed: ${d.reason}` }) });
            continue;
          }
          if (d.detail) emit({ type: "trace", step: "policy", detail: d.detail, level: "info" });
          out({ type: "tool", name: d.name, args: d.args });
          tools++;
          if (["open_project", "search_projects", "list_projects", "show_profile", "match_role"].includes(d.name)) looked = true;
          const result = runTool(d.name, d.args, out);
          if (d.name === "match_role" && typeof result.total === "number") fitNote = fitLine(fitRows((d.args.requirements as string[]) ?? []));
          source += ` ${JSON.stringify(result)} ${toolContext(d.name)}`;
          if (Array.isArray(result.facts) && typeof result.title === "string") { lastTitle = result.title; lastFacts = result.facts.map(String); }
          if (d.name === "show_profile") lastFacts = [...EVENT_LINES, ...PROFILE.also];
          shownFacts = lastFacts;
          messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        // text plus tool calls in one reply is a finished answer: run the calls, don't ask again (it would repeat itself)
        if (answered || calls.some((c) => c.function.name === "suggest")) break;
        if (drops >= MAX_DROPS) { emit({ type: "trace", step: "policy", detail: `stopped loop after ${drops} dropped calls`, level: "warn" }); break; }
      }

      // verify before the visitor sees it: every claim must come from this turn's sources
      const answer = texts.join(" ").trim();
      if (answer) {
        const gr = groundAnswer(answer, source, last, lastTitle, `${source} ${ALL_FACTS_SOURCE}`, lastFacts);
        if (gr.dropped.length) emit({ type: "trace", step: "grounding", detail: `removed ${gr.dropped.length} of ${gr.total} sentence${gr.total > 1 ? "s" : ""}: not in his facts (${gr.dropped.flat().slice(0, 4).map((w) => `“${w}”`).join(", ")})`, level: "warn" });
        else emit({ type: "trace", step: "grounding", detail: gr.total > 1 ? `all ${gr.total} sentences checked against his facts · verified` : "the sentence was checked against his facts · verified", level: "ok" });
        // an answer that was entirely invented, with nothing on screen, is better replaced by the router
        // "not covered" is only precise when a project is named; otherwise finish() describes what is on screen
        // "his write-up doesn't cover that" is false when the facts do answer the question (Monad → PACK)
        const coveredAfterAll = subjectProject ? bestFact([...eventLinesFor(last), ...subjectProject.facts], last, subjectProject.title) : null;
        const unverifiedGap = !looked && !!coveredAfterAll && /doesn.t cover|not covered|isn.t covered|no (details|information)\b/i.test(gr.text);
        if (unverifiedGap) emit({ type: "trace", step: "grounding", detail: "removed “not covered”: his facts do answer this", level: "warn" });
        else if (!gr.dropped.length || gr.total > gr.dropped.length || (visible && (lastTitle || gr.extracted))) {
          // "Here is his resume." / "Opening CCR's architecture." with nothing opened is a claim about the screen that isn't true
          const shownNow = `${asked ?? ""} ${lastKind} ${lastProject?.title ?? ""}`;
          const said = narrated(dedupeSentences(gr.text), shownNow);
          if (said.cut) emit({ type: "trace", step: "grounding", detail: `removed ${said.cut} sentence${said.cut > 1 ? "s" : ""} describing something that wasn’t shown`, level: "warn" });
          if (said.text) out({ type: "text", text: said.text });
        }
        if (spoke) openNamed(gr.text);
        if (spoke && !visible) showContext();
      }
      // nothing said or shown, but the visitor is asking about a known project: answer from its facts, show it
      // event lines first: "what did he build at Monad?" is answered by the event, then the project's facts
      const known = !spoke && !visible && subjectProject ? bestFact([...eventLinesFor(last), ...subjectProject.facts], last, subjectProject.title) : null;
      if (known && subjectProject) {
        emit({ type: "trace", step: "harness", detail: `model gave no answer → answered from ${subjectProject.title}'s facts`, level: "warn" });
        out({ type: "text", text: known });
        const view = subjectProject.pipeline.length ? "architecture" : "card";
        out({ type: "tool", name: "open_project", args: { id: subjectProject.id, view } });
        runTool("open_project", { id: subjectProject.id, view }, out);
        return finish({ mode: "router" });
      }
      if (!spoke && !visible) {
        emit({ type: "trace", step: "harness", detail: "model gave no answer → deterministic router (no AI)", level: "warn" });
        router(subject, out);
        return finish({ mode: "router" });
      }
      return finish({ mode: "model", model: model.name, ms: Date.now() - t0, tools, fallback: mi > 0 });
    } catch (e) {
      if (deps.signal.aborted) return { mode: "aborted" };
      const status = e instanceof ModelError ? e.status : undefined, rest = e instanceof Error && /resting (\d+s)/.exec(e.message)?.[1];
      const why = rest ? `rate-limited (HTTP 429) · resting ${rest}` : status === 429 ? "rate-limited (HTTP 429)" : status && status >= 500 ? `provider error (HTTP ${status})`
        : status ? `rejected (HTTP ${status})` : e instanceof Error && e.name === "TimeoutError" ? "timed out" : e instanceof Error && e.message === "returned nothing" ? "returned nothing" : "failed";
      // say where the run goes next: another key for the same model, the next model, another provider, or the router
      const next = deps.models[mi + 1], base0 = (n: string) => n.split(" · ")[0];
      const provider = (n: string) => (/gemini/i.test(n) ? "gemini" : /openrouter/i.test(n) ? "openrouter" : "groq");
      const then = !next ? "→ deterministic router" : base0(next.name) === base0(model.name) ? `→ trying ${next.name.split(" · ")[1] ?? "the next key"}` : provider(next.name) !== provider(model.name) ? `→ switching provider: ${next.name}` : `→ falling back to ${base0(next.name)}`;
      if (rest) resting.push(model.name);
      else { flushSkips(model.name); emit({ type: "trace", step: "model", detail: `${model.name} ${why} ${then}`, level: "err" }); }
      if (messages.length > base.length) handoff = true;
      if (++mi < deps.models.length) continue;
      flushSkips("deterministic router");
      // every model is down: if something is already on screen, stop with what's verified rather than a second answer
      if (visible) {
        // answer extractively from what is on screen: every word is a verified fact
        const fact = lastProject || eventLinesFor(last).length ? bestFact([...eventLinesFor(last), ...(lastProject?.facts ?? [])], last, lastProject?.title ?? "") : null;
        out({ type: "text", text: fitNote ?? fact ?? SAY_FOR[lastKind] ?? (lastProject ? `Here’s ${lastProject.title}; the details are in the panel.` : "That’s everything verified so far.") });
        return finish({ mode: "partial" });
      }
      return fallbackToRouter(ROUTER);
    }
  }
}

export type { AgentEvent };
