import { describe, expect, it } from "vitest";
import { classifierEndpoints, classifierMessages, decide, nemotronClassifier, parseAnswer } from "@/agent/classify";
import { BEHAVIOR, KINDS, ruleKind } from "@/agent/behavior";

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const sig = () => new AbortController().signal;

describe("the outer agent", () => {
  it("asks Nemotron for JSON with every kind's definition from the policy, thinking off, and returns the kind", async () => {
    let body: { model?: string; chat_template_kwargs?: unknown; messages?: { role: string; content: string }[] } = {};
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":"personal","confidence":0.97}' } }] })); }) as unknown as typeof fetch;
    const c = await nemotronClassifier("k", f)("is he male", sig());
    expect(c).toMatchObject({ kind: "personal", confidence: 0.97, source: "model" });
    expect(c.note).toMatch(/nemotron-3.5-lightning/);
    expect(body.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    for (const k of KINDS) expect(body.messages![0].content).toContain(`- ${k}: ${BEHAVIOR[k].describe}`);
  });
  it("extracts who the visitor is on an intro, trimmed and capped", async () => {
    const f = reply({ choices: [{ message: { content: 'Sure: {"kind":"visitor_intro","confidence":0.95,"visitor":{"name":" Priya ","company":"Razorpay","hiringFor":"backend engineer","extra":"x","role":""}}' } }] });
    const c = await nemotronClassifier("k", f)("hi I'm Priya from Razorpay, hiring backend engineers", sig());
    expect(c.visitor).toEqual({ name: "Priya", company: "Razorpay", hiringFor: "backend engineer" });
    expect(parseAnswer('{"kind":"visitor_intro","confidence":2,"visitor":{"name":"' + "x".repeat(200) + '"}}')).toEqual({ kind: "visitor_intro", confidence: 1, visitor: { name: "x".repeat(80) } });
    expect(parseAnswer('{"kind":"work","confidence":0.9,"visitor":{"name":"Hiring Manager","company":"TechCorp"}}')).toEqual({ kind: "work", confidence: 0.9 }); // a guess on a work question is dropped
  });
  it("falls back to the word rules when the classifier errors, times out, or answers nonsense, and says why", async () => {
    expect(await nemotronClassifier("k", reply({}, 503))("fucking", sig())).toMatchObject({ kind: "abusive", source: "rules", note: "rules · classifier HTTP 503" });
    expect(await nemotronClassifier("k", reply({ choices: [{ message: { content: '{"kind":"banana"}' } }] }))("hello", sig())).toMatchObject({ kind: "small_talk", source: "rules", note: "rules · classifier unreadable" });
    const hang = (async (_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    expect(await nemotronClassifier("k", hang, 20)("What is PACK?", sig())).toMatchObject({ kind: "work", source: "rules", note: "rules · classifier timed out" });
    expect(await nemotronClassifier(undefined)("is he gay", sig())).toMatchObject({ kind: "personal", source: "rules" });
  });
  it("a failing NVIDIA endpoint hands the message to the same model free on OpenRouter; a timeout does not", async () => {
    const urls: string[] = [];
    const f = (async (u: string) => { urls.push(u); return u.includes("nvidia") ? new Response("{}", { status: 503 }) : new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":"playful","confidence":0.8}' } }] })); }) as unknown as typeof fetch;
    const eps = classifierEndpoints("nv", "or");
    expect(eps.map((e) => [e.name, e.model])).toEqual([["nvidia", "nvidia/nemotron-3.5-lightning-30b-a3b"], ["openrouter", "nvidia/nemotron-3.5-lightning:free"]]);
    expect((await nemotronClassifier(eps, f)("roast him", sig())).note).toBe("playful · 0.80 confidence · nemotron-3.5-lightning · openrouter");
    expect(urls.map((u) => new URL(u).host)).toEqual(["integrate.api.nvidia.com", "openrouter.ai"]);
    const hang = (async (_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    let calls = 0; const counting = ((...a: Parameters<typeof fetch>) => { calls++; return hang(...a); }) as typeof fetch;
    expect((await nemotronClassifier(eps, counting, 20)("hello", sig())).note).toBe("rules · classifier timed out"); expect(calls).toBe(1);
    expect(classifierEndpoints(undefined, "or").map((e) => e.name)).toEqual(["openrouter"]);
  });
  it("an unsure pick goes to the model as work, unless it is sensitive: then declining wins", () => {
    expect(decide({ kind: "small_talk", confidence: 0.3, source: "model", note: "" })).toBe("work");
    expect(decide({ kind: "personal", confidence: 0.3, source: "model", note: "" })).toBe("personal");
    expect(decide({ kind: "unclear", confidence: 0.9, source: "model", note: "" })).toBe("unclear");
  });
  it("every non-work kind has a reply and chips; the rules cover the offline basics", () => {
    // a kind either answers with a fixed line or goes to the model; only playful carries its own tone there
    for (const k of KINDS) { expect(!!BEHAVIOR[k].reply || k === "work" || !!BEHAVIOR[k].tone).toBe(true); expect(BEHAVIOR[k].chips.length).toBeGreaterThan(0); }
    expect(BEHAVIOR.playful.reply).toBeUndefined();
    expect(ruleKind("If Rizwan were a super hero what's his super power?")).toBe("playful");
    expect(ruleKind("describe him in three words")).toBe("playful");
    expect(ruleKind("is he gay")).toBe("personal");
    expect(ruleKind("I'm his friend")).toBe("visitor_intro");
    expect(ruleKind("who am i ?")).toBe("about_visitor");
    expect(ruleKind("what is the relationship between PACK and CCR?")).toBe("work");
  });
});

describe("the outer agent's memory", () => {
  it("a repeated message is answered from memory, not a second call", async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify({ choices: [{ message: { content: '{"kind":"personal","confidence":0.99}' } }] })); }) as unknown as typeof fetch;
    const c = nemotronClassifier("k", f);
    expect(await c("is he with another girl", sig())).toMatchObject({ kind: "personal", source: "model" });
    expect((await c("Is he with another girl ", sig())).note).toMatch(/cached/);
    expect(calls).toBe(1);
  });
});

describe("the curator's fixes", () => {
  it("an unsure non-sensitive pick declines when the sensitive kinds together outweigh work", () => {
    // "protective one to prevent stds": off_topic at 0.33 used to become work and reach the model
    expect(decide({ kind: "off_topic", confidence: 0.33, source: "model", note: "", probabilities: { off_topic: 0.33, personal: 0.3, abusive: 0.2, work: 0.1 } })).toBe("personal");
    expect(decide({ kind: "small_talk", confidence: 0.4, source: "model", note: "", probabilities: { small_talk: 0.4, work: 0.5, personal: 0.05 } })).toBe("work");
  });
  it("the previous exchange goes to the classifier, so a follow-up keeps its topic", async () => {
    const [, user] = classifierMessages("Not animal", { user: "what's his superpower", agent: "If he were a superhero, he'd be an owl." });
    expect(user.content).toBe("Previous visitor message: what's his superpower\nAgent's reply: If he were a superhero, he'd be an owl.\nVisitor message: Not animal");
    expect(classifierMessages("count")[1].content).toBe("Visitor message: count");
  });
});
