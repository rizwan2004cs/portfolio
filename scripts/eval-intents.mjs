// Runs the labelled message set (tests/fixtures/intents.json) through the live classifier and checks every message
// lands in a kind the behaviour policy accepts for it. This replaces testing the agent by hand, one phrasing at a time.
//   NVIDIA_API_KEY=… node scripts/eval-intents.mjs              all messages
//   CLASSIFIER_MODEL=nvidia/… node scripts/eval-intents.mjs      another NVIDIA model
//   MIN_ACCURACY=0.9 node scripts/eval-intents.mjs              fail below this share
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const key = process.env.NVIDIA_API_KEY;
if (!key) { console.log("NVIDIA_API_KEY not set: skipping the classifier eval"); process.exit(0); }
const file = new URL("../tests/fixtures/intents.json", import.meta.url);
if (!existsSync(file)) { console.log("no labelled set at tests/fixtures/intents.json: skipping"); process.exit(0); }
//   ONLY=regex node scripts/eval-intents.mjs                    only the messages matching it (a local check of new cases)
const only = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : undefined;
const cases = JSON.parse(readFileSync(file, "utf8")).filter((c) => !only || only.test(c.text));
// the kind definitions come from the policy itself, so the eval always tests what production asks
const src = readFileSync(new URL("../src/agent/behavior.ts", import.meta.url), "utf8");
const criteria = Object.fromEntries([...src.matchAll(/^\s{2}(\w+): \{\s*(?:\n\s*)?describe: "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const SENSITIVE = ["personal", "abusive", "accusation"];
// the same prompt as classifierMessages() in src/agent/classify.ts: change both together
const SITE = "A portfolio site for Syed Mohammad Rizwan, an AI engineer, with an AI agent visitors chat with.";
const PROMPT = JSON.parse(readFileSync(new URL("../src/agent/classifier-prompt.json", import.meta.url), "utf8"));
const MODEL = process.env.CLASSIFIER_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";
const system = `${SITE}\nSort the visitor's newest message into exactly one kind. A short follow-up takes the kind of the exchange before it.\nKinds:\n${Object.entries(criteria).map(([k, d]) => `- ${k}: ${d}`).join("\n")}\n`
  + `Rules:\n${PROMPT.guidance.map((g) => `- ${g}`).join("\n")}\nExamples:\n${PROMPT.examples.map((e) => `"${e.text}" → ${e.kind}`).join("\n")}\n`
  + `Reply with JSON only: {"kind": <kind>, "confidence": <0 to 1>, "visitor": {"name", "company", "role", "hiringFor"}} where "visitor" appears only when the kind is visitor_intro, with only the fields the message states.`;
// the same rule as decide() in src/agent/classify.ts
const decide = (kind, conf, p = {}) => {
  if (kind === "work" || conf >= 0.5 || SENSITIVE.includes(kind)) return kind;
  const s = SENSITIVE.map((k) => [k, p[k] ?? 0]).sort((a, b) => b[1] - a[1]);
  return s.reduce((n, [, v]) => n + v, 0) > (p.work ?? 0) ? s[0][0] : "work";
};

const rows = [];
for (const c of cases) {
  let kind = "error", conf = 0, probs = {};
  for (let attempt = 0; attempt < 3 && kind === "error"; attempt++) {
    try {
      const r = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 120, chat_template_kwargs: { enable_thinking: false }, messages: [{ role: "system", content: system }, { role: "user", content: `Visitor message: ${c.text.slice(0, 1500)}` }] }),
      });
      if (r.ok) { const m = /\{[\s\S]*\}/.exec((await r.json()).choices?.[0]?.message?.content ?? ""); try { const a = m ? JSON.parse(m[0]) : {}; kind = a.kind ?? "error"; conf = Number(a.confidence ?? 0); } catch { kind = "error"; } }
      else await new Promise((res) => setTimeout(res, 2000));
    } catch { /* retried */ }
  }
  if (kind === "error" && rows.length === 0) { console.log("classifier unreachable: skipping, not failing"); process.exit(0); }
  const acted = decide(kind, conf, probs), ok = [c.kind, ...(c.accept ?? [])].includes(acted);
  rows.push({ ...c, got: kind, acted, conf, ok });
  await new Promise((res) => setTimeout(res, 1600)); // the trial endpoint allows 40 requests a minute
}

const right = rows.filter((r) => r.ok).length, share = right / rows.length;
const byKind = Object.entries(Object.groupBy(rows, (r) => r.kind)).map(([k, rs]) => `${k} ${rs.filter((r) => r.ok).length}/${rs.length}`).join(" · ");
const misses = rows.filter((r) => !r.ok);
const report = [
  `### Classifier eval: ${right}/${rows.length} (${(share * 100).toFixed(0)}%)`, byKind, "",
  ...(misses.length ? ["| message | expected | acted on | model said | confidence |", "|---|---|---|---|---|", ...misses.map((r) => `| ${r.text.replace(/\|/g, "/").slice(0, 70)} | ${[r.kind, ...(r.accept ?? [])].join(" or ")} | ${r.acted} | ${r.got} | ${r.conf.toFixed(2)} |`)] : ["No misses."]),
].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
const min = Number(process.env.MIN_ACCURACY ?? 0.9);
if (share < min) { console.error(`below ${min}`); process.exit(1); }
