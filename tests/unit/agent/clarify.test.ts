import { describe, expect, it } from "vitest";
import { resolvePending, whichOne } from "@/agent/clarify";
import { EMPTY_STATE, nextState, sanitizeState, contextBlock } from "@/agent/state";

describe("clarifying questions", () => {
  const pending = { question: "Which one do you mean?", options: ["Open PACK", "Open CCR Compliance Advisor"] };
  it("reads the visitor's answer by text, number, ordinal or project name; anything else is not an answer", () => {
    expect(resolvePending("2", pending)).toBe("Open CCR Compliance Advisor");
    expect(resolvePending("the second one", pending)).toBe("Open CCR Compliance Advisor");
    expect(resolvePending("open pack", pending)).toBe("Open PACK");
    expect(resolvePending("PACK please", pending)).toBe("Open PACK");
    expect(resolvePending("something else entirely", pending)).toBeNull();
    expect(resolvePending("2", undefined)).toBeNull();
  });
  it("asks which project only when the message names none and two or more are on screen", () => {
    expect(whichOne("the other one?", ["pack", "ccr", "finboom"], "pack")).toEqual({ question: "Which one do you mean?", options: ["Open CCR Compliance Advisor", "Open FinBoom"] });
    expect(whichOne("the other one?", ["pack", "ccr"], "pack")).toBeNull(); // exactly one other: no question
    expect(whichOne("that one", ["pack"], null)).toBeNull();
    expect(whichOne("how does PACK work?", ["pack", "ccr"], null)).toBeNull();
  });
  it("a question lives in state for one turn, is sanitised on the way back, and is in the prompt", () => {
    const s = nextState(EMPTY_STATE, [{ type: "tool", name: "ask_visitor", args: pending }]);
    expect(s.pending).toEqual(pending);
    expect(nextState(s, [{ type: "text", text: "x" }]).pending).toBeUndefined();
    expect(sanitizeState({ pending: { question: "q", options: ["a"] } }).pending).toBeUndefined();
    expect(sanitizeState({ pending }).pending).toEqual(pending);
    expect(contextBlock({ ...EMPTY_STATE, pending })).toContain('You just asked: "Which one do you mean?" with the options Open PACK / Open CCR Compliance Advisor');
  });
});
