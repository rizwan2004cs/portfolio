import { EventType, type BaseEvent } from "@ag-ui/core";
import type { AgentEvent, RunMeta } from "./types";

let seq = 0;
const id = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

/** Maps one harness event onto AG-UI protocol events.
 *  text → TEXT_MESSAGE_START/CONTENT/END · tool → TOOL_CALL_START/ARGS/END ·
 *  panels, approvals, suggestions, frontend tools and trace → CUSTOM (name = kind). */
export function toAgui(ev: AgentEvent): BaseEvent[] {
  switch (ev.type) {
    case "text": {
      const messageId = id("msg");
      return [
        { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" } as BaseEvent,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: ev.text } as BaseEvent,
        { type: EventType.TEXT_MESSAGE_END, messageId } as BaseEvent,
      ];
    }
    case "tool": {
      const toolCallId = id("call");
      return [
        { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: ev.name } as BaseEvent,
        { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(ev.args) } as BaseEvent,
        { type: EventType.TOOL_CALL_END, toolCallId } as BaseEvent,
      ];
    }
    case "panel": return [custom("panel", ev.panel)];
    case "approval": return [custom("approval", { action: ev.action })];
    case "suggest": return [custom("suggest", { options: ev.options })];
    case "frontend": return [custom("frontend_tool", { name: ev.name, args: ev.args })];
    case "trace": return [custom("trace", { step: ev.step, detail: ev.detail, level: ev.level })];
  }
}

const custom = (name: string, value: unknown) => ({ type: EventType.CUSTOM, name, value }) as BaseEvent;
export const runStarted = (threadId: string, runId: string) => ({ type: EventType.RUN_STARTED, threadId, runId }) as BaseEvent;
export const runFinished = (threadId: string, runId: string, result: RunMeta) => ({ type: EventType.RUN_FINISHED, threadId, runId, result }) as BaseEvent;
export const runError = (message: string) => ({ type: EventType.RUN_ERROR, message }) as BaseEvent;
export const newIds = () => ({ threadId: id("thread"), runId: id("run") });
