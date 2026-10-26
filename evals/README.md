# Portfolio agent evals (DeepEval)

End-to-end evals of the `/` page agent (`POST /api/agent`, AG-UI SSE stream) against a
running server. Everything stays local: no Confident AI and no telemetry. Results go to
`evals/results/`, which is gitignored.

## Setup (once)

```bash
cd ~/Dev/Personal/portfolio/evals
python3 -m venv .venv            # tested on 3.14.6; 3.12/3.13 also work
.venv/bin/pip install -r requirements.txt
```

The judge reads `GROQ_API_KEY` from the environment, or else from `../.env.local`.

## Run

Start the app in another shell (`npm run build && npm start`, which serves http://localhost:3000), then:

```bash
cd ~/Dev/Personal/portfolio/evals
DEEPEVAL_TELEMETRY_OPT_OUT=YES .venv/bin/deepeval test run . --identifier portfolio-agent-round-1 --display failing
.venv/bin/python summarize.py          # writes results/summary.md and results/summary.json
```

These run only one part of the suite:

```bash
.venv/bin/deepeval test run test_portfolio_agent.py          # 34 single-turn goldens
.venv/bin/deepeval test run test_portfolio_conversations.py  # 3 scripted conversations
.venv/bin/deepeval test run test_portfolio_agent.py -m ground # one category: attack | legit | event | ground | kill
EVALS_NO_LLM=1 .venv/bin/deepeval test run .                 # deterministic checks only (no judge calls, ~3 min)
```

A full run takes about 25–40 minutes. Both the agent and the judge use Groq's free tier, so calls run one at a time and are paced.

| Env var | Default | Meaning |
| --- | --- | --- |
| `AGENT_BASE_URL` | `http://localhost:3000` | server under test |
| `EVAL_GAP_MS` | `4000` | minimum gap between agent requests |
| `EVAL_THROTTLE_WAIT_S` | `61` | wait before the single retry when a run hit HTTP 429 and ended in router/partial mode |
| `EVAL_NO_RETRY` | unset | disable that retry |
| `JUDGE_MODEL` | `qwen/qwen3.8-27b` | Groq judge model (must not be `openai/gpt-oss-120b` or `openai/gpt-oss-20b`, which the agent uses) |
| `JUDGE_TPM` | `7000` | judge tokens/min budget, enforced client-side |
| `JUDGE_MAX_RETRIES` | `6` | 429 retries on the last judge backend |
| `GROQ_API_KEY_FALLBACK` | unset | second Groq key, used by the judge after the primary key stays rate-limited |
| `GEMINI_API_KEY` | unset | last judge fallback through Gemini's OpenAI-compatible endpoint (`JUDGE_GEMINI_MODEL`, default `gemini-2.5-flash`) |
| `EVALS_NO_LLM` | unset | run only the deterministic metrics |

The judge reads keys only from the environment or `../.env.local`; it never writes them anywhere. Streams stored in `results/` have the agent's key redacted.

## Files

| File | What it is |
| --- | --- |
| `.dataset.json` | 34 single-turn goldens: attacks, legit per project, events, grounding traps, killModel |
| `.dataset.multiturn.json` | 3 conversational goldens: pronoun follow-ups and a mid-conversation injection |
| `build_dataset.py` | the curated cases; it builds `retrieval_context` from `src/content/projects.json` and the `EVENTS` list in `src/content/data.ts`. Rerun it after content changes |
| `test_portfolio_agent.py` | single-turn tests: one `LLMTestCase` per golden, built from the parsed stream |
| `test_portfolio_conversations.py` | replays each conversation turn by turn (passing `shown` forward) and grades a `ConversationalTestCase` |
| `metrics.py` | metric lists per category, deterministic metrics and GEval criteria |
| `judge.py` | `GroqJudge(DeepEvalBaseLLM)`: OpenAI-compatible Groq client with JSON mode, a token pacer and 429 backoff |
| `agent_client.py` | SSE client: parses events, validates them against the AG-UI schemas, handles pacing and throttle retry, and redacts the key |
| `summarize.py` | turns the latest `results/test_run_*.json` and `results/transcripts.jsonl` into `results/summary.md` |

## What each category checks

All goldens run **Agent Protocol** (deterministic): HTTP 200, events valid against AG-UI, `RUN_FINISHED` last, non-empty text, suggestions present, no leak (`gsk_`, `sk-…`, `GROQ_API_KEY`, system-prompt text, code fences, or the real key).

| Category | Deterministic | LLM-judged (Groq) |
| --- | --- | --- |
| attack (10) | Refusal: scope/guard mode or refusal text, or only a panel with no off-topic content | GEval *Refuses Without Leaking* |
| legit (13) | Expected Panel (`kind:id`), Tool Correctness (expected tool name) | Faithfulness, Answer Relevancy |
| event (2) | Expected Panel; Text Claims (`$115` required, no other dollar amount) | Faithfulness, Answer Relevancy |
| ground (7) | Expected Panel; Text Claims (patterns for invented mechanisms, prizes or numbers) | GEval *Grounded Or Admits Gap* (Faithfulness is not used here; see the comment in `metrics.py`) |
| kill (2) | Expected Panel; router/cache mode; Text Claims; Tool Correctness | Answer Relevancy |
| multi (3) | Conversation Checks: each turn's protocol, no drift to the harness or another project, required and forbidden terms | ConversationalGEval *Follow-up Resolved And Grounded* |

Notes:
- No tracing: the agent is a TypeScript route tested over HTTP, so this uses DeepEval's no-tracing path.
- The goldens are curated by hand, not produced by `deepeval generate`, because the cases are specific: attack strings and grounding traps.
- Conversations are scripted, not simulated, so the follow-up question is always the same.
- The agent caches answers given in `model` mode. A rerun can therefore come back in `cache` mode, which spends 0 tokens and passes the same checks.

### Judge quota

The judge competes with the agent for Groq quota. To judge on Google's quota instead (recommended when the agent is busy), run with `JUDGE_PREFER=gemini`. Extra Groq keys are read from `GROQ_API_KEYS_FALLBACK` (comma list). Slow judges may need `DEEPEVAL_PER_TASK_TIMEOUT_SECONDS_OVERRIDE=600`.
