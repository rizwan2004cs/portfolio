import { describe, expect, it } from "vitest";
import { toAgui } from "@/agent/agui";
import { call, streaming, turn } from "./helpers";

const work = async () => ({ kind: "work" as never, confidence: 0.95, source: "model" as const, note: "work · 0.95" });
const deltas = (r: Awaited<ReturnType<typeof turn>>) => r.evs.filter((e) => e.type === "delta").map((e) => (e.type === "delta" ? e.text : ""));

describe("golden · streaming", () => {
  it("sentences go out as the model writes them, the first waiting for the second, and the final text closes the message", async () => {
    const m = streaming("a", "PACK is a seven-agent Werewolf game. A LangGraph state machine runs each round. Each agent keeps its reasoning private.", [call("suggest", { options: ["x"] })]);
    const r = await turn({ turns: ["What is PACK?"], stream: true }, [m], undefined, undefined, work);
    const d = deltas(r);
    expect(d.length).toBeGreaterThanOrEqual(2);
    expect(d[0]).toBe("PACK is a seven-agent Werewolf game.");
    const final = r.evs.find((e) => e.type === "text");
    expect(final && final.type === "text" && final.stream).toBeTruthy();
    expect(r.text.startsWith(d.join(""))).toBe(true);
    expect(r.of("text").length).toBe(1);
  });
  it("a one-sentence shrug is never streamed: the next model answers instead", async () => {
    const shrug = streaming("weak", "His write-up doesn't cover that.", [call("suggest", { options: ["x"] })]);
    const good = streaming("good", "He has about five months of full-time work at Novulis Consulting. Before that he interned twice.", [call("suggest", { options: ["x"] })]);
    const r = await turn({ turns: ["What does he care about when he builds?"], stream: true }, [shrug, good], undefined, undefined, work);
    expect(deltas(r).join("")).not.toMatch(/doesn't cover/);
    expect(r.meta.model).toBe("good");
  });
  it("a sentence the fact check would drop stops the stream; it never reaches the visitor", async () => {
    const m = streaming("a", "PACK is a seven-agent Werewolf game. It runs on Kubernetes across three AWS regions for Shopify. A LangGraph state machine runs each round.", [call("suggest", { options: ["x"] })]);
    const r = await turn({ turns: ["What is PACK?"], stream: true }, [m], undefined, undefined, work);
    expect(deltas(r).join(" ")).not.toMatch(/Kubernetes|Shopify/);
    expect(r.text).not.toMatch(/Kubernetes|Shopify/);
  });
  it("a model that fails after sentences went out ends the turn with them, never a second answer", async () => {
    const dies = streaming("dies", "PACK is a seven-agent Werewolf game. A LangGraph state machine runs each round. Each agent keeps", [], 7, true);
    const next = streaming("next", "PACK is something else entirely.", [call("suggest", { options: ["x"] })]);
    const r = await turn({ turns: ["What is PACK?"], stream: true }, [dies, next], undefined, undefined, work);
    expect(r.meta.mode).toBe("partial"); expect(r.text).not.toMatch(/something else/);
    expect(r.of("text").length).toBe(1);
  });
  it("small talk and tests without streaming are unchanged", async () => {
    const m = streaming("a", "PACK is a seven-agent Werewolf game. A LangGraph state machine runs each round.", [call("suggest", { options: ["x"] })]);
    const r = await turn({ turns: ["What is PACK?"] }, [m], undefined, undefined, work);
    expect(deltas(r).length).toBe(0); expect(r.of("text").length).toBe(1);
  });
  it("AG-UI: deltas open one message, the final text sends text_final and closes it; a plain text is still start/content/end", () => {
    const live = new Set<string>();
    const a = toAgui({ type: "delta", stream: "s1", text: "One." }, live), b = toAgui({ type: "delta", stream: "s1", text: " Two." }, live);
    const c = toAgui({ type: "text", text: "One. Two.", stream: "s1" }, live);
    expect(a.map((e) => e.type)).toEqual(["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT"]);
    expect(b.map((e) => e.type)).toEqual(["TEXT_MESSAGE_CONTENT"]);
    expect(c.map((e) => e.type)).toEqual(["CUSTOM", "TEXT_MESSAGE_END"]);
    expect(toAgui({ type: "text", text: "Hi." }, live).map((e) => e.type)).toEqual(["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END"]);
  });
});

describe("golden · a tool several projects share is a filter, not a pick", () => {
  it("'which of his projects uses supabase' may list the matching projects", async () => {
    const { scripted, say } = await import("./helpers");
    const m = scripted("a", [say("FinBoom, Campus Premier League and VerseYou use Supabase.", call("list_projects", {}), call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["which of his projects uses supabase"] }, [m], undefined, undefined, work);
    expect(r.of("trace").some((t) => /blocked the full list/.test(t.detail))).toBe(false);
    const listed = r.of("panel").find((p) => p.panel.kind === "index");
    expect(listed?.panel.id?.split(",").sort()).toEqual(["cpl", "finboom", "verseyou"]);
  });
});

describe("golden · a judgement about him with every model down", () => {
  it("'is he any good' gets his strongest evidence, not 'outside my lane'", async () => {
    const { scripted } = await import("./helpers");
    const r = await turn({ turns: ["is this guy legit"] }, [scripted("a", [new Error("down")])], undefined, undefined, work);
    expect(r.text).toMatch(/doesn’t fall over/); expect(r.text).not.toMatch(/Outside my lane/);
  });
});

describe("golden · no invented ratings", () => {
  it("'rate his python out of 10' keeps the evidence and drops the score", async () => {
    const { scripted, say } = await import("./helpers");
    const m = scripted("a", [say("8 / 10. He also uses Python in PACK and CCR Compliance Advisor.", call("suggest", { options: ["x"] }))]);
    const r = await turn({ turns: ["rate his python out of 10"] }, [m], undefined, undefined, work);
    expect(r.text).toMatch(/^No scores here, only evidence\. He uses Python in PACK/); expect(r.text).not.toMatch(/8 \/ 10/);
  });
});
