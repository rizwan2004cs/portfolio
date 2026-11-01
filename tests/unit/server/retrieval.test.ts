import { describe, expect, it } from "vitest";
import { embed, judge, neonRetriever, RELATED_MIN, vec, type Sql } from "@/server/retrieval";

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const embedding = (x: number) => ok({ data: [{ index: 0, embedding: [x, 1 - x] }] });

describe("retrieval over his facts", () => {
  it("embeds with Nemotron, marking queries and passages, and keeps the order", async () => {
    let body: Record<string, unknown> = {};
    const f = (async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return ok({ data: [{ index: 1, embedding: [2] }, { index: 0, embedding: [1] }] }); }) as unknown as typeof fetch;
    expect(await embed(["a", "b"], "passage", "k", f)).toEqual([[1], [2]]);
    expect(body).toMatchObject({ model: "nvidia/nemotron-3.5-embed-1b", input: ["a", "b"], input_type: "passage", truncate: "END" });
    expect(vec([0.5, 1])).toBe("[0.500000,1.000000]");
  });
  it("search fuses the dense and the keyword rankings in one statement", async () => {
    const seen: string[] = [];
    const sql: Sql = async (strings, ...params) => { seen.push(strings.join("?")); seen.push(JSON.stringify(params)); return [{ id: "project:x", project: "pack", kind: "project", text: "PACK …", score: 0.03, cosine: 0.7 }]; };
    const r = neonRetriever(undefined, "k", (async () => embedding(0.5)) as unknown as typeof fetch, 1000, sql)!;
    const hits = await r.search("which project uses pinecone", 3);
    expect(hits).toEqual([{ id: "project:x", project: "pack", kind: "project", text: "PACK …", score: 0.03, cosine: 0.7 }]);
    expect(seen[0]).toMatch(/embedding <=> \?::halfvec/); expect(seen[0]).toMatch(/ts_rank_cd\(tsv, websearch_to_tsquery/); expect(seen[0]).toMatch(/1\.0 \/ \(60 \+ d\.r\)/);
    expect(seen[1]).toContain("[0.500000,0.500000]"); expect(seen[1]).toContain("which project uses pinecone"); expect(seen[1]).toContain("3");
  });
  it("verify asks the judge only when a fact is about the sentence; the judge's verdict decides", async () => {
    const calls: string[] = [];
    const f = (async (u: string, init: RequestInit) => {
      calls.push(new URL(u).pathname);
      if (u.endsWith("/embeddings")) return embedding(0.5);
      const body = JSON.parse(String(init.body)) as { messages: { content: string }[] };
      expect(body.messages[1].content).toContain("Facts:\n- His public work does not show Kubernetes");
      return ok({ choices: [{ message: { content: '{"supported": false, "why": "contradicts: no Kubernetes"}' } }] });
    }) as unknown as typeof fetch;
    const rows = (cosine: number) => [{ id: "profile:g", project: null, kind: "profile", text: "His public work does not show Kubernetes, AWS or systems serving large production traffic", score: 0.03, cosine }];
    const far = neonRetriever(undefined, "k", f, 1000, async () => rows(RELATED_MIN - 0.05))!;
    expect(await far.verify("He handles 9,000 players a night.")).toMatchObject({ ok: false, why: "no fact is about this" });
    expect(calls).toEqual(["/v1/embeddings"]); // no judge call
    const near = neonRetriever(undefined, "k", f, 1000, async () => rows(0.51))!;
    expect(await near.verify("He has five years of Kubernetes experience in production.")).toMatchObject({ ok: false, why: "contradicts: no Kubernetes", cosine: 0.51 });
    expect(calls).toEqual(["/v1/embeddings", "/v1/embeddings", "/v1/chat/completions"]);
  });
  it("verify is null when the database or the model is slow or down; the retriever is absent without a key or a database", async () => {
    const slow: Sql = () => new Promise(() => {});
    expect(await neonRetriever(undefined, "k", (async () => embedding(0.5)) as unknown as typeof fetch, 20, slow)!.verify("x")).toBeNull();
    const down = (async () => new Response("no", { status: 503 })) as unknown as typeof fetch;
    expect(await neonRetriever(undefined, "k", down, 1000, async () => [])!.verify("x")).toBeNull();
    expect(await judge("s", ["f"], "k", (async () => ok({ choices: [{ message: { content: "not json" } }] })) as unknown as typeof fetch)).toBeNull();
    expect(await judge("s", ["f"], "k", (async () => ok({ choices: [{ message: { content: 'Sure {"supported": true, "why": "matches"}' } }] })) as unknown as typeof fetch)).toEqual({ ok: true, why: "matches" });
    expect(neonRetriever(undefined, undefined)).toBeUndefined();
    expect(neonRetriever("postgres://x", undefined)).toBeUndefined();
    expect(neonRetriever(undefined, "k")).toBeUndefined();
  });
});
