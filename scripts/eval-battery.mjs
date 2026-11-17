// The battery: 162 realistic visitor messages in 13 categories (tests/fixtures/battery.json), sent to a running site the
// way the client sends them, follow-ups carrying the conversation. Every reply is flagged automatically:
//   dead-end   a stock non-answer ("Outside my lane", "Not sure what you mean", "His write-up doesn't cover that")
//              outside the categories where refusing is right (off-topic, break-it)
//   no-model   answered without a model where one was expected (the router, or a refusal outside those categories)
//   leak       the agent spoke as its vendor or as Rizwan, or showed a transcript marker or a tool name
//   slow       more than 8 seconds
// Requests carry x-agent-eval so the site does not report them to Sentry as weak replies.
//   node scripts/eval-battery.mjs https://mohammad-rizwan.tech    GAP_MS=6000 · ONLY=category,category · MAX_DEAD=3
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const base = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3010").replace(/\/$/, "");
const fixture = JSON.parse(readFileSync(new URL("../tests/fixtures/battery.json", import.meta.url), "utf8"));
const only = process.env.ONLY ? process.env.ONLY.split(",") : null;
const gap = Number(process.env.GAP_MS ?? 6000);
const DEAD = /^(Outside my lane|Not sure what you mean|Nothing on this site supports|His write-up (only covers his work|doesn(’|')t cover that)\.?$|Let(’|')s keep it to his work|Here(’|')s what I found|The closest facts on record)/;
const LEAK = /\[showed:|\bsuggest_\w+|my name is nemotron|created by nvidia|\bI (built|made|created) (this|the) (agent|site|portfolio)\b/i;

async function ask(history, shown, state) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const t0 = Date.now();
    let r;
    try { r = await fetch(`${base}/api/agent`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream", "x-agent-eval": "battery" }, body: JSON.stringify({ history, shown, state }) }); }
    catch (e) { if (attempt === 2) return { error: e.message, text: "", s: 0 }; await new Promise((res) => setTimeout(res, gap)); continue; }
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 20_000)); continue; }
    if (!r.ok) return { error: `HTTP ${r.status}`, text: "", s: 0 };
    const out = { text: "", meta: null, state: null, trace: [] };
    for (const line of (await r.text()).split("\n")) {
      if (!line.startsWith("data:")) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "TEXT_MESSAGE_CONTENT") out.text += ev.delta ?? "";
      else if (ev.type === "CUSTOM" && ev.name === "trace") out.trace.push(`${ev.value.step} · ${ev.value.detail}`);
      else if (ev.type === "STATE_SNAPSHOT") out.state = ev.snapshot;
      else if (ev.type === "RUN_FINISHED") out.meta = ev.result;
    }
    return { ...out, s: (Date.now() - t0) / 1000 };
  }
  return { error: "rate-limited", text: "", s: 0 };
}

const rows = [];
for (const conv of fixture.conversations) {
  if (only && !only.includes(conv.category)) continue;
  const refuseOk = fixture.refuse.includes(conv.category);
  let history = [], shown = [], state = null;
  for (const user of conv.turns) {
    const r = await ask([...history, { user }], shown, state);
    const text = r.text.trim(), mode = r.meta?.mode ?? (r.error ? "error" : "none"), flags = [];
    if (r.error) flags.push("error");
    if (!refuseOk && DEAD.test(text)) flags.push("dead-end");
    if (!refuseOk && ["router", "scope", "guard"].includes(mode) && !DEAD.test(text)) flags.push("no-model");
    if (LEAK.test(text)) flags.push("leak");
    if (r.s > 8) flags.push("slow");
    rows.push({ category: conv.category, user, mode, model: r.meta?.model ?? "", s: r.s, text, flags, cut: (r.trace ?? []).filter((t) => /removed|no answer|non-answer/.test(t)) });
    console.log(`${flags.length ? "✗" : "✓"} [${conv.category}] ${user}  (${mode} ${r.s.toFixed(1)}s${flags.length ? " · " + flags.join(" ") : ""})${flags.length ? `\n    ${text.slice(0, 200)}` : ""}`);
    if (!["scope", "guard"].includes(mode)) history.push({ user, ...(text ? { agent: text.slice(0, 2000) } : {}) });
    state = r.state ?? state; shown = state?.shown ?? shown;
    await new Promise((res) => setTimeout(res, gap));
  }
}

const count = (f) => rows.filter((r) => r.flags.includes(f)).length;
const times = rows.filter((r) => !r.error).map((r) => r.s).sort((a, b) => a - b);
const pct = (p) => (times.length ? times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1) : "-");
const byModel = rows.filter((r) => r.mode === "model" || r.mode === "cache").length;
const report = [
  `### Battery: ${rows.length} turns against ${base}`,
  `| answered by a model | dead ends | no model | leaks | slow | errors | median | p90 | max |`,
  `|---|---|---|---|---|---|---|---|---|`,
  `| ${byModel} | ${count("dead-end")} | ${count("no-model")} | ${count("leak")} | ${count("slow")} | ${count("error")} | ${pct(0.5)}s | ${pct(0.9)}s | ${times.at(-1)?.toFixed(1) ?? "-"}s |`,
  ...rows.filter((r) => r.flags.some((f) => f !== "slow")).map((r) => `- **${r.flags.join(", ")}** [${r.category}] “${r.user}” → ${r.text.slice(0, 160).replace(/\|/g, "/")}`),
].join("\n");
console.log("\n" + report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
const maxDead = Number(process.env.MAX_DEAD ?? 3);
if (count("dead-end") > maxDead || count("leak") > 0 || count("error") > 5) { console.error(`failed: ${count("dead-end")} dead ends (max ${maxDead}), ${count("leak")} leaks, ${count("error")} errors`); process.exit(1); }
