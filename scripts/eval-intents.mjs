// Runs the labelled message set (tests/fixtures/intents.json) through the live classifier and checks every message
// lands in a kind the behaviour policy accepts for it. This replaces testing the agent by hand, one phrasing at a time.
//   OPENROUTER_API_KEY=… node scripts/eval-intents.mjs          all messages
//   MIN_ACCURACY=0.9 node scripts/eval-intents.mjs              fail below this share
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.log("OPENROUTER_API_KEY not set: skipping the classifier eval"); process.exit(0); }
const file = new URL("../tests/fixtures/intents.json", import.meta.url);
if (!existsSync(file)) { console.log("no labelled set at tests/fixtures/intents.json: skipping"); process.exit(0); }
const cases = JSON.parse(readFileSync(file, "utf8"));
// the kind definitions come from the policy itself, so the eval always tests what production asks
const src = readFileSync(new URL("../src/agent/behavior.ts", import.meta.url), "utf8");
const criteria = Object.fromEntries([...src.matchAll(/^\s{2}(\w+): \{\s*(?:\n\s*)?describe: "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
const SENSITIVE = ["personal", "abusive", "accusation"];
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
      const r = await fetch("https://openrouter.ai/api/alpha/decisions", {
        method: "POST", signal: AbortSignal.timeout(20_000),
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "X-OpenRouter-Title": "portfolio intent eval" },
        body: JSON.stringify({ model: "baseten/mammoth-1:free", state: { site: "A portfolio site for Syed Mohammad Rizwan, an AI engineer, with an AI agent visitors chat with.", visitor_message: c.text }, questions: { kind: { type: "choice", instructions: "What kind of message is visitor_message? A short follow-up takes the kind of the message before it.", criteria } } }),
      });
      if (r.ok) { const a = (await r.json()).answers?.kind; kind = a?.choice ?? "error"; conf = Number(a?.confidence ?? 0); probs = a?.probabilities ?? {}; }
      else await new Promise((res) => setTimeout(res, 2000));
    } catch { /* retried */ }
  }
  if (kind === "error" && rows.length === 0) { console.log("classifier unreachable (free-tier daily limit?): skipping, not failing"); process.exit(0); }
  const acted = decide(kind, conf, probs), ok = [c.kind, ...(c.accept ?? [])].includes(acted);
  rows.push({ ...c, got: kind, acted, conf, ok });
  await new Promise((res) => setTimeout(res, 900)); // free tier: about one request a second
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
