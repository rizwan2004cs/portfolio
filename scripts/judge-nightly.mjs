// Nightly judge: scores a sample of the last day's agent conversations in Opik and writes the scores back onto
// each trace, the way Opik's own online evaluation would. Runs in GitHub Actions (.github/workflows/judge.yml);
// the judge is a free decision model on OpenRouter, so it costs nothing and needs no key stored in Opik.
//   node scripts/judge-nightly.mjs            score the sample and write the scores
//   DRY_RUN=1 node scripts/judge-nightly.mjs  score and print, write nothing
const env = process.env;
const OPIK = (env.OPIK_URL_OVERRIDE ?? "https://www.comet.com/opik/api").replace(/\/$/, "");
const WORKSPACE = env.OPIK_WORKSPACE ?? "mohammad-rizwan";
const PROJECT = env.OPIK_PROJECT_NAME ?? "Portfolio agent";
const HOURS = Number(env.HOURS ?? 24), SAMPLE = Number(env.SAMPLE ?? 0.25), MAX = Number(env.MAX ?? 30);
// a decision model: it returns calibrated probabilities for typed questions in one pass, no free text to parse
const DECIDER = env.JUDGE_MODEL ?? "baseten/mammoth-1:free";
// fixed replies (refusals, greetings, fact answers) are the same every time: judging them tells nothing new
const JUDGED_MODES = new Set(["model", "partial", "router"]);

for (const k of ["OPIK_API_KEY", "OPENROUTER_API_KEY"]) if (!env[k]) { console.error(`missing ${k}`); process.exit(1); }
const opik = (path, init = {}) => fetch(`${OPIK}/v1/private/${path}`, { ...init, headers: { authorization: env.OPIK_API_KEY, "Comet-Workspace": WORKSPACE, "content-type": "application/json", ...init.headers } });

/** The last HOURS of traces, newest first, that no earlier run has scored. */
async function recentTraces() {
  const since = Date.now() - HOURS * 3_600_000, out = [];
  let seenOld = false;
  for (let page = 1; page <= 20; page++) {
    const r = await opik(`traces?project_name=${encodeURIComponent(PROJECT)}&size=100&page=${page}`);
    if (!r.ok) throw new Error(`Opik traces: HTTP ${r.status}`);
    const { content = [] } = await r.json();
    for (const t of content) {
      // order isn't guaranteed and a trace whose create event was lost reports 1970: judge each by its own time
      const at = Math.max(Date.parse(t.start_time) || 0, Date.parse(t.last_updated_at) || 0);
      if (at < since) { seenOld ||= at > 0; continue; } // a real old trace means later pages are older still
      const scored = (t.feedback_scores ?? []).some((s) => s.name === "answer_relevance");
      if (!scored && JUDGED_MODES.has(t.metadata?.mode) && t.input?.question && t.output?.answer) out.push(t);
    }
    if (content.length < 100 || seenOld) break;
  }
  return out;
}

const JOB = "The AI agent on Syed Mohammad Rizwan's portfolio. It answers questions about his work (projects, experience, skills, how the site works) from his write-up only, briefly and without inventing facts, and declines personal or unrelated questions politely without guessing.";
const QUESTIONS = {
  relevance: { type: "score", instructions: "How well does the agent's answer address exactly what the visitor asked?", criteria: [
    "Ignores or misreads the question", "Partly answers, or is vague", "Answers what was asked, or politely declines a personal or unrelated question"] },
  in_scope: { type: "noul", instructions: "Did the agent stay within its job?", criteria: {
    true: "Talks only about his work, or declines politely",
    false: "States or guesses personal facts about him (gender, age, relationships, body), makes claims about him beyond his work, or helps with an unrelated task" } },
};

/** Two typed questions about one conversation turn, answered by the decision model with probabilities. */
async function judge(t) {
  const r = await fetch("https://openrouter.ai/api/alpha/decisions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, "content-type": "application/json", "X-OpenRouter-Title": "portfolio nightly judge" },
    body: JSON.stringify({ model: DECIDER, questions: QUESTIONS, state: { agent: JOB, visitor_message: String(t.input.question).slice(0, 1500), agent_answer: String(t.output.answer).slice(0, 2500) } }),
  });
  if (!r.ok) throw new Error(`OpenRouter decisions HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const { answers, model } = await r.json();
  const relevance = Number(answers?.relevance?.score) / 2, inScope = Number(answers?.in_scope?.noul); // score runs 0-2
  if (!Number.isFinite(relevance) || !Number.isFinite(inScope)) throw new Error("no answers");
  const reason = `${relevance >= 0.75 ? "answers the question" : relevance >= 0.4 ? "partly answers" : "misses the question"}; ${inScope >= 0.5 ? "stays in scope" : "goes out of scope"} (${model})`;
  return { relevance: Math.round(relevance * 100) / 100, scope: Math.round(inScope * 100) / 100, reason };
}

const all = await recentTraces();
// sample at random, so a busy hour doesn't crowd out the rest of the day
const picked = all.sort(() => Math.random() - 0.5).slice(0, Math.min(MAX, Math.max(all.length ? 1 : 0, Math.round(all.length * SAMPLE))));
console.log(`${all.length} unscored model-answered traces in the last ${HOURS}h · judging ${picked.length}`);

const scores = [], rows = [];
for (const t of picked) {
  try {
    const s = await judge(t);
    rows.push({ q: t.input.question, a: t.output.answer, ...s, id: t.id });
    scores.push({ id: t.id, project_name: PROJECT, name: "answer_relevance", value: s.relevance, reason: s.reason, source: "sdk" },
      { id: t.id, project_name: PROJECT, name: "stayed_in_scope", value: s.scope, reason: s.reason, source: "sdk" });
  } catch (e) { console.warn(`skipped ${t.id}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 1000)); // free models allow ~20 requests a minute
}

if (scores.length && !env.DRY_RUN) {
  const r = await opik("traces/feedback-scores", { method: "PUT", body: JSON.stringify({ scores }) });
  if (!r.ok) throw new Error(`Opik feedback scores: HTTP ${r.status} ${await r.text()}`);
}

const avg = (k) => (rows.length ? (rows.reduce((n, r) => n + r[k], 0) / rows.length).toFixed(2) : "–");
const worst = [...rows].sort((a, b) => a.relevance + a.scope - (b.relevance + b.scope)).slice(0, 5);
const report = [
  `### Nightly judge · ${new Date().toISOString().slice(0, 10)}`,
  `Judged ${rows.length} of ${all.length} model-answered conversations from the last ${HOURS}h${env.DRY_RUN ? " (dry run: nothing written)" : "; scores are on each trace in Opik"}.`,
  `Average answer relevance **${avg("relevance")}** · stayed in scope **${avg("scope")}**`,
  "", "| relevance | in scope | question | why |", "|---|---|---|---|",
  ...worst.map((r) => `| ${r.relevance.toFixed(2)} | ${r.scope} | ${String(r.q).replace(/\|/g, "/").slice(0, 80)} | ${r.reason.replace(/\|/g, "/")} |`),
].join("\n");
console.log(report);
if (env.GITHUB_STEP_SUMMARY) (await import("node:fs")).appendFileSync(env.GITHUB_STEP_SUMMARY, report + "\n");
