import { describe, expect, it } from "vitest";
import { decide, decisionClassifier } from "@/agent/classify";
import { BEHAVIOR, KINDS, ruleKind } from "@/agent/behavior";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sig = () => new AbortController().signal;

describe("the outer agent", () => {
  it("uses the decision model's kind, and asks it with every kind's definition from the policy", async () => {
    let sent: { questions?: { kind?: { criteria?: Record<string, string> } } } = {};
    const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ answers: { kind: { choice: "personal", confidence: 0.97 } } })); }) as unknown as typeof fetch;
    const c = await decisionClassifier("k", f)("is he male", sig());
    expect(c).toMatchObject({ kind: "personal", source: "model" });
    expect(Object.keys(sent.questions!.kind!.criteria!)).toEqual(KINDS);
  });
  it("falls back to the word rules when the classifier errors, times out, or answers nonsense", async () => {
    expect(await decisionClassifier("k", reply({}, 503))("fucking", sig())).toMatchObject({ kind: "abusive", source: "rules" });
    expect(await decisionClassifier("k", reply({ answers: { kind: { choice: "banana" } } }))("hello", sig())).toMatchObject({ kind: "small_talk", source: "rules" });
    const hang = (async (_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    expect(await decisionClassifier("k", hang, 20)("What is PACK?", sig())).toMatchObject({ kind: "work", source: "rules" });
    expect(await decisionClassifier(undefined)("is he gay", sig())).toMatchObject({ kind: "personal", source: "rules" });
  });
  it("an unsure pick goes to the model as work, unless it is sensitive: then declining wins", () => {
    expect(decide({ kind: "small_talk", confidence: 0.3, source: "model", note: "" })).toBe("work");
    expect(decide({ kind: "personal", confidence: 0.3, source: "model", note: "" })).toBe("personal");
    expect(decide({ kind: "unclear", confidence: 0.9, source: "model", note: "" })).toBe("unclear");
  });
  it("every non-work kind has a reply and chips; the rules cover the offline basics", () => {
    for (const k of KINDS.filter((k) => k !== "work")) { expect(BEHAVIOR[k].reply?.("x")).toBeTruthy(); expect(BEHAVIOR[k].chips.length).toBeGreaterThan(0); }
    expect(ruleKind("I'm his friend")).toBe("visitor_intro");
    expect(ruleKind("who am i ?")).toBe("about_visitor");
    expect(ruleKind("what is the relationship between PACK and CCR?")).toBe("work");
  });
});

describe("the outer agent under free-tier limits", () => {
  it("a rate-limited model hands over to the next; a repeated message is answered from memory", async () => {
    let calls = 0;
    const f = (async (_u: string, init: RequestInit) => {
      calls++;
      const model = JSON.parse(String(init.body)).model as string;
      return model.includes("mammoth") ? new Response("{}", { status: 429 }) : new Response(JSON.stringify({ answers: { kind: { choice: "personal", confidence: 0.99 } } }));
    }) as unknown as typeof fetch;
    const c = decisionClassifier("k", f);
    expect(await c("is he with another girl", sig())).toMatchObject({ kind: "personal", source: "model" });
    expect(calls).toBe(2);
    expect((await c("Is he with another girl ", sig())).note).toMatch(/cached/);
    expect(calls).toBe(2);
  });
});
