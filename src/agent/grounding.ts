import { splitSentences } from "./clean";
import { isRefusal } from "./scope";
import { EXPERIENCE, MARQUEE_A, MARQUEE_B, mentionsTool, PROJECTS, TOOLKIT } from "@/content/data";

// Words that carry no claim: conversational glue, verbs about showing things, generic nouns.
const STOP = new Set(
  ("doesn isn wasn aren didn hasn haven describe describing relies rely relying avoid avoids avoiding enforce enforces enforcing single multiple keeps keep kept makes make made gets get provides provide offers offer lets allows across within instead rather though although because since explicit explicitly specific specifically clear clearly directly simple simply overall describes described description notes noted says lists either neither only even still already whole entire compare comparing versus stronger strongest weaker better best worse more less most least clearer deeper broader reliability reliable robust robustness resilient resilience solid strong production production-grade scalable engineering engineered shows show demonstrates demonstrate demonstrated demonstrating showcases showcased highlights proves compared comparison whereas while instead cover covered covering handling mention mentions mentioned have has had does did including include includes displayed display displays shown feedback accuracy accurate users user visitors real-time simple quickly ensures ensure allowing allows enable enables helps about above after again against also among another answer answers anything approve approval approved because before being below between both build builds built cannot check click could covers detail details does doing during each either every everything first from further handle handles handled having here hers into itself just like look makes many might more most much need needs never nothing open opening other others over really same seems share shared shown should show showing since some such sure take than that their them then there these they thing things this those though through under until upon used uses using very view want what when where whether which while whose with within without would write-up writeup project projects rizwan rizwan's rizwans agent agents system systems work works it's isn't doesn't don't won't here's that's what's list listed shipped confirm happy right panel card screen below above prevent prevents prevented preventing initial initially smaller larger refine refinement ensures ensuring guarantee guarantees")
    .split(" "),
);

const stem = (w: string) => {
  const b = w.replace(/(ing|ed|es|s|ly|ment|ions?)$/, "");
  return b.slice(0, Math.max(4, Math.min(5, b.length)));
};

/** Content words of `sentence` that never appear in `src`. A sentence is unsupported when ≥2 of its
 *  content words, and more than 30% of them, are missing. Returns [] when the sentence is supported. */
export function unsupported(sentence: string, src: string): string[] {
  const words = [...new Set((sentence.toLowerCase().match(/[a-z][a-z0-9-]{4,}/g) ?? []).filter((w) => !STOP.has(w)))];
  const miss = words.filter((w) => !src.includes(stem(w)));
  return miss.length >= 2 && miss.length / words.length > 0.3 ? miss : [];
}

const NOT_NAMES = new Set("He His Him The A An It Its This That These Those At In On For With And But So Yes No Also Rizwan Rizwan’s Rizwan's Syed Mohammad".split(" "));

/** Numbers and amounts must come from the same fact as the claim around them: "$115 at Monad Blitz" fails
 *  when $115 only appears next to the CTF. Returns the numbers that no source segment anchors. */
export function misanchored(sentence: string, src: string): string[] {
  // "millions of sections" is a number claim too, just without digits
  const qty = (sentence.match(/\b(millions?|billions?|thousands?|hundreds|dozens|lakhs?|crores?)\b/gi) ?? []).filter((w) => !src.toLowerCase().includes(w.toLowerCase()));
  const nums = sentence.match(/[$₹]?\d[\d,.]*\d|[$₹]\d/g) ?? [];
  if (!nums.length) return qty;
  // names (Monad, Superteam, Gemini) anchor a number better than generic words like "prize"
  const names = [...new Set((sentence.match(/\b[A-Z][A-Za-z0-9-]+/g) ?? []).filter((w) => !NOT_NAMES.has(w)).map((w) => w.toLowerCase()))];
  const words = [...new Set((sentence.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem))];
  const segs = src.toLowerCase().split(/[.!?](?=\s|$)|",\s*"|\n/);
  return [...qty, ...nums.filter((n) => {
    const holders = segs.filter((g) => g.includes(n.toLowerCase().replace(/^[$₹]/, "")));
    // anchored when a piece holding the number also names what the sentence names, or shares two content words with it
    return !holders.some((g) => (names.length && names.some((w) => g.includes(w))) || words.filter((w) => g.includes(w)).length >= 2 || (!names.length && !words.length));
  })];
}

// every technology the site mentions, longest first so "Supabase Realtime" wins over "Supabase"
const TECH = [...new Set([...MARQUEE_A, ...MARQUEE_B, ...TOOLKIT.flatMap(([, l]) => l), ...PROJECTS.flatMap((p) => [...p.stack, ...(p.keywords ?? [])])].map((t) => t.toLowerCase()))]
  .filter((t) => t.length > 2).sort((a, b) => b.length - a.length);
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Reasoning across projects can mix them up: "CCR and FinBoom use FastAPI and Azure" names real projects and
 *  real technologies that don't belong together. When a sentence names projects, every technology it mentions
 *  must appear in at least one of those projects. Returns the misattributed technologies. */
export function misattributedTech(sentence: string): string[] {
  const low = sentence.toLowerCase();
  const named = [
    ...PROJECTS.filter((p) => new RegExp(`\\b${esc(p.title.toLowerCase())}\\b`).test(low) || new RegExp(`\\b${esc(p.id)}\\b`).test(low))
      .map((p) => ({ title: p.title, text: `${p.facts.join(" ")} ${p.stack.join(" ")} ${(p.keywords ?? []).join(" ")} ${p.oneLiner}`.toLowerCase() })),
    // his jobs say nothing about tools, so "Azure at Novulis" can't be grounded
    ...EXPERIENCE.filter((x) => low.includes(x.title.toLowerCase())).map((x) => ({ title: x.title, text: x.body.toLowerCase() })),
  ];
  if (!named.length) return [];
  // "both use X" / "each uses X" claims X for every named project, not just one of them
  const every = named.length > 1 && /\b(both|each|all of them|all three|alike)\b/.test(low);
  const in1 = (n: { text: string }, t: string) => n.text.includes(t) || mentionsTool(n.text, t);
  const has = (t: string) => (every ? named.every((n) => in1(n, t)) : named.some((n) => in1(n, t)));
  const mentioned: string[] = [];
  let rest = low;
  for (const t of TECH) if (new RegExp(`\\b${esc(t)}\\b`).test(rest)) { mentioned.push(t); rest = rest.replace(new RegExp(`\\b${esc(t)}\\b`, "g"), " "); }
  return mentioned.filter((t) => !has(t) && !named.some((n) => n.title.toLowerCase().includes(t)));
}

/** Jobs blur together: "as a Novulis intern he built prototypes" borrows the full-time role's duties. When a
 *  sentence names one role, words that only another role's description uses are flagged. */
export function roleBleed(sentence: string): string[] {
  const low = sentence.toLowerCase();
  const byRole = EXPERIENCE.filter((x) => low.includes(x.role.toLowerCase()));
  const hits = byRole.length ? byRole : EXPERIENCE.filter((x) => x.minor && /\bintern/.test(low) && low.includes(x.title.toLowerCase()));
  if (hits.length !== 1) return [];
  const x = hits[0], own = `${x.role} ${x.body} ${x.title} ${x.when}`.toLowerCase();
  const others = EXPERIENCE.filter((y) => y !== x).map((y) => y.body.toLowerCase()).join(" ");
  const words = [...new Set((low.match(/[a-z][a-z0-9-]{4,}/g) ?? []).filter((w) => !STOP.has(w)))];
  return words.filter((w) => !own.includes(stem(w)) && others.includes(stem(w)));
}

const PRIZE = /\b(won|wins?|winner|winning|prizes?|awards?|awarded|placed)\b/i;
/** A prize claim must belong to the event it names: "won … for building DUO" fails when the facts only say
 *  he built DUO there. Returns the names in the sentence that no prize-bearing source segment mentions. */
export function misattributed(sentence: string, src: string): string[] {
  if (!PRIZE.test(sentence)) return [];
  // "he didn't win a prize at Monad Blitz" claims no prize: it is the honest answer, not a misattribution
  if (/\b(not|no|never|didn['’]?t|wasn['’]?t|without|none)\b[^.]{0,40}\b(won|wins?|winning|prizes?|awards?|awarded|placed)\b/i.test(sentence)) return [];
  // achievements get zero tolerance: every content word must be in the facts ("several events" fails when there was one)
  const low = src.toLowerCase();
  const loose = [...new Set((sentence.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w) && !PRIZE.test(w)))].filter((w) => !low.includes(stem(w)));
  if (loose.length) return loose;
  const names = [...new Set((sentence.match(/\b[A-Z][A-Za-z0-9-]+/g) ?? []).filter((w) => !NOT_NAMES.has(w)).map((w) => w.toLowerCase()))];
  const segs = src.toLowerCase().split(/[.;!?](?=\s|$)|",\s*"|\n/).filter((g) => PRIZE.test(g));
  return names.filter((n) => low.includes(n) && !segs.some((g) => g.includes(n)));
}

export function topicOf(q: string): string {
  if (/fail|break|down|outage|error|crash|fallback|stall/i.test(q)) return "failure handling";
  if (/monitor|observab|logging|logs\b/i.test(q)) return "monitoring";
  return "that";
}

/** Keep only sentences supported by this turn's sources. Refusals are always allowed.
 *  If nothing survives, say precisely what isn't covered instead of going silent. */
/** The fact that answers `question` best, or null when none shares at least two of its content words
 *  (one, for a one-word question). Lets the harness answer extractively instead of claiming "not covered". */
export function bestFact(facts: string[], question: string, title = ""): string | null {
  const skip = new Set((title.toLowerCase().match(/[a-z0-9]+/g) ?? []).map(stem));
  let words = [...new Set((question.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem))].filter((w) => !skip.has(w));
  // "how does it handle failures?" is answered by facts about fallbacks, stalls, crashes and retries
  if (/fail|break|down|outage|error|crash|stall|resilien|recover/i.test(question)) words = [...new Set([...words, "fallb", "stall", "crash", "resum", "mock", "timeo", "retry", "never"])];
  if (!words.length) return null;
  const hits = (t: string) => words.filter((w) => t.toLowerCase().includes(w)).length;
  // "how does it verify Firebase tokens?" wants "roles verified with Firebase tokens", not the trust-score clause
  // stapled in front of it: a clause stands in for its fact only when the rest of the fact matched nothing
  const answerOf = (f: string) => {
    // …unless the rest says what isn't so ("…; no prize is listed for it"): that is often the answer itself
    const parts = f.split("; "), n = hits(f), clause = parts.length > 1 && !parts.some((c) => /\b(no|not|never|none|only)\b|n't/i.test(c)) ? parts.find((c) => hits(c) === n) : undefined;
    return clause && clause.length < f.length ? `${clause[0].toUpperCase()}${clause.slice(1).replace(/[.;]*$/, "")}.` : f;
  };
  let best: string | null = null, score = 0;
  for (const f of facts) {
    const n = hits(f);
    if (n > score) { best = f; score = n; }
  }
  if (best) best = answerOf(best);
  // two matching words, or one if the question has a single distinctive word ("monad"); never a stray generic hit
  return score >= Math.min(2, words.length) && (score >= 2 || words.length === 1) ? best : null;
}

export function groundAnswer(answer: string, source: string, question: string, title?: string | null, wideSource = source, facts: string[] = [], opts: { loose?: boolean } = {}) {
  const src = source.toLowerCase(), wide = wideSource.toLowerCase();
  const kept: string[] = [];
  const dropped: string[][] = [];
  /** every sentence with its verdict, in order: "words" is the only drop a reader of the facts may overturn */
  const parts: { s: string; ok: boolean; why?: "words" | "claims" | "puffery" | "refusal"; miss?: string[] }[] = [];
  const sentences = splitSentences(answer);
  let afterRefusal = false;
  for (const s of sentences) {
    if (isRefusal(s)) {
      // a refusal tacked onto a real answer ("…fallback routers. Outside my lane.") contradicts it: drop it
      if (kept.some((k) => !isRefusal(k))) { dropped.push(["refusal after an answer"]); parts.push({ s, ok: false, why: "refusal" }); continue; }
      kept.push(s); parts.push({ s, ok: true }); afterRefusal = true; continue;
    }
    // "Closest thing: …" after a refusal may point at any real project, but still only with real facts
    // a playful answer ("he'd be a compiler: …") or a greeting is the model's own words over the facts: its wording is
    // free, its numbers, names, tech and roles are not
    const base = afterRefusal ? wide : src, miss = opts.loose ? [] : unsupported(s, base);
    const words = miss.length > 0;
    if (!miss.length) miss.push(...misanchored(s, base), ...misattributed(s, base), ...misattributedTech(s), ...roleBleed(s));
    // puffery ("routinely", "extensive experience") is never in the write-ups
    const puff = s.match(/\b(routinely|extensive(ly)?|expert(ise)?|years of|seasoned|mastery|deep experience|similar stacks|proven track record|battle.tested|production.(ready|grade)|in production|at scale|enterprise.grade|several production|deep (prompt|knowledge|expertise|understanding)|most (freshers|candidates|engineers|graduates|people)|unlike (most|other)|few (freshers|candidates|engineers))\b/i);
    const puffed = !miss.length && !!puff;
    if (puffed) miss.push(puff![0].toLowerCase());
    if (miss.length) { dropped.push(miss); parts.push({ s, ok: false, why: words ? "words" : puffed ? "puffery" : "claims", miss }); } else { kept.push(s); parts.push({ s, ok: true }); }
  }
  const extracted = kept.length ? null : bestFact(facts, question, title ?? "");
  const text = kept.length ? kept.join(" ") : extracted ?? `His write-up doesn’t cover ${topicOf(question)}${title ? ` for ${title}` : ""}.`;
  return { text, dropped, total: sentences.length, extracted: !!extracted, parts };
}
