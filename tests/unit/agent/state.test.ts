import { describe, expect, it } from "vitest";
import { contextBlock, EMPTY_STATE, nextState, sanitizeState } from "@/agent/state";

describe("session state", () => {
  it("a state from the client is a claim: unknown ids and fields are dropped, sizes capped, junk is empty", () => {
    expect(sanitizeState(undefined)).toEqual(EMPTY_STATE);
    expect(sanitizeState("nope")).toEqual(EMPTY_STATE);
    const s = sanitizeState({ focus: "nope", shown: ["pack", "nope", "profile", "pack"], offered: ["resume", "wallet"], visitor: { name: "x".repeat(200), evil: "y", company: 3 }, topics: Array.from({ length: 15 }, (_, i) => `t${i}`) });
    expect(s).toEqual({ focus: null, shown: ["pack", "profile"], offered: ["resume"], visitor: { name: "x".repeat(80) }, topics: Array.from({ length: 10 }, (_, i) => `t${i + 5}`) });
    expect(sanitizeState({ focus: "pack" }).focus).toBe("pack");
  });
  it("the next state reads the turn's events: what was opened, shown, offered and searched, on top of what was there", () => {
    const s = nextState({ ...EMPTY_STATE, shown: ["profile"], visitor: { name: "Priya" } }, [
      { type: "tool", name: "search_projects", args: { query: "voice agents" } },
      { type: "tool", name: "open_project", args: { id: "pack" } },
      { type: "panel", panel: { kind: "project", id: "pack" } },
      { type: "tool", name: "offer_resume", args: {} },
      { type: "approval", action: "contact" },
      { type: "text", text: "…" },
    ], ["ccr"], { company: "Razorpay" });
    expect(s).toEqual({ focus: "pack", shown: ["profile", "ccr", "pack"], offered: ["resume", "contact"], visitor: { name: "Priya", company: "Razorpay" }, topics: ["voice agents"] });
    expect(nextState(s, [{ type: "tool", name: "open_project", args: { id: "nope" } }]).focus).toBe("pack"); // a bad id never becomes the focus
  });
  it("the prompt block names what the model should know, and is empty when nothing happened", () => {
    expect(contextBlock(EMPTY_STATE)).toBe("");
    expect(contextBlock({ focus: "pack", shown: ["pack", "finboom", "done:resume"], offered: ["resume"], visitor: { name: "Priya", company: "Razorpay", hiringFor: "backend engineer" }, topics: ["voice agents"] })).toBe(
      "Conversation so far:\nFocused project: PACK.\nAlready on screen: PACK, FinBoom, his resume.\nAlready offered: resume.\nVisitor: Priya, Razorpay, hiring for backend engineer. Use their name once, not every turn. Tailor answers to that role.\nAsked about so far: voice agents.");
    expect(contextBlock({ ...EMPTY_STATE, visitor: { hiringFor: "SDE" } })).toBe("Conversation so far:\nVisitor: unnamed, hiring for SDE. Tailor answers to that role.");
  });
});
