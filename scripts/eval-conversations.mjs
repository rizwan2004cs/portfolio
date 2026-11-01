// Replays scripted conversations (tests/fixtures/conversations.json) against a running site the way the client does:
// each turn carries the exchanges so far and the session state the server sent back. A conversation passes when every
// turn's mode is one of those allowed, its text matches, and the panel it names was shown.
//   node scripts/eval-conversations.mjs http://localhost:3010        MIN_PASS=0.9 (share of conversations) · ONLY=regex
import { appendFileSync, readFileSync } from "node:fs";

const base = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3010").replace(/\/$/, "");
const only = process.env.ONLY ? new RegExp(process.env.ONLY, "i") : null;
const convos = JSON.parse(readFileSync(new URL("../tests/fixtures/conversations.json", import.meta.url), "utf8")).filter((c) => !only || only.test(c.name));
const gap = Number(process.env.GAP_MS ?? 5200); // the route allows 12 requests a minute per address

async function ask(history, shown, state) {
  const r = await fetch(`${base}/api/agent`, { method: "POST", headers: { "content-type": "application/json", accept: "text/event-stream" }, body: JSON.stringify({ history, shown, state }) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const out = { text: "", panels: [], meta: null, state: null, trace: [] };
  for (const line of (await r.text()).split("\n")) {
    if (!line.startsWith("data:")) continue;
    let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
    if (ev.type === "TEXT_MESSAGE_CONTENT") out.text += ev.delta ?? "";
    else if (ev.type === "CUSTOM" && ev.name === "panel") out.panels.push(ev.value.kind, ...(ev.value.id ? [ev.value.id] : []));
    else if (ev.type === "CUSTOM" && ev.name === "trace") out.trace.push(`${ev.value.step} · ${ev.value.detail}`);
    else if (ev.type === "STATE_SNAPSHOT") out.state = ev.snapshot;
    else if (ev.type === "RUN_FINISHED") out.meta = ev.result;
  }
  return out;
}

const rows = [];
for (const c of convos) {
  let history = [], shown = [], state = null, failed = null;
  for (const t of c.turns) {
    let r;
    try { r = await ask([...history, { user: t.user }], shown, state); } catch (e) { failed = `${t.user} → ${e.message}`; break; }
    const mode = r.meta?.mode ?? "none";
    const why = t.mode && !t.mode.includes(mode) ? `mode ${mode}, wanted ${t.mode.join("|")}` : t.text && !new RegExp(t.text, "s").test(r.text) ? `text did not match /${t.text}/: “${r.text.slice(0, 80)}”` : t.panel && !r.panels.includes(t.panel) ? `panel ${t.panel} not shown (${r.panels.join(",") || "none"})` : null;
    if (why) { failed = `${t.user} → ${why}`; break; }
    if (!["scope", "guard"].includes(mode)) history.push({ user: t.user, ...(r.text ? { agent: r.text.slice(0, 2000) } : {}), ...(r.panels.length ? { showed: [...new Set(r.panels)].slice(0, 5) } : {}) });
    shown = [...new Set([...shown, ...r.panels.filter((p) => /^[a-z]+$/.test(p) && !["fit", "compare", "project", "architecture"].includes(p))])];
    state = r.state ?? state;
    await new Promise((res) => setTimeout(res, gap));
  }
  rows.push({ name: c.name, ok: !failed, failed });
  console.log(`${failed ? "✗" : "✓"} ${c.name}${failed ? `\n    ${failed}` : ""}`);
}
const passed = rows.filter((r) => r.ok).length, share = passed / rows.length;
const report = [`### Conversations: ${passed}/${rows.length} (${(share * 100).toFixed(0)}%) against ${base}`, ...rows.filter((r) => !r.ok).map((r) => `- ${r.name}: ${r.failed}`)].join("\n");
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + "\n");
if (share < Number(process.env.MIN_PASS ?? 0.9)) { console.error(`below ${process.env.MIN_PASS ?? 0.9}`); process.exit(1); }
