import { createHash } from "node:crypto";
import { EventEncoder } from "@ag-ui/encoder";
import { z } from "zod";
import { isProjectId } from "@/content/data";
import { newIds, runError, runFinished, runStarted, toAgui } from "./agui";
import { cacheKey, makeCache, type AnswerCache } from "./cache";
import { groqScreen, modelChain } from "./models";
import { nextState, sanitizeState } from "./state";
import { neonRetriever, type Retriever } from "@/server/retrieval";
import { nemotronSelfCheck, type SelfCheck } from "./check";
import { introFacts, ruleKind } from "./behavior";
import { classifierEndpoints, nemotronClassifier, type Classifier } from "./classify";
import { router } from "./router";
import { isAttack } from "./scope";
import { waitUntil } from "@vercel/functions";
import * as Sentry from "@sentry/nextjs";
import { neonTurnLog, type TurnLogger } from "@/server/log";
import { opikClient, traceTurn, type TurnTrace } from "@/server/opik";
import { runAgent, SYSTEM } from "./run";
import { ALL_FACTS_SOURCE, TOOL_DEFS, toolContext } from "./tools";
import type { AgentEvent, Exchange, ModelClient, RunMeta, Screen } from "./types";

// modelRunsPerDay: Groq's free tier allows 1,000 requests/day per model and a run makes 2–3, so ~600 runs across both models.
// turnChars fits a pasted job description; bodyBytes fits six of them
// the prompt, the tools and every fact the tools return: changing any of them must not serve old answers
const PROMPT_HASH = [...`${SYSTEM}${JSON.stringify(TOOL_DEFS)}${ALL_FACTS_SOURCE}${toolContext("show_harness")}`].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7).toString(36);

// a collision-resistant digest: a forged state or agent turn can never share a key with the canonical prompt
const digest = (s: string) => createHash("sha256").update(s).digest("base64url").slice(0, 32);
export const LIMITS = { bodyBytes: 24576, turnChars: 2000, turns: 6, shown: 20, perMinute: 12, modelRunsPerDay: 600 } as const;
const SHOWN_OK = new Set(["profile", "index", "harness", "done:resume", "done:contact"]);

const ExchangeBody = z.object({ user: z.string(), agent: z.string().optional(), showed: z.array(z.string()).max(5).optional() });
const Body = z.object({
  turns: z.array(z.string()).optional(),
  /** the conversation so far, newest last: replaces `turns`, which old clients still send */
  history: z.array(ExchangeBody).optional(),
  shown: z.array(z.string()).optional().default([]),
  killModel: z.boolean().optional().default(false),
  /** the session state from the last snapshot; a claim, sanitised before use */
  state: z.unknown().optional(),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional(),
});

export interface HandlerDeps {
  models: () => ModelClient[];
  screen: Screen;
  /** the outer agent that sorts each message into a kind (src/agent/behavior.ts) */
  classify?: Classifier;
  retriever?: Retriever;
  selfCheck?: SelfCheck;
  cache: AnswerCache;
  now: () => number;
  /** stores each finished turn (Neon in production); absent locally and in tests */
  log?: TurnLogger;
  /** opens an Opik trace for one turn (when OPIK_API_KEY is set) */
  tracer?: (t: { question: string; turns: string[]; session?: string; killed: boolean; country?: string }) => TurnTrace | undefined;
}

export function defaultDeps(env = process.env): HandlerDeps {
  const groqKeys = [env.GROQ_API_KEY, ...(env.GROQ_API_KEYS_FALLBACK ?? "").split(",")].map((k) => k?.trim() ?? "").filter(Boolean);
  return {
    models: () => modelChain(groqKeys, env.GEMINI_API_KEY?.trim() || undefined, fetch, env.OPENROUTER_API_KEY?.trim() || undefined, env.NVIDIA_API_KEY?.trim() || undefined),
    screen: groqScreen(groqKeys),
    classify: nemotronClassifier(classifierEndpoints(env.NVIDIA_API_KEY?.trim() || undefined, env.OPENROUTER_API_KEY?.trim() || undefined)),
    retriever: neonRetriever(env.DATABASE_URL, env.NVIDIA_API_KEY?.trim() || undefined),
    selfCheck: nemotronSelfCheck(env.NVIDIA_API_KEY?.trim() || undefined),
    cache: makeCache(),
    now: () => Date.now(),
    log: neonTurnLog(env.DATABASE_URL),
    tracer: (t) => { const c = opikClient(env); return c ? traceTurn(c, t) : undefined; },
  };
}

// Per-IP sliding window and a daily model budget. In-memory per warm instance; Vercel WAF adds the hard edge limit.
const hits = new Map<string, number[]>();
let budget = { day: "", runs: 0 };
export function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
  return recent.length > LIMITS.perMinute;
}
function overBudget(now: number): boolean {
  const day = new Date(now).toISOString().slice(0, 10);
  if (budget.day !== day) budget = { day, runs: 0 };
  return budget.runs >= LIMITS.modelRunsPerDay;
}
export const _resetLimits = () => { hits.clear(); budget = { day: "", runs: 0 }; };

/** POST /api/agent → AG-UI event stream (SSE). Never throws to the client; every run ends with RUN_FINISHED or RUN_ERROR. */
export async function handleAgent(req: Request, deps: HandlerDeps, ip = "anon"): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > LIMITS.bodyBytes) return new Response("payload too large", { status: 413 });
  const raw = await req.text();
  if (raw.length > LIMITS.bodyBytes) return new Response("payload too large", { status: 413 });
  let parsed: z.infer<typeof Body>;
  try { parsed = Body.parse(JSON.parse(raw)); } catch { return new Response("bad request", { status: 400 }); }

  const trim = (t: string) => t.trim().slice(0, LIMITS.turnChars);
  const history = (parsed.history ?? parsed.turns?.map((user): z.infer<typeof ExchangeBody> => ({ user })) ?? [])
    .map((h): Exchange => ({ user: trim(h.user), ...(h.agent?.trim() && !isAttack(h.agent) ? { agent: trim(h.agent) } : {}), ...(h.showed?.length ? { showed: h.showed.map((s) => s.trim().slice(0, 80)).filter((s) => s && !isAttack(s)) } : {}) }))
    .filter((h) => h.user).slice(-LIMITS.turns);
  const turns = history.map((h) => h.user);
  if (!turns.length) return new Response("bad request", { status: 400 });
  const state = sanitizeState(parsed.state);
  const shown = [...new Set([...state.shown, ...parsed.shown.map(String)])].filter((s) => isProjectId(s) || SHOWN_OK.has(s)).slice(0, LIMITS.shown);
  const now = deps.now();
  if (rateLimited(ip, now)) return new Response("slow down", { status: 429, headers: { "Retry-After": "60" } });

  const encoder = new EventEncoder({ accept: req.headers.get("accept") ?? undefined });
  const { threadId: newThread, runId } = newIds();
  const threadId = parsed.threadId ?? newThread;
  const ctl = new AbortController();
  req.signal?.addEventListener("abort", () => ctl.abort());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const te = new TextEncoder();
      const send = (e: Parameters<typeof encoder.encode>[0]) => { try { controller.enqueue(te.encode(encoder.encode(e))); } catch { /* client gone */ } };
      const country = req.headers.get("x-vercel-ip-country") ?? undefined;
      const tt = deps.tracer?.({ question: turns.at(-1)!, turns, session: parsed.threadId, killed: parsed.killModel, country });
      const seen: AgentEvent[] = [];
      const emit = (ev: AgentEvent) => { seen.push(ev); tt?.event(ev); toAgui(ev).forEach(send); };
      let meta: RunMeta | undefined, error: string | undefined;
      send(runStarted(threadId, runId));
      try {
        // everything that shapes the prompt is in the key: the conversation as sent (its agent turns too), the whole
        // sanitised state (focus, visitor, fit, a pending question that rewrites the message), and the prompt itself
        const key = `${cacheKey(turns, shown)}:${digest(JSON.stringify([history.map((h) => [h.agent ?? "", h.showed ?? []]), state]))}:${PROMPT_HASH}`;
        const hit = !parsed.killModel ? deps.cache.get(key) : undefined;
        if (hit) {
          emit({ type: "trace", step: "cache", detail: "same question answered before · replayed, 0 tokens", level: "ok" });
          hit.forEach(emit);
          // a replayed introduction still tells the state who the visitor is: the name is in the message itself
          const facts = ruleKind(turns.at(-1)!) === "visitor_intro" ? introFacts(turns.at(-1)!) : {};
          meta = { mode: "cache", ...(Object.keys(facts).length ? { visitor: facts } : {}) };
        } else {
          const recorded: AgentEvent[] = [];
          const record = (ev: AgentEvent) => { if (ev.type !== "trace" && ev.type !== "state") recorded.push(ev); emit(ev); };
          const budgetOut = overBudget(now);
          if (!budgetOut) budget.runs++; // counted up front, so a burst of concurrent runs cannot all slip under the cap
          if (budgetOut) emit({ type: "trace", step: "budget", detail: "daily model budget used up · deterministic router only", level: "warn" });
          meta = await runAgent({ turns, history, shown, state, killModel: parsed.killModel || budgetOut }, record, { models: tt ? tt.models(deps.models()) : deps.models(), screen: tt ? tt.screen(deps.screen) : deps.screen, classify: deps.classify, retriever: deps.retriever, selfCheck: deps.selfCheck, signal: ctl.signal });
          if (!budgetOut && meta.mode !== "model" && meta.mode !== "partial") budget.runs--; // no model was used after all
          if (meta.mode === "model" && !meta.stock) deps.cache.set(key, recorded);
        }
        emit({ type: "state", state: nextState(state, seen, shown, meta.visitor) });
        const { visitor: _visitor, ...result } = meta;
        send(runFinished(threadId, runId, result));
      } catch (err) {
        console.error("agent run failed", err);
        error = err instanceof Error ? err.message.slice(0, 300) : "unknown error";
        Sentry.captureException(err); // the visitor still gets an answer from the router below
        // last line of defence: the deterministic router still answers
        try {
          emit({ type: "trace", step: "fallback", detail: "unexpected error · deterministic router", level: "err" });
          router(turns.at(-1)!, emit);
          meta = { mode: "router" };
          send(runFinished(threadId, runId, meta));
        } catch { send(runError("The agent hit an error. Try again.")); }
      } finally {
        controller.close();
        // the visitor already has the answer; the log write runs after the response, and never fails the turn
        const row = { session: parsed.threadId, turn: history.length, question: turns.at(-1)!, events: seen, meta, ms: deps.now() - now, killed: parsed.killModel, country, error };
        if (deps.log) waitUntil(deps.log(row).catch((e) => console.error("turn log failed", e instanceof Error ? e.message : e)));
        if (tt) waitUntil(tt.end({ meta, events: seen, error }).catch((e) => console.error("opik trace failed", e instanceof Error ? e.message : e)));
      }
    },
    cancel() { ctl.abort(); },
  });

  return new Response(stream, { headers: { "Content-Type": encoder.getContentType(), "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
