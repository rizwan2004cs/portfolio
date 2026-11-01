import { describe, expect, it } from "vitest";
import { nemotronSelfCheck } from "@/agent/check";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const draft = "A LangGraph state machine runs the game. Seven agents reason, speak and bet. It serves 9,000 players a night.";

describe("the second reader on long answers", () => {
  it("asks Nemotron for a verdict per sentence and maps them back; a missing verdict counts as supported", async () => {
    let body: { messages: { content: string }[] } = { messages: [] };
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return ok({ choices: [{ message: { content: '{"verdicts":[{"i":1,"supported":true,"why":"in facts"},{"i":3,"supported":false,"why":"number not in facts"}]}' } }] }); }) as unknown as typeof fetch;
    const v = await nemotronSelfCheck("k", f)!(draft, "facts here");
    expect(v?.map((x) => x.ok)).toEqual([true, true, false]); expect(v?.[2].why).toBe("number not in facts");
    expect(body.messages[1].content).toMatch(/Facts:\nfacts here\n\nSentences:\n1\. A LangGraph/);
  });
  it("accepts the bare array the model sometimes returns", async () => {
    const f = (async () => ok({ choices: [{ message: { content: '[{"i":2,"supported":false,"why":"not in facts"}]' } }] })) as unknown as typeof fetch;
    expect((await nemotronSelfCheck("k", f)!(draft, "f"))?.map((x) => x.ok)).toEqual([true, false, true]);
  });
  it("skips short drafts, and is null on an error, bad JSON or a timeout; absent without a key", async () => {
    const f = (async () => ok({ choices: [{ message: { content: "nope" } }] })) as unknown as typeof fetch;
    expect(await nemotronSelfCheck("k", f)!("One sentence. Two sentences.", "f")).toBeNull();
    expect(await nemotronSelfCheck("k", f)!(draft, "f")).toBeNull();
    expect(await nemotronSelfCheck("k", (async () => new Response("x", { status: 503 })) as unknown as typeof fetch)!(draft, "f")).toBeNull();
    const hang = (async (_u: string, init: RequestInit) => new Promise((_, rej) => init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("t"), { name: "TimeoutError" }))))) as unknown as typeof fetch;
    expect(await nemotronSelfCheck("k", hang, 20)!(draft, "f")).toBeNull();
    expect(nemotronSelfCheck(undefined)).toBeUndefined();
  });
});
