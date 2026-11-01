import type { Visitor } from "./classify";
import type { SessionState } from "./state";
export type PanelKind = "project" | "architecture" | "index" | "profile" | "harness" | "fit" | "compare";
export type Level = "ok" | "info" | "warn" | "err";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "panel"; panel: { kind: PanelKind; id?: string } }
  | { type: "approval"; action: "resume" | "contact" }
  | { type: "suggest"; options: string[] }
  | { type: "frontend"; name: "switch_mode"; args: { mode: "classic" | "agent" } }
  | { type: "trace"; step: string; detail: string; level: Level }
  | { type: "state"; state: SessionState };

export type Emit = (ev: AgentEvent) => void;

export type RunMode = "model" | "router" | "facts" | "cache" | "scope" | "guard" | "partial" | "aborted";
export interface RunMeta {
  mode: RunMode;
  /** the answer fell back to a stock line ("Here’s X."): never worth caching */
  stock?: boolean;
  model?: string;
  ms?: number;
  tools?: number;
  fallback?: boolean;
  /** who the visitor said they are this turn, for the next state; stripped before the client sees the meta */
  visitor?: Visitor;
}

/** One exchange: what the visitor said and, once answered, what the agent replied and showed. */
export interface Exchange { user: string; agent?: string; showed?: string[] }
export interface RunInput {
  turns: string[];
  /** the conversation so far, newest last (its `user` fields are `turns`); absent from old clients */
  history?: Exchange[];
  shown: string[];
  /** what earlier turns established, echoed back by the client and sanitised on arrival */
  state?: SessionState;
  killModel: boolean;
}

export interface ToolCall {
  id: string;
  function: { name: string; arguments: string };
}
export interface AssistantMessage {
  role?: "assistant";
  content?: string | null;
  tool_calls?: ToolCall[];
}
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | (AssistantMessage & { role: "assistant" })
  | { role: "tool"; tool_call_id: string; content: string };

export interface ModelClient {
  name: string;
  /** `onTool` fires as soon as a streamed reply names a tool, before the arguments or the text have finished */
  complete(messages: ChatMessage[], signal: AbortSignal, onTool?: (name: string) => void): Promise<AssistantMessage>;
}

export class ModelError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ModelError";
  }
}

export type Screen = (text: string, signal: AbortSignal) => Promise<{ ok: boolean; note: string }>;
