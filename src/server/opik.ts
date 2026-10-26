import { Opik } from "opik";
import type { AgentEvent, ModelClient, RunMeta, Screen } from "@/agent/types";

/** Opik tracing for the agent: one trace per visitor turn, threaded by session, with a guardrail span for the
 *  prompt guard, an llm span per model call (fallbacks included) and a tool span per tool the agent ran.
 *  The model clients are plain fetch calls, so there is no framework integration to lean on: spans are manual. */

let client: Opik | null | undefined;
/** The shared client, or undefined when OPIK_API_KEY is not set (local runs without it, tests). */
export function opikClient(env = process.env): Opik | undefined {
  if (client === undefined) {
    client = env.OPIK_API_KEY
      ? new Opik({ apiKey: env.OPIK_API_KEY, workspaceName: env.OPIK_WORKSPACE ?? "mohammad-rizwan", projectName: env.OPIK_PROJECT_NAME ?? "Portfolio agent", apiUrl: env.OPIK_URL_OVERRIDE ?? "https://www.comet.com/opik/api" })
      : null;
  }
  return client ?? undefined;
}

const PROVIDER = (name: string) => (/gemini/i.test(name) ? "google_ai" : "groq");
const error = (e: unknown) => ({ exceptionType: e instanceof Error ? e.name : "Error", message: e instanceof Error ? e.message.slice(0, 500) : String(e), traceback: e instanceof Error ? (e.stack ?? "").slice(0, 2000) : "" });

export interface TurnTrace {
  models: (list: ModelClient[]) => ModelClient[];
  screen: (s: Screen) => Screen;
  event: (ev: AgentEvent) => void;
  end: (r: { meta?: RunMeta; events: AgentEvent[]; error?: string }) => Promise<void>;
}

export function traceTurn(c: Opik, t: { question: string; turns: string[]; session?: string; killed: boolean; country?: string }): TurnTrace {
  const trace = c.trace({ name: "agent-turn", input: { question: t.question, turns: t.turns }, threadId: t.session, metadata: { killed: t.killed, country: t.country }, tags: ["portfolio"] });
  return {
    // each model in the chain gets its own llm span, so a 429 on key 1 and the fallback that answered both show
    models: (list) => list.map((m) => ({
      name: m.name,
      complete: async (messages, signal) => {
        const span = trace.span({ name: m.name, type: "llm", input: { messages }, model: m.name.split(" · ")[0], provider: PROVIDER(m.name) });
        try {
          const out = await m.complete(messages, signal);
          span.update({ output: { content: out.content ?? null, tool_calls: out.tool_calls ?? [] } }).end();
          return out;
        } catch (e) {
          span.update({ errorInfo: error(e) }).end();
          throw e;
        }
      },
    })),
    screen: (s) => async (text, signal) => {
      const span = trace.span({ name: "prompt-guard", type: "guardrail", input: { text } });
      const r = await s(text, signal);
      span.update({ output: r }).end();
      return r;
    },
    event: (ev) => {
      if (ev.type === "tool") trace.span({ name: ev.name, type: "tool", input: ev.args }).end();
    },
    end: async ({ meta, events, error: err }) => {
      const answer = events.filter((e): e is Extract<AgentEvent, { type: "text" }> => e.type === "text").map((e) => e.text).join(" ").trim();
      const steps = events.filter((e): e is Extract<AgentEvent, { type: "trace" }> => e.type === "trace").map(({ step, detail, level }) => ({ step, detail, level }));
      trace.update({
        output: { answer, panels: events.flatMap((e) => (e.type === "panel" ? [e.panel] : [])) },
        metadata: { mode: meta?.mode, model: meta?.model, fallback: meta?.fallback, tools: meta?.tools, harness: steps },
        tags: ["portfolio", meta?.mode ?? "unknown"],
        ...(err ? { errorInfo: { exceptionType: "AgentError", message: err, traceback: "" } } : {}),
      }).end();
      await c.flush();
    },
  };
}
