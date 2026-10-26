export type PanelKind = "project" | "architecture" | "index" | "profile" | "harness" | "fit";
export type Level = "ok" | "info" | "warn" | "err";

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "panel"; panel: { kind: PanelKind; id?: string } }
  | { type: "approval"; action: "resume" | "contact" }
  | { type: "suggest"; options: string[] }
  | { type: "frontend"; name: "switch_mode"; args: { mode: "classic" | "agent" } }
  | { type: "trace"; step: string; detail: string; level: Level };

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
}

export interface RunInput {
  turns: string[];
  shown: string[];
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
  complete(messages: ChatMessage[], signal: AbortSignal): Promise<AssistantMessage>;
}

export class ModelError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ModelError";
  }
}

export type Screen = (text: string, signal: AbortSignal) => Promise<{ ok: boolean; note: string }>;
