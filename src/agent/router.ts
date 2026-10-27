import { EDUCATION, EVENTS, EXPERIENCE, experienceLine, GAPS, mentionsTool, PROJECTS, projectById, roleDetail, TOOLKIT, WHY_HIM } from "@/content/data";
import type { Project } from "@/content/types";
import type { Emit } from "./types";
import { bestFact } from "./grounding";
import { fitLine, fitRows, roughRequirements } from "./fit";
import { EVENT_LINES } from "./tools";
import { eventsIn, profileFocus, projectFilter, REASONING, topicsIn } from "./intent";
import { BEHAVIOR, ruleKind } from "./behavior";
import { answerSkill, toolNamed, CERT_Q, certAnswer, INTERVIEW_Q, interviewAnswer, isSecurityQ, LATEST_Q, latestAnswer, securityAnswer, SITE_TECH, siteTechAnswer, skillAsked, skillsOverview, type SkillAnswer } from "./skills";
// runTool is imported lazily to keep router <-> tools free of a load-order cycle
import * as tools from "./tools";

// words every question has: "tell me about his internship" must not score PULSEVO ("…at his first hackathon")
const FILLER = new Set("the and for with his him has had was are you your about does did what how who why when where tell show this that from into its can could would should any all".split(" "));
export function scoreProjects(text: string): { p: Project; s: number }[] {
  const t = text.toLowerCase();
  const words = t.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2 && !FILLER.has(w));
  return PROJECTS.map((p) => {
    const one = p.oneLiner.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    const title = p.title.toLowerCase();
    let s = t.includes(p.id) || t.includes(title) ? 10 : 0;
    // keywords are phrases a visitor would use; whole-word match so "robot" doesn't hit "robotics" twice
    for (const k of p.keywords ?? []) if (new RegExp(`\\b${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)) s += 3;
    for (const w of words) {
      if (title.split(/\W+/).includes(w)) s += 4;
      if (p.tags.includes(w)) s += 2;
      if (one.includes(w)) s += 1;
    }
    return { p, s };
  }).sort((a, b) => b.s - a.s);
}

/** The one project a message clearly points at: named outright, or a single clear keyword winner ("monad" → PACK). */
export function clearPick(text: string): Project | undefined {
  const r = scoreProjects(text), b = r[0];
  return b.s >= 10 || (b.s >= 3 && r[1].s < b.s) ? b.p : undefined;
}

export const ctxNext = (p: Project): string[] => [
  p.sims?.length ? `How does ${p.title} handle failures?` : p.pipeline.length ? `Internals of ${p.title}` : "Everything he’s built",
  ...(p.links?.live ? ["Can I try it?"] : []),
  "Everything he’s built",
  "Get resume",
].filter((x, i, a) => a.indexOf(x) === i).slice(0, 3);

const LINKS_Q = /\b(demos?|links?|urls?|github|repos?|repositor(?:y|ies)|source code|the code|open.?source|clone|try (?:it|this|that|them|out|him)|can i (?:try|use|test|play|run)|(?:it|this|that|site|app)(?:'s|’s| is)? live|live (?:link|site|version|url|app|demo)|see it live|hosted (?:at|on|where))\b/i;
const host = (u: string) => u.replace(/^https?:\/\//, "").replace(/\/$/, "");
/** Where a project can be tried and read, from its write-up's links; the same URLs sit on its panel as buttons. */
export function linksLine(p: Project): string {
  const { live, source } = p.links ?? {};
  const wake = live && /onrender\.com/.test(live) ? " (a free-tier host: the first load can take about 30 seconds)" : "";
  if (live && source) return `${p.title} is live at ${host(live)}${wake}, and the source is on GitHub at ${host(source)}. Both buttons are on its panel.`;
  if (live) return `${p.title} is live at ${host(live)}${wake}; its code isn’t public.`;
  if (source) return `${p.title} has no hosted demo: run it from the source on GitHub at ${host(source)}, linked on its panel.`;
  return `${p.title} has no public demo or repo: it’s hardware, built in person, so its panel’s write-up and photos are what there is.`;
}
export const DEFAULT_NEXT = ["Everything he’s built", "How does this site work?", "Get resume"];

/** Deterministic answer for any message. Used when models are down, killed, or answer nothing. Never silent. */
export function router(lastUser: string, emit: Emit): void {
  const last = lastUser.toLowerCase();
  const re = (r: RegExp) => r.test(last);
  const say = (text: string) => emit({ type: "text", text });
  const call = (name: tools.ToolName, args: Record<string, unknown> = {}) => {
    emit({ type: "tool", name, args });
    tools.runTool(name, args, emit);
  };
  const ranked = scoreProjects(last), best = ranked[0];
  // a named project, or one clear topic winner ("his poetry app" → VerseYou)
  const clear = best.s >= 4 || (best.s >= 2 && ranked[1].s < best.s);
  const deep = re(/\b(internals?|architecture|how does|how do|pipeline|under the hood|diagram)\b/);

  const jd = isJobDescription(lastUser);
  if (jd) {
    const reqs = roughRequirements(lastUser);
    if (reqs.length >= 2) {
      const rows = fitRows(reqs);
      say(fitLine(rows));
      call("match_role", { requirements: reqs });
      call("suggest", { options: ["Get resume", "Contact Rizwan", "Everything he’s built"] });
      return;
    }
  }
  // the questions recruiters actually ask get real answers even with every model down
  if (factAnswer(lastUser, emit, true)) return;
  if (re(/\b(resume|cv)\b/)) { say("Here’s his resume, once you approve."); call("offer_resume"); call("suggest", { options: ["Everything he’s built", "Contact Rizwan"] }); return; }
  if (re(/\b(contact|email|hire|reach)\b/)) { say("Every way to reach him, once you approve."); call("offer_contact"); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return; }
  if (re(/\b(classic|normal (site|page|portfolio)|scroll(ing)? (site|page)|regular (site|page))\b/)) { say("Switching you to the classic site."); call("switch_mode", { mode: "classic" }); return; }
  if (re(/\b(this site|this agent|you work|are you|what model|your model|if it breaks|model dies|plug|harness|offline)\b/)) { say("This is the agent you’re talking to."); call("show_harness"); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return; }
  if (best.s < 4 && re(/\b(about (rizwan|him)|who is (he|rizwan)|who'?s rizwan|his (background|profile|education)|tell me about (him|rizwan))\b/)) {
    say("Here’s Rizwan: an AI engineer in Bangalore who builds AI agents.");
    call("show_profile", profileFocus(last) === "education" ? { focus: "education" } : {});
    call("suggest", { options: ["Everything he’s built", "How does this site work?", "Get resume"] });
    return;
  }
  // a stack question is answered by the stack; otherwise the best fact, else what the project is (never a bare "Opening X.")
  if (clear && /\b(built (with|on|using)|made (with|in)|stack|tech(nolog\w*)?|frameworks?|languages?)\b/.test(last)) { say(`${best.p.title} is built with ${best.p.stack.join(", ")}.`); call("open_project", { id: best.p.id }); call("suggest", { options: ctxNext(best.p) }); return; }
  if (clear) { say(bestFact([...(/hackathon|event|prize|\bwon\b|built at|build at|impact lab|monad|terralogic|murf|devfest|ctf|superteam/i.test(lastUser) ? EVENT_LINES : []), ...best.p.facts], lastUser, best.p.title) ?? `Here’s ${best.p.title}: ${best.p.oneLiner[0].toLowerCase()}${best.p.oneLiner.slice(1)}`); call("open_project", { id: best.p.id, view: deep && best.p.pipeline.length ? "architecture" : "card" }); call("suggest", { options: ctxNext(best.p) }); return; }
  if (deep) { say("Start with the internals of one agent."); call("open_project", { id: "pack", view: "architecture" }); call("suggest", { options: ["Internals of CCR Compliance Advisor", "How does this site work?"] }); return; }
  if (re(/\b(built|projects?|work|everything|shipped|another)\b/) || best.s >= 2) { say("Everything he’s shipped."); call("list_projects"); call("suggest", { options: ["How does this site work?", "Get resume"] }); return; }
  // "what's his superpower?" with every model down: a fixed playful line, every word of it from his work
  if (ruleKind(lastUser) === "playful") {
    say(re(/kryptonite|weakness|weak spot/) ? "His kryptonite: free-tier rate limits. Which is exactly why everything he builds has a fallback, like PACK’s four-step model chain."
      : re(/\bwords?\b/) ? "Reliable, grounded, relentless. PACK keeps seven agents playing through model failures, and CCR cites a source for every claim."
      : re(/pitch|tagline|one[- ]liner|sell/) ? "An AI engineer who builds agents that don’t fall over: PACK, CCR Compliance Advisor and FinBoom each keep working when a model doesn’t."
      : "His superpower: building AI agents that don’t fall over. PACK keeps a seven-agent game running through a four-step model fallback, and CCR cites a source for every claim.");
    call("open_project", { id: "pack" }); call("suggest", { options: ["Internals of PACK", "Why should we hire him?", "Everything he’s built"] }); return;
  }
  say("Outside my lane. Closest thing I can show you is everything he’s built.");
  call("suggest", { options: DEFAULT_NEXT });
}

/** Questions with one factual answer (availability, months of experience, who built a project) are answered
 *  straight from the facts, model or not: a model can only add risk to them. Returns true when it answered. */
export function factAnswer(lastUser: string, emit: Emit, loose = false): boolean {
  // a pasted job description mentions "years of experience" too, but it wants a fit report, not one line
  if (isJobDescription(lastUser)) return false;
  const last = lastUser.toLowerCase(), re = (r: RegExp) => r.test(last), say = (text: string) => emit({ type: "text", text });
  const call = (name: tools.ToolName, args: Record<string, unknown> = {}) => { emit({ type: "tool", name, args }); tools.runTool(name, args, emit); };
  const ranked = scoreProjects(last), best = ranked[0], clear = best.s >= 4 || (best.s >= 2 && ranked[1].s < best.s);
  // greetings, "who am I?", "I'm his friend": the kinds that never need his facts, answered from the one policy table
  const kind = ruleKind(lastUser);
  if (kind === "small_talk" || kind === "about_visitor" || kind === "visitor_intro") {
    say(BEHAVIOR[kind].reply!(lastUser)); call("suggest", { options: BEHAVIOR[kind].chips }); return true;
  }
  // one or two words that name nothing on the site ("count", "body"): ask what they mean instead of letting a model guess
  if (lastUser.trim().split(/\s+/).length <= 2 && best.s === 0 && !topicsIn(lastUser).length && !profileFocus(lastUser)
    && !re(/\b(resume|cv|contact|email|phone|hire|hiring|classic|site|agent|model|models|harness|guard\w*|fallback|router|trace|profile|about|who|projects?|work|built|skills?|stack|toolkit|experience|education|degree|cgpa|events?|prizes?|hackathons?|intern\w*|novulis|supraja|help|menu|start|internals?|architecture|failures?|shortlist|everything|certif\w*|courses?|badges?|interview|lately|latest|guard\w*|security|hack\w*|tools?|tech\w*|languages?|frameworks?)\b/)) {
    say(BEHAVIOR.unclear.reply!(lastUser)); // never repeats the word back
    call("suggest", { options: ["Everything he’s built", "Has he won anything?", "Get resume"] }); return true;
  }
  // "why should we hire him?" has one written answer: his strongest evidence, said the same way every time
  if (re(/\bwhy (should|would|do|to) (i|we|you|anyone) (hire|pick|choose)|\bwhy (hire )?him\b|what makes him|stand(s)? out|over other (freshers|candidates|engineers)/)) {
    say(WHY_HIM); call("show_profile"); call("suggest", { options: ["Internals of PACK", "Get resume", "Contact Rizwan"] }); return true;
  }
  if (re(/\bweak(est|ness(es)?)?\b|\bgaps?\b|\black(s|ing)?\b|improve on|not good at|red flags?/)) {
    say(GAPS); call("suggest", { options: ["Everything he’s built", "How does this site work?", "Get resume"] }); return true;
  }
  // his jobs: where he works, what he does there, his internships
  if (!clear && re(/\bnovulis\b|\bsupraja\b|where (does|did) he work|\b(his|current) (job|role|employer|company)\b|\bintern(ship)?s?\b|what does he do\b/)) {
    // only the roles asked about: Novulis, Supraja, or the internships; everything for "where does he work"
    // "what does he do with azure": only the roles that mention it
    const tool = TOOLKIT.flatMap(([, l]) => l).find((t) => mentionsTool(lastUser, t) && !/^(REST APIs|Render)$/.test(t));
    const withTool = tool ? EXPERIENCE.filter((x) => mentionsTool(x.body, tool)) : [];
    const pick = withTool.length ? withTool : EXPERIENCE.filter((x) => (re(/\bnovulis\b/) ? x.title.startsWith("Novulis") && (!re(/what does he do|currently|right now|\bnow\b/) || !!x.now) : re(/\bsupraja\b/) ? x.title.startsWith("Supraja") : re(/\bintern/) ? !!x.minor : re(/where does he work|\b(current|job|employer|company)\b/) ? !!x.now : true));
    say(pick.map((x) => `${x.role} at ${x.title}, ${x.when}: ${roleDetail(x).replace(/\.$/, "")}.`).join(" ")); call("show_profile", { focus: "work" }); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return true;
  }
  // "what's his linkedin?", "his email?": the profile holds them, shown once the visitor approves
  if (re(/\b(linkedin|his github|github profile|socials?|twitter|x handle|instagram|his (email|phone|number|mail|whatsapp)|email (id|address)|phone number|how (do|can) i (reach|contact|message|talk to|get in touch with) (him|rizwan))\b/) && best.s < 10) {
    say("His LinkedIn, GitHub, email and phone are on his profile, shown once you approve."); call("offer_contact"); call("suggest", { options: ["Get resume", "Everything he’s built"] }); return true;
  }
  // "can he work remotely?", "will he relocate?": where he is, and that the rest is his call
  if (re(/\b(remote(ly)?|work from home|wfh|relocat\w*|on-?site|hybrid|which city|where (is|does) he (based|live|work|stay)|his location|based in|time ?zone)\b/) && best.s < 10 && !re(/\bintern\w*\b/)) {
    const now = EXPERIENCE[0];
    say(`He’s in Bengaluru, ${now.role} at ${now.title} (${now.when}); his ${EXPERIENCE[1].title} internship before that was remote. Remote, hybrid or relocation is his call to make: ask him directly, his contact details are on his profile.`);
    call("offer_contact"); call("suggest", { options: ["Get resume", "Everything he’s built"] }); return true;
  }
  if (re(/\bopen to (work|roles?|opportunit\w*|new)|\bavailab(le|ility)\b|looking for (a )?(job|role|work|opportunit)|notice period|join(ing)? date|can he join|\b(salary|ctc|compensation|expected pay|pay expectations?|salary package|freelanc\w*|contract (work|role|basis)|consulting work|part[- ]time|side gigs?|gig work|moonlight\w*)\b/)) {
    say("This site doesn’t say; ask him directly. His email, phone and LinkedIn are on his profile."); call("offer_contact"); call("suggest", { options: ["Get resume", "Everything he’s built"] }); return true;
  }
  // what he knows, what this agent runs on, what to ask him, what he's up to: all from the toolkit and his facts
  const answered = (r: SkillAnswer) => {
    say(r.text);
    if (r.open) call("open_project", { id: r.open }); else if (r.profile) call("show_profile", { focus: r.profile });
    else if (/one of his projects|guardrails here/.test(r.text)) call("show_harness");
    call("suggest", { options: r.chips }); return true;
  };
  if (SITE_TECH.test(lastUser) && best.s < 10) return answered(siteTechAnswer(lastUser));
  if (INTERVIEW_Q.test(lastUser) && best.s < 10) return answered(interviewAnswer());
  if (CERT_Q.test(lastUser) && best.s < 10) return answered(certAnswer());
  // "but it is in Rizwan's work" after "what concepts are there in fastapi": the rebuttal carries the previous turn, so
  // answer for the tool it named instead of letting a model pick a project
  if (re(/\b(it|that|this)('?s| is| was|'?s in| in)?\b[^.]*\b(in|on|part of|from) (his|rizwan'?s) (work|resume|cv|projects?|stack|toolkit|skills?|experience)\b/) && best.s < 10) {
    const named = toolNamed(lastUser);
    if (named) return answered(answerSkill(named));
  }
  const asked = skillAsked(lastUser);
  // "does he know Docker?" yes; "is he good at body parsing in FastAPI?" is for the model (more than a name)
  if (asked && (isSecurityQ(asked) || (best.s < 10 && asked.split(/\s+/).length <= 3))) return answered(answerSkill(asked));
  if (isSecurityQ(lastUser) && !re(/\b(prize|won|win|wins|winning|ctf v2|capture the flag)\b|^\s*(why|how)\b/) && best.s < 10 && lastUser.trim().split(/\s+/).length <= 10) return answered(securityAnswer());
  const overview = best.s < 10 ? skillsOverview(lastUser) : undefined;
  if (overview) return answered(overview);
  if (LATEST_Q.test(lastUser) && best.s < 10 && !re(LINKS_Q) && !re(/\bproject\b.*\b(ccr|pack|finboom)\b/)) return answered(latestAnswer());
  if (re(/\b(years?|months?) of experience|how (much|long|many years)[^?]{0,24}experience|how experienced|experience level|\bfresher\b/)) {
    say(experienceLine()); call("show_profile", { focus: "work" }); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return true;
  }
  // "has he won anything?", "how much did he win at Monad Blitz?", "which hackathons has he done?": the events
  // themselves (the ones named, else all with the prize first), never a project; "why…" questions go to the model
  const named = eventsIn(lastUser), prizeQ = re(/\b(prizes?|won|wins?|winnings?|awards?)\b/);
  // "experience with production systems" names no event, even though one event is called Prompt to Production
  const productionQ = re(/\bin production\b|\bproduction[- ](systems?|experience|grade|ready|code|apps?|environments?|level|software|use)\b/);
  if (best.s < 10 && !productionQ && (loose || !REASONING.test(lastUser)) && !re(/\b(projects?|apps?|built|build|made|make)\b/) && (named.length || re(/\b(prizes?|won|wins?|awards?|hackathons?|ctfs?|events?|devfest|achievements?|competitions?|contests?)\b/))) {
    const won = EVENTS.filter((e) => e.kind === "won");
    const builds = EVENTS.flatMap((e) => (e.links ?? []).filter((l) => l.href.startsWith("/work/")).map((l) => `${projectById(l.href.slice(6))?.title} at ${e.title}`)).slice(0, 2);
    // a hackathon is an event where he built a project tagged as one
    const hackQ = re(/\bhackathons\b|\bwhich hackathon/) ? EVENTS.filter((e) => e.links?.some((l) => l.href.startsWith("/work/") && projectById(l.href.slice(6))?.tags.includes("hackathon"))) : [];
    const only = won.length === 1 ? `His only prize so far is ${won[0].result.replace(/^won /, "")} at ${won[0].title}.` : "";
    say(named.length
      ? [...named.map((e) => e.say), prizeQ && !named.some((e) => e.kind === "won") ? only : ""].filter(Boolean).join(" ")
      // answer the question first (the prize, and that it is the only one), then what else he did at events
      : prizeQ ? [...won.map((e) => e.say), won.length === 1 ? "That’s his only prize so far." : "", builds.length ? `At hackathons he built ${builds.join(" and ")}.` : ""].filter(Boolean).join(" ")
      : hackQ.length && !re(/\bevents?\b/) ? `${hackQ.length} hackathons, newest first: ${hackQ.map((e) => `${e.title} (${e.result})`).join(", ")}.`
      : `${EVENTS.length} events, newest first: ${EVENTS.map((e) => `${e.title} (${e.result})`).join(", ")}.`);
    call("show_profile", { focus: "events" });
    const opens = [...named, ...EVENTS].flatMap((e) => (e.links ?? []).filter((l) => l.href.startsWith("/work/")).map((l) => `Open ${projectById(l.href.slice(6))?.title}`));
    call("suggest", { options: [...new Set([...opens, "Everything he’s built"])].slice(0, 3) });
    return true;
  }
  // a group asked for by what it is ("AI projects", "projects related to AI", "what has he built with Supabase?"):
  // the projects that fit, by name, and a list of only those; one fit opens it, none says where the topic shows instead
  const group = projectFilter(lastUser, best.s >= 10 ? best.p : undefined, loose);
  if (group) {
    const [only] = group.projects, n = group.projects.length;
    if (!n) {
      const where = group.elsewhere.map((u) => (u.href === "#work" ? `his work at ${u.label}` : u.href === "#other" ? `${u.label}, a side build` : u.label));
      say(`None of his public projects uses ${group.label}${where.length ? `; it shows in ${where.join(" and ")}` : ""}.`);
      if (group.elsewhere.some((u) => u.href === "#work")) call("show_profile", { focus: "work" });
      call("suggest", { options: ["Everything he’s built", "Get resume"] }); return true;
    }
    if (n === 1) {
      const event = /\b(hackathons?|events?|challenges?|contests?|built at|build at|made at)\b/i.test(lastUser) || eventsIn(lastUser).length ? EVENTS.find((e) => e.links?.some((l) => l.href === `/work/${only.id}`)) : undefined;
      say(event ? event.say : `That’s ${only.title}: ${only.oneLiner[0].toLowerCase()}${only.oneLiner.slice(1)}`); call("open_project", { id: only.id }); call("suggest", { options: ctxNext(only) }); return true;
    }
    say(`${n === PROJECTS.length ? "All" : n} of his ${PROJECTS.length} projects match “${group.label}”: ${group.projects.map((p) => p.title).join(", ")}.`);
    call("list_projects", { ids: group.projects.map((p) => p.id) }); call("suggest", { options: group.projects.slice(0, 2).map((p) => `Open ${p.title}`) }); return true;
  }
  // "what is his CGPA?", "where did he study?": his education, from his profile
  if (best.s < 10 && (loose || !REASONING.test(lastUser)) && profileFocus(lastUser) === "education") {
    say(`${EDUCATION.degree}, ${EDUCATION.school}, ${EDUCATION.years}: CGPA ${EDUCATION.cgpa}, ${EDUCATION.classAwarded}.`);
    call("show_profile", { focus: "education" }); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return true;
  }
  // how this site works: the same answer the browser gives, never a project panel
  if (/\b(how does (this|the) (site|agent|portfolio|chat) work|how (is|was) (this|the) (site|agent) (built|made))\b/i.test(lastUser)) {
    say("Every message passes a prompt guard and a scope filter. Known questions are answered in the browser; the rest go to a model chain (gpt-oss-120b, gpt-oss-20b, Gemini, then free OpenRouter models) with a deterministic router behind it, and every sentence is checked against his facts.");
    call("show_harness"); call("suggest", { options: ["Everything he’s built", "Get resume"] }); return true;
  }
  if (clear && re(/\b(alone|solo|by himself|on his own|team(mates?)?|who else|with whom|his (part|role|contribution)|versus|vs\.?|who did what|split|what did he (do|build) (in|on|for))\b/)) {
    const solo = /^solo\b/i.test(best.p.team), split = /:\s*he\s/.test(best.p.team);
    say(`${best.p.title}: ${best.p.team}.${!solo && !split ? " The write-up doesn’t split who built which part." : ""}`); call("open_project", { id: best.p.id }); call("suggest", { options: ctxNext(best.p) }); return true;
  }
  // "can I try FinBoom?", "github link for PACK", "is there a demo of DUO?": the links his write-ups carry, never a model
  // saying there is no repo when the panel shows one
  if (re(LINKS_Q) || (clear && re(/\btry\b/))) {
    if (clear) { say(linksLine(best.p)); call("open_project", { id: best.p.id }); call("suggest", { options: ctxNext(best.p) }); return true; }
    const live = PROJECTS.filter((p) => p.links?.live).map((p) => p.title), noRepo = PROJECTS.filter((p) => !p.links?.source).map((p) => p.title);
    say(`Try them live: ${live.join(", ")}. The source of every project${noRepo.length ? ` but ${noRepo.join(" and ")}` : ""} is on GitHub; the Live and Source buttons are on each panel.`);
    call("list_projects"); call("suggest", { options: ["Open FinBoom", "Open CCR Compliance Advisor", "Everything he’s built"] }); return true;
  }
  if (!clear && re(/\b(deploy(ed|ment)?s?|in production|production (use|app|system)s?|hosted|live (apps?|projects?|demos?|sites?)|real users)\b|\b(projects?|apps?|which)\b[^?]{0,30}\blive\b/)) {
    const live = PROJECTS.filter((p) => p.links?.live).map((p) => p.title);
    say(`${live.length} of his projects are deployed and live: ${live.join(", ")}. At ${EXPERIENCE[0].title} he builds full-stack applications on Azure as ${EXPERIENCE[0].role}. None of the write-ups give user or traffic numbers.`); call("list_projects"); call("suggest", { options: ["Open CCR Compliance Advisor", "Can I try it?", "Get resume"] }); return true;
  }
  return false;
}

export const isJobDescription = (t: string) => t.length > 140 || /\b(job description|jd|requirements?|we need|we're looking for|we are looking for|must have|nice to have|is he a fit|good fit)\b/i.test(t);
