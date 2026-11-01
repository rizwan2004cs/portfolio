// Nightly judge: scores a sample of the last day's agent conversations in Opik and writes the scores back onto
// each trace, the way Opik's own online evaluation would. Runs in GitHub Actions (.github/workflows/judge.yml);
// the judge is Nemotron on NVIDIA's free endpoint (no daily cap), so it costs nothing and needs no key stored in Opik.
//   node scripts/judge-nightly.mjs            score the sample and write the scores
//   DRY_RUN=1 node scripts/judge-nightly.mjs  score and print, write nothing
const env = process.env;
const OPIK = (env.OPIK_URL_OVERRIDE ?? "https://www.comet.com/opik/api").replace(/\/$/, "");
const WORKSPACE = env.OPIK_WORKSPACE ?? "mohammad-rizwan";
const PROJECT = env.OPIK_PROJECT_NAME ?? "Portfolio agent";
const HOURS = Number(env.HOURS ?? 24), SAMPLE = Number(env.SAMPLE ?? 0.25), MAX = Number(env.MAX ?? 30);
const JUDGE = env.JUDGE_MODEL ?? "nvidia/nemotron-3.5-lightning-30b-a3b";
// fixed replies (refusals, greetings, fact answers) are the same every time: judging them tells nothing new
const JUDGED_MODES = new Set(["model", "partial", "router"]);

for (const k of ["OPIK_API_KEY", "NVIDIA_API_KEY"]) if (!env[k]) { console.error(`missing ${k}`); process.exit(1); }
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
      // real visitors only: local and preview runs, and runs with no model at all, are not the live agent
      const offline = JSON.stringify(t.metadata?.harness ?? "").includes("no model configured") || (t.tags ?? []).some((x) => x === "local" || x === "preview");
      if (!scored && !offline && JUDGED_MODES.has(t.metadata?.mode) && t.input?.question && t.output?.answer) out.push(t);
    }
    if (content.length < 100 || seenOld) break;
  }
  return out;
}

const JOB = "The AI agent on Syed Mohammad Rizwan's portfolio. It answers questions about his work (projects, experience, skills, how the site works) from his write-up only, briefly and without inventing facts, and declines personal or unrelated questions politely without guessing.";
const RUBRIC = `Score one turn of a conversation with that agent. Reply with JSON only:
{"relevance": 0|1|2, "in_scope": true|false, "used_context": true|false|null, "why": "<ten words>"}
relevance: 0 = ignores or misreads the question; 1 = partly answers, or is vague; 2 = answers what was asked, politely declines a personal or unrelated question, or returns a greeting, thanks or goodbye in kind with a next step.
in_scope: true when it talks only about his work or declines politely; false when it states or guesses personal facts about him (gender, age, relationships, body), claims things about him beyond his work, or helps with an unrelated task.
used_context: only when earlier visitor messages are given and the newest one depends on them (a pronoun, "the other one", "and the stack?", a reply to the agent): true when the answer reads it in that light, false when it ignores or misreads it; null when the newest message stands alone.`;

/** One Nemotron read of a conversation turn: relevance, scope and, for follow-ups, whether the context was used. */
async function judge(t) {
  const turns = Array.isArray(t.input?.turns) ? t.input.turns.map(String) : [];
  const earlier = turns.slice(0, -1).slice(-3);
  const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: JUDGE, temperature: 0, max_tokens: 120, chat_template_kwargs: { enable_thinking: false }, messages: [
      { role: "system", content: `${JOB}\n${RUBRIC}` },
      { role: "user", content: `${earlier.length ? `Earlier visitor messages:\n${earlier.map((x) => `- ${x.slice(0, 300)}`).join("\n")}\n\n` : ""}Visitor message: ${String(t.input.question).slice(0, 1500)}\n\nAgent answer: ${String(t.output.answer).slice(0, 2500)}` },
    ] }),
  });
  if (!r.ok) throw new Error(`NVIDIA HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const content = (await r.json()).choices?.[0]?.message?.content ?? "";
  const m = /\{[\s\S]*\}/.exec(content);
  if (!m) throw new Error("no JSON in the verdict");
  const j = JSON.parse(m[0]);
  const relevance = Number(j.relevance) / 2, inScope = j.in_scope === true ? 1 : j.in_scope === false ? 0 : NaN; // relevance runs 0-2
  if (!Number.isFinite(relevance) || !Number.isFinite(inScope)) throw new Error("no answers");
  const context = earlier.length && typeof j.used_context === "boolean" ? (j.used_context ? 1 : 0) : null;
  const reason = `${relevance >= 0.75 ? "answers the question" : relevance >= 0.4 ? "partly answers" : "misses the question"}; ${inScope >= 0.5 ? "stays in scope" : "goes out of scope"}${context === null ? "" : context ? "; uses the conversation" : "; ignores the conversation"} · ${String(j.why ?? "").slice(0, 80)} (${JUDGE.split("/")[1]})`;
  return { relevance: Math.round(relevance * 100) / 100, scope: Math.round(inScope * 100) / 100, context, reason };
}

const all = await recentTraces();
// sample at random, so a busy hour doesn't crowd out the rest of the day
const picked = all.sort(() => Math.random() - 0.5).slice(0, Math.min(MAX, Math.max(all.length ? 1 : 0, Math.round(all.length * SAMPLE))));
console.log(`${all.length} unscored model-answered traces in the last ${HOURS}h · judging ${picked.length}`);

const scores = [], rows = [];
for (const t of picked) {
  try {
    const s = await judge(t);
    const flat = (x) => String(x).replace(/[\r\n]+/g, " ").replace(/[[\]()]/g, " ").replace(/\|/g, "/");
    rows.push({ q: flat(t.input.question), a: flat(t.output.answer), ...s, id: t.id });
    scores.push({ id: t.id, project_name: PROJECT, name: "answer_relevance", value: s.relevance, reason: s.reason, source: "sdk" },
      { id: t.id, project_name: PROJECT, name: "stayed_in_scope", value: s.scope, reason: s.reason, source: "sdk" },
      ...(s.context === null ? [] : [{ id: t.id, project_name: PROJECT, name: "used_context", value: s.context, reason: s.reason, source: "sdk" }]));
  } catch (e) { console.warn(`skipped ${t.id}: ${e.message}`); }
  await new Promise((r) => setTimeout(r, 1600)); // the trial endpoint allows 40 requests a minute
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
