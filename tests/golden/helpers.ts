import type { Classifier } from "@/agent/classify";
import { isToolName } from "@/agent/tools";
import { expect } from "vitest";
import { runAgent } from "@/agent/run";
import { ModelError, type AgentEvent, type AssistantMessage, type ChatMessage, type ModelClient, type RunInput, type RunMeta, type Screen } from "@/agent/types";

type Step = AssistantMessage | Error | ((messages: ChatMessage[]) => AssistantMessage);

/** A model that plays back a script, one step per call, and records what it was sent. */
export function scripted(name: string, steps: Step[]): ModelClient & { calls: ChatMessage[][] } {
  const calls: ChatMessage[][] = [];
  let i = 0;
  return {
    name,
    calls,
    async complete(messages) {
      calls.push(messages.map((m) => ({ ...m })) as ChatMessage[]);
      const s = steps[Math.min(i++, steps.length - 1)];
      if (s instanceof Error) throw s;
      return typeof s === "function" ? s(messages) : s;
    },
  };
}
export const http = (status: number) => new ModelError(`HTTP ${status}`, status);

let n = 0;
export const call = (name: string, args: unknown = {}) => ({ id: `c${++n}`, function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
export const say = (content: string, ...tool_calls: ReturnType<typeof call>[]): AssistantMessage => ({ content, tool_calls });
export const tools = (...tool_calls: ReturnType<typeof call>[]): AssistantMessage => ({ content: null, tool_calls });

export const passScreen: Screen = async () => ({ ok: true, note: "pass · <0.001" });
export const blockScreen: Screen = async () => ({ ok: false, note: "flagged · 0.999" });

export async function turn(input: Partial<RunInput> & { turns: string[] }, models: ModelClient[], screen: Screen = passScreen, signal = new AbortController().signal, classify?: Classifier) {
  const evs: AgentEvent[] = [];
  const meta: RunMeta = await runAgent({ shown: [], killModel: false, ...input }, (e) => evs.push(e), { models, screen, signal, classify });
  return { evs, meta, text: evs.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.text : "")).join(" "), of: <T extends AgentEvent["type"]>(t: T) => evs.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === t) };
}

/** The global invariant: never silent, always offers a next step, never leaves a tool call dangling. */
export function assertHealthy(r: Awaited<ReturnType<typeof turn>>) {
  expect(r.of("text").length, "turn must have text").toBeGreaterThan(0);
  expect(r.of("text").every((t) => t.text.trim().length > 0), "no empty text events").toBe(true);
  expect(r.of("suggest").length, "turn must offer next steps").toBeGreaterThan(0);
  for (const t of r.of("tool")) expect(isToolName(t.name), `tool ${t.name} must be real`).toBe(true);
  // a tool event for open_project must always be followed by its panel
  for (const t of r.of("tool").filter((x) => x.name === "open_project")) expect(r.of("panel").some((p) => p.panel.id === t.args.id), `panel for ${String(t.args.id)}`).toBe(true);
}
