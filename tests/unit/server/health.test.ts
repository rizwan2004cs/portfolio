import { afterEach, describe, expect, it } from "vitest";
import { applyHealth, groqModel, orderByHealth, setHealthSink, type SlotState } from "@/agent/models";
import { neonHealthBoard } from "@/server/health";

const r429 = () => new Response("slow down", { status: 429, headers: { "retry-after": "30" } });
const ok = () => new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "hi" } }] }), { headers: { "content-type": "application/json" } });

afterEach(() => setHealthSink(null));

describe("model key health shared across instances", () => {
  it("a 429 on one instance is told to the board, and another instance with the same key rests it without calling", async () => {
    const told: Record<string, SlotState> = {};
    setHealthSink((id, s) => { told[id] = s; });
    const a = groqModel("openai/gpt-oss-120b", "k1", (async () => r429()) as unknown as typeof fetch);
    await expect(a.complete([], new AbortController().signal)).rejects.toThrow(/429/);
    const [id, st] = Object.entries(told)[0];
    expect(id).not.toMatch(/k1/); expect(st.restUntil).toBeGreaterThan(Date.now() + 20_000); expect(st.fails).toBe(1);
    // another instance: its own fetch, the same key, so the same hashed slot
    let called = 0;
    const b = groqModel("openai/gpt-oss-120b", "k1", (async () => { called++; return ok(); }) as unknown as typeof fetch);
    expect(applyHealth({ [id]: st })).toBe(1);
    await expect(b.complete([], new AbortController().signal)).rejects.toThrow(/resting/);
    expect(called).toBe(0);
  });
  it("applyHealth rests a known slot and the chain orders it last", async () => {
    let id = "";
    setHealthSink((i) => { id = i; });
    const f = (async () => ok()) as unknown as typeof fetch;
    const k1 = groqModel("openai/gpt-oss-120b", "a", f, 1, 2), k2 = groqModel("openai/gpt-oss-120b", "b", f, 2, 2);
    k1.mark?.(false);
    expect(applyHealth({ [id]: { restUntil: Date.now() + 60_000, fails: 3, lastOk: 0 } })).toBe(1);
    expect(orderByHealth([k1, k2]).map((m) => m.name)).toEqual(["gpt-oss-120b · key 2", "gpt-oss-120b · key 1"]);
    await expect(k1.complete([], new AbortController().signal)).rejects.toThrow(/resting/);
  });
  it("a slot that succeeded more recently elsewhere is healthy here too", () => {
    let id = "";
    setHealthSink((i) => { id = i; });
    const k = groqModel("openai/gpt-oss-20b", "z", (async () => ok()) as unknown as typeof fetch);
    k.mark?.(false); k.mark?.(false);
    applyHealth({ [id]: { restUntil: 0, fails: 0, lastOk: Date.now() } });
    expect(k.health?.().fails).toBe(0);
  });
  it("the board reads and writes through SQL, and a slow database yields null instead of a wait", async () => {
    const seen: string[] = [];
    const sql = (async (s: TemplateStringsArray) => { seen.push(s.join("?")); return /select/.test(s.join("")) ? [{ slot: "x", rest_until: new Date(Date.now() + 5000).toISOString(), fails: 2, last_ok: null }] : []; }) as never;
    const board = neonHealthBoard(undefined, 400, sql)!;
    const rows = await board.load();
    expect(rows?.x.fails).toBe(2); expect(rows!.x.restUntil).toBeGreaterThan(Date.now());
    await board.save("x", { restUntil: 0, fails: 0, lastOk: Date.now() });
    expect(seen.some((q) => /insert into model_health/.test(q))).toBe(true);
    const slow = neonHealthBoard(undefined, 50, (() => new Promise(() => {})) as never)!;
    expect(await slow.load()).toBeNull();
  });
});
