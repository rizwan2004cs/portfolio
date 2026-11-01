import { describe, expect, it } from "vitest";
import { groqScreen, modelChain, orderByHealth, readStream } from "@/agent/models";
import { defaultDeps } from "@/agent/handler";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const reply = (content: string) => ok({ choices: [{ message: { role: "assistant", content } }] });

describe("model chain", () => {
  it("tries each Groq model on every key, then Gemini", () => {
    const names = modelChain(["k1", "k2", "k3"], "g").map((m) => m.name);
    expect(names).toEqual(["gpt-oss-120b · key 1", "gpt-oss-120b · key 2", "gpt-oss-120b · key 3", "gpt-oss-20b · key 1", "gpt-oss-20b · key 2", "gpt-oss-20b · key 3", "gemini-2.5-flash"]);
    expect(modelChain(["only"], undefined).map((m) => m.name)).toEqual(["gpt-oss-120b", "gpt-oss-20b"]); // one key: no numbering
  });
  it("reads keys from env, ignoring blanks, and adds Gemini only when configured", () => {
    expect(defaultDeps({ GROQ_API_KEY: "a", GROQ_API_KEYS_FALLBACK: " b, ,c " } as unknown as NodeJS.ProcessEnv).models().length).toBe(6);
    expect(defaultDeps({ GROQ_API_KEY: "a", GEMINI_API_KEY: "g" } as unknown as NodeJS.ProcessEnv).models().map((m) => m.name).at(-1)).toBe("gemini-2.5-flash");
    expect(defaultDeps({} as unknown as NodeJS.ProcessEnv).models()).toEqual([]);
  });
  it("sends each request to the right provider with its own key", async () => {
    const seen: [string, string][] = [];
    const fake = (async (url: string, init: RequestInit) => { seen.push([url, String((init.headers as Record<string, string>).Authorization)]); return reply("hi"); }) as typeof fetch;
    const [groq, , gemini] = modelChain(["k1"], "g", fake).filter((_, i, a) => i === 0 || i === a.length - 1 || i === 1);
    await groq.complete([], new AbortController().signal);
    await gemini.complete([], new AbortController().signal);
    expect(seen[0]).toEqual(["https://api.groq.com/openai/v1/chat/completions", "Bearer k1"]);
    expect(seen[1]).toEqual(["https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "Bearer g"]);
  });
});

describe("model client retries", () => {
  it("retries once when the model emits a malformed tool call (400 tool_use_failed)", async () => {
    let n = 0;
    const fake = (async () => (++n === 1 ? new Response(JSON.stringify({ error: { code: "tool_use_failed" } }), { status: 400 }) : reply("ok"))) as unknown as typeof fetch;
    const [m] = modelChain(["k1"], undefined, fake);
    expect((await m.complete([], new AbortController().signal)).content).toBe("ok");
    expect(n).toBe(2);
  });
  it("other 400s are not retried", async () => {
    let n = 0;
    const fake = (async () => { n++; return new Response("bad", { status: 400 }); }) as unknown as typeof fetch;
    await expect(modelChain(["k1"], undefined, fake)[0].complete([], new AbortController().signal)).rejects.toThrow("HTTP 400");
    expect(n).toBe(1);
  });
});

describe("throttled keys", () => {
  it("a 429 key rests for its retry-after window without another request, other keys still serve", async () => {
    const hits: string[] = [];
    const fake = (async (_u: string, init: RequestInit) => {
      const k = String((init.headers as Record<string, string>).Authorization);
      hits.push(k);
      return k === "Bearer k1" ? new Response("slow", { status: 429, headers: { "retry-after": "30" } }) : reply("ok");
    }) as unknown as typeof fetch;
    const [a, b] = modelChain(["k1", "k2"], undefined, fake);
    await expect(a.complete([], new AbortController().signal)).rejects.toThrow("HTTP 429");
    await expect(a.complete([], new AbortController().signal)).rejects.toThrow(/resting 30s/);
    expect((await b.complete([], new AbortController().signal)).content).toBe("ok");
    expect(hits).toEqual(["Bearer k1", "Bearer k2"]);
  });
});

describe("hung keys", () => {
  it("a key that times out rests for a minute and is skipped without a request", async () => {
    let calls = 0;
    const fake = (async () => { calls++; const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }) as unknown as typeof fetch;
    const [m] = modelChain(["k1"], undefined, fake);
    await expect(m.complete([], new AbortController().signal)).rejects.toThrow("timeout");
    await expect(m.complete([], new AbortController().signal)).rejects.toThrow(/resting/);
    expect(calls).toBe(1);
  });
});

describe("prompt guard key rotation", () => {
  it("moves to the next key when one is throttled", async () => {
    const used: string[] = [];
    const fake = (async (_: string, init: RequestInit) => {
      const k = String((init.headers as Record<string, string>).Authorization); used.push(k);
      return k === "Bearer k1" ? new Response("slow", { status: 429 }) : reply("0.0002");
    }) as typeof fetch;
    const r = await groqScreen(["k1", "k2"], fake)("hello", new AbortController().signal);
    expect(used).toEqual(["Bearer k1", "Bearer k2"]);
    expect(r.ok).toBe(true); expect(r.note).toMatch(/^pass/);
  });
  it("still fails open when every key is throttled", async () => {
    const fake = (async () => new Response("slow", { status: 429 })) as typeof fetch;
    expect((await groqScreen(["k1", "k2"], fake)("hello", new AbortController().signal)).ok).toBe(true);
  });
});

describe("nvidia fallback", () => {
  it("sits between Groq and Gemini, one request per Nemotron model with thinking off, and is absent without a key", async () => {
    let body: Record<string, unknown> = {}, auth = "", url = "";
    const fake = (async (u: string, init: RequestInit) => { url = u; auth = String((init.headers as Record<string, string>).Authorization); body = JSON.parse(String(init.body)); return reply("ok"); }) as unknown as typeof fetch;
    const chain = modelChain(["k1"], "g", fake, "or", "nv");
    expect(chain.map((m) => m.name)).toEqual(["gpt-oss-120b", "gpt-oss-20b", "nemotron-3.5-lightning-30b-a3b", "nemotron-3.5-super-vl-120b-a12b", "nemotron-3-ultra-550b-a55b", "gemini-2.5-flash", "openrouter · free models"]);
    await chain[2].complete([], new AbortController().signal);
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions"); expect(auth).toBe("Bearer nv");
    expect(body.model).toBe("nvidia/nemotron-3.5-lightning-30b-a3b"); expect(body.chat_template_kwargs).toEqual({ enable_thinking: false }); expect(body.tools).toBeTruthy();
    expect(modelChain(["k1"], "g", fake, "or").map((m) => m.name)).not.toContain("nemotron-3.5-lightning-30b-a3b");
    expect(defaultDeps({ GROQ_API_KEY: "a", NVIDIA_API_KEY: " nv " } as unknown as NodeJS.ProcessEnv).models().map((m) => m.name)).toEqual(["gpt-oss-120b", "gpt-oss-20b", "nemotron-3.5-lightning-30b-a3b", "nemotron-3.5-super-vl-120b-a12b", "nemotron-3-ultra-550b-a55b"]);
  });
});

describe("openrouter fallback", () => {
  it("comes after Gemini, sends its free models as one routed request, and is absent without a key", async () => {
    let body: Record<string, unknown> = {};
    const fake = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }); }) as unknown as typeof fetch;
    const chain = modelChain(["k1"], "g", fake, "or");
    expect(chain.map((m) => m.name)).toEqual(["gpt-oss-120b", "gpt-oss-20b", "gemini-2.5-flash", "openrouter · free models"]);
    await chain.at(-1)!.complete([], new AbortController().signal);
    expect(body.models).toEqual(["nvidia/nemotron-3.5-lightning:free", "thinkingmachines/inkling-small:free", "google/gemma-4-31b-it:free"]);
    expect(modelChain(["k1"], "g", fake).map((m) => m.name)).not.toContain("openrouter · free models");
  });
});

describe("streamed replies", () => {
  const sse = (lines: string[]) => new Response(lines.map((l) => `data: ${l}\n`).join("\n") + "\ndata: [DONE]\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  it("assembles content and tool calls from deltas, and names a tool the moment it appears", async () => {
    const named: string[] = [];
    const msg = await readStream(sse([
      JSON.stringify({ choices: [{ delta: { content: "Here" } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "open_", arguments: "" } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "project", arguments: "{\"id\":" } }] } }] }),
      JSON.stringify({ choices: [{ delta: { content: "’s PACK." } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "\"pack\"}" } }, { index: 1, id: "c2", function: { name: "suggest", arguments: "{\"options\":[\"x\"]}" } }] } }] }),
    ]), (n) => named.push(n));
    expect(msg).toEqual({ role: "assistant", content: "Here’s PACK.", tool_calls: [{ id: "c1", function: { name: "open_project", arguments: '{"id":"pack"}' } }, { id: "c2", function: { name: "suggest", arguments: '{"options":["x"]}' } }] });
    expect(named).toEqual(["open_", "suggest"]); // fires on the first fragment of the name
  });
  it("a model client streams when the server streams, and still reads a plain JSON reply", async () => {
    const seen: string[] = [];
    const fake = (async (_u: string, init: RequestInit) => { expect(JSON.parse(String(init.body)).stream).toBe(true); return sse([JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c", function: { name: "list_projects", arguments: "{}" } }] } }] })]); }) as unknown as typeof fetch;
    const [m] = modelChain(["k1"], undefined, fake);
    expect((await m.complete([], new AbortController().signal, (n) => seen.push(n))).tool_calls?.[0].function.name).toBe("list_projects"); expect(seen).toEqual(["list_projects"]);
    expect((await modelChain(["k1"], undefined, (async () => reply("plain")) as typeof fetch)[0].complete([], new AbortController().signal)).content).toBe("plain");
    await expect(readStream(sse([]))).rejects.toThrow("empty choice");
  });
});

describe("the chain follows availability", () => {
  it("a throttled slot drops behind healthy ones, the slot that just answered goes first, resting slots go last", async () => {
    let calls = 0;
    const fake = (async (_u: string, init: RequestInit) => { calls++; const key = String((init.headers as Record<string, string>).Authorization); return key.endsWith("k1") ? new Response("busy", { status: 429, headers: { "retry-after": "30" } }) : reply("hi"); }) as unknown as typeof fetch;
    const chain = modelChain(["k1", "k2"], "g", fake);
    expect(orderByHealth(chain).map((m) => m.name)).toEqual(chain.map((m) => m.name)); // nothing known yet: configured order
    await expect(chain[0].complete([], new AbortController().signal)).rejects.toThrow("HTTP 429");
    await chain[1].complete([], new AbortController().signal);
    const after = orderByHealth(chain).map((m) => m.name);
    expect(after[0]).toBe("gpt-oss-120b · key 2"); expect(after.at(-1)).toBe("gpt-oss-120b · key 1"); // key 1 is resting after the 429
    expect(chain[0].health!().resting).toBe(true); expect(chain[1].health!()).toMatchObject({ fails: 0, resting: false });
    chain[1].mark!(false); expect(chain[1].health!().fails).toBe(1);
    expect(calls).toBe(2);
  });
  it("an old failure is forgotten after ten minutes", () => {
    const stale = { name: "a", complete: async () => ({ role: "assistant" as const, content: "x" }), health: () => ({ resting: false, fails: 3, lastOk: 1 }) };
    const fresh = { name: "b", complete: async () => ({ role: "assistant" as const, content: "x" }), health: () => ({ resting: false, fails: 1, lastOk: 1_000_000 }) };
    expect(orderByHealth([stale, fresh], 1_000_000 + 1).map((m) => m.name)).toEqual(["a", "b"]); // a's failures are stale: configured order wins
  });
});
