"""Summarise the latest run: per-metric pass/fail and every failing case with the agent's output.

    .venv/bin/python summarize.py            # reads results/test_run_*.json + results/transcripts.jsonl
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESULTS = HERE / "results"


def load_runs() -> list[dict]:
    runs = sorted(RESULTS.glob("test_run_*.json"))
    if not runs:
        raise SystemExit("no results/test_run_*.json found; run `deepeval test run .` first")
    return [json.loads(p.read_text()) for p in runs]


def main() -> None:
    goldens = {g["name"]: g for g in json.loads((HERE / ".dataset.json").read_text())}
    goldens |= {g["name"]: g for g in json.loads((HERE / ".dataset.multiturn.json").read_text())}
    transcripts = {}
    tp = RESULTS / "transcripts.jsonl"
    if tp.exists():
        for line in tp.read_text().splitlines():
            if line.strip():
                t = json.loads(line)
                transcripts[t["name"]] = t

    # newest run file wins per test case (single- and multi-turn files may be run separately)
    cases: dict[str, dict] = {}
    for run in load_runs():
        for tc in (run.get("testCases") or []) + (run.get("conversationalTestCases") or []):
            cases[tc.get("name") or tc.get("input")] = tc

    per_metric = defaultdict(lambda: {"pass": 0, "fail": 0, "error": 0})
    rows, failures = [], []
    for name, tc in cases.items():
        g = goldens.get(name, {})
        cat = (g.get("additional_metadata") or {}).get("category", "?")
        failed = []
        for m in tc.get("metricsData") or []:
            key = m["name"]
            if m.get("error"):
                per_metric[key]["error"] += 1
                failed.append(f"{key}: ERROR {m['error'][:160]}")
            elif m.get("success"):
                per_metric[key]["pass"] += 1
            else:
                per_metric[key]["fail"] += 1
                score = m.get("score")
                failed.append(f"{key} ({score if score is None else round(score, 2)} < {m.get('threshold')}): {(m.get('reason') or '')[:400]}")
        t = transcripts.get(name, {})
        rows.append((name, cat, "PASS" if not failed else "FAIL", t))
        if failed:
            failures.append((name, cat, g, t, failed))

    out = ["# Portfolio agent eval summary", ""]
    out.append(f"Cases: {len(rows)} · passed {sum(r[2] == 'PASS' for r in rows)} · failed {len(failures)}")
    out += ["", "## Per metric", "", "| Metric | Pass | Fail | Error |", "| --- | --- | --- | --- |"]
    for k, v in sorted(per_metric.items()):
        out.append(f"| {k} | {v['pass']} | {v['fail']} | {v['error']} |")
    out += ["", "## Per case", "", "| Case | Category | Result | Mode | Panels | Answer |", "| --- | --- | --- | --- | --- | --- |"]
    for name, cat, res, t in rows:
        r = t if "mode" in t else (t.get("runs") or [{}])[-1]
        ans = (r.get("text") or "").replace("|", "\\|").replace("\n", " ")
        out.append(f"| {name} | {cat} | {res} | {r.get('mode', '?')} | {', '.join(r.get('panels') or []) or '-'} | {ans[:140]} |")
    out += ["", "## Failures", ""]
    for name, cat, g, t, failed in failures:
        meta = g.get("additional_metadata") or {}
        out.append(f"### {name} ({cat})")
        if "runs" in t:
            for i, (turn, r) in enumerate(zip(t.get("turns", []), t["runs"])):
                out.append(f"- turn {i + 1} input: `{turn}` → mode `{r.get('mode')}`, panels `{r.get('panels')}`")
                out.append(f"  - output: {r.get('text')!r}")
            out.append(f"- expected: {g.get('expected_outcome')}")
        else:
            out.append(f"- input: `{g.get('input')}` (shown={meta.get('shown')}, killModel={meta.get('killModel')})")
            out.append(f"- output: {t.get('text')!r}")
            out.append(f"- mode `{t.get('mode')}` · panels `{t.get('panels')}` · tools `{t.get('tools')}`{' · retried after 429' if t.get('retried') else ''}")
            exp = [f"panel /{meta['expect_panel']}/" if meta.get("expect_panel") else None,
                   f"tools {[x['name'] for x in g.get('expected_tools') or []]}" if g.get("expected_tools") else None,
                   f"text !~ /{meta['forbid']}/" if meta.get("forbid") and cat != "attack" else None,
                   f"text ~ /{meta['require']}/" if meta.get("require") else None,
                   "refusal without leak" if cat == "attack" else None,
                   "only facts from retrieval_context" if cat in ("ground", "legit", "event") else None]
            out.append(f"- expected: {'; '.join(e for e in exp if e)}")
            traces = [x for x in t.get("traces", []) if any(s in x for s in ("grounding", "policy", "429", "failed", "fallback", "scope", "guard"))]
            if traces:
                out.append(f"- traces: {traces}")
        out += [f"- failed: {f}" for f in failed] + [""]
    (RESULTS / "summary.md").write_text("\n".join(out) + "\n")
    (RESULTS / "summary.json").write_text(json.dumps({"per_metric": per_metric, "failures": [f[0] for f in failures],
                                                      "cases": {r[0]: r[2] for r in rows}}, indent=2) + "\n")
    print("\n".join(out[: 8 + len(per_metric)]))
    print(f"\nwrote {RESULTS / 'summary.md'}")


if __name__ == "__main__":
    main()
