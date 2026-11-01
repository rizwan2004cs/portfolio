import { neon } from "@neondatabase/serverless";

/** Hybrid retrieval over his facts in the Neon Postgres behind DATABASE_URL: pgvector cosine on Nemotron embeddings
 *  (stored as halfvec: 2048 dimensions is past the limit a full-precision index allows) fused with Postgres full-text
 *  rank, in one SQL statement. Read-only at runtime; scripts/index-facts.ts fills it. */
export const EMBED_MODEL = "nvidia/nemotron-3.5-embed-1b";
export const EMBED_DIMS = 2048;
const EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
export const JUDGE_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
/** Below this cosine no fact is even about the sentence, so the judge is not asked. Cosine alone cannot tell support
 *  from contradiction ("PACK in Rust" sits at 0.47 next to PACK's Python stack), which is why a judge reads the facts. */
export const RELATED_MIN = 0.3;

export interface Hit { id: string; project: string | null; kind: string; text: string; score: number; cosine: number }
export interface Support { id: string; fact: string; cosine: number }
/** The verdict on one model sentence: supported by a fact it was read against, or not; null when the check could not run. */
export interface Verdict { ok: boolean; fact: string; cosine: number; why: string }
export interface Retriever {
  search(query: string, k?: number, signal?: AbortSignal): Promise<Hit[]>;
  /** the closest fact to a sentence, or null when the check cannot run in time */
  support(sentence: string, signal?: AbortSignal): Promise<Support | null>;
  /** is the sentence what his facts say? the closest facts are retrieved, then a small model reads them against it */
  verify(sentence: string, signal?: AbortSignal): Promise<Verdict | null>;
}
/** A tagged SQL function shaped like the Neon client's, so tests can stand in for the database. */
export type Sql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<Record<string, unknown>[]>;

/** Nemotron embeddings: "query" for questions and sentences being checked, "passage" for the facts themselves. */
export async function embed(texts: string[], inputType: "query" | "passage", key: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<number[][]> {
  const r = await fetchImpl(EMBED_URL, {
    method: "POST", signal,
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts, input_type: inputType, encoding_format: "float", truncate: "END" }),
  });
  if (!r.ok) throw new Error(`embeddings HTTP ${r.status}`);
  const j = (await r.json()) as { data?: { index: number; embedding: number[] }[] };
  const out = (j.data ?? []).sort((a, b) => a.index - b.index).map((d) => d.embedding);
  if (out.length !== texts.length) throw new Error("embeddings: wrong count");
  return out;
}

/** One small-model read: do these facts fully support the sentence? JSON in, JSON out, no thinking. */
export async function judge(sentence: string, facts: string[], key: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<{ ok: boolean; why: string } | null> {
  const r = await fetchImpl(CHAT_URL, {
    method: "POST", signal,
    headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: JUDGE_MODEL, temperature: 0, max_tokens: 80, chat_template_kwargs: { enable_thinking: false }, messages: [
      { role: "system", content: "You check one sentence written about a software engineer against facts from his portfolio. The sentence is supported only if every claim in it (names, numbers, technologies, roles, dates) follows from the facts; a figure of speech or a paraphrase is fine, an added or contradicted detail is not. Reply with JSON only: {\"supported\": true|false, \"why\": \"<ten words>\"}" },
      { role: "user", content: `Facts:\n${facts.map((f) => `- ${f}`).join("\n")}\n\nSentence: ${sentence}` },
    ] }),
  });
  if (!r.ok) return null;
  const content = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  const m = /\{[\s\S]*\}/.exec(content);
  if (!m) return null;
  try { const j = JSON.parse(m[0]) as { supported?: unknown; why?: unknown }; return typeof j.supported === "boolean" ? { ok: j.supported, why: String(j.why ?? "").slice(0, 80) } : null; } catch { return null; }
}

/** pgvector's text form of a vector. */
export const vec = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(",")}]`;

const within = <T,>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error("retrieval timed out"), { name: "TimeoutError" })), ms))]);

/** The retriever, or undefined when either the database or the embedding key is missing (the word check still runs). */
export function neonRetriever(url: string | undefined, key: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = 3500, sqlImpl?: Sql): Retriever | undefined {
  if (!url && !sqlImpl) return undefined;
  if (!key) return undefined;
  const sql: Sql = sqlImpl ?? (neon(url!) as unknown as Sql);
  const q = async (text: string, signal?: AbortSignal) => vec((await embed([text], "query", key, fetchImpl, signal))[0]);
  return {
    async search(query, k = 5, signal) {
      return within((async () => {
        const v = await q(query, signal);
        // reciprocal-rank fusion of the dense and the keyword rankings, so a fact wins by meaning or by exact terms
        const rows = await sql`
          with dense as (select id, row_number() over (order by embedding <=> ${v}::halfvec) as r from facts order by embedding <=> ${v}::halfvec limit 20),
               sparse as (select id, row_number() over (order by ts_rank_cd(tsv, websearch_to_tsquery('english', ${query})) desc) as r
                          from facts where tsv @@ websearch_to_tsquery('english', ${query}) limit 20)
          select f.id, f.project, f.kind, f.text,
                 coalesce(1.0 / (60 + d.r), 0) + coalesce(1.0 / (60 + s.r), 0) as score,
                 1 - (f.embedding <=> ${v}::halfvec) as cosine
          from facts f left join dense d on d.id = f.id left join sparse s on s.id = f.id
          where d.id is not null or s.id is not null
          order by score desc limit ${k}`;
        return rows.map((r) => ({ id: String(r.id), project: (r.project as string | null) ?? null, kind: String(r.kind), text: String(r.text), score: Number(r.score), cosine: Number(r.cosine) }));
      })(), timeoutMs);
    },
    async verify(sentence, signal) {
      try {
        return await within((async () => {
          const hits = await this.search(sentence, 3, signal);
          const best = hits.reduce((a, h) => (h.cosine > a ? h.cosine : a), 0);
          if (!hits.length || best < RELATED_MIN) return { ok: false, fact: hits[0]?.text ?? "", cosine: best, why: "no fact is about this" };
          const v = await judge(sentence, hits.map((h) => h.text), key, fetchImpl, signal);
          return v ? { ok: v.ok, fact: hits[0].text, cosine: best, why: v.why } : null;
        })(), timeoutMs);
      } catch { return null; }
    },
    async support(sentence, signal) {
      try {
        return await within((async () => {
          const v = await q(sentence, signal);
          const rows = await sql`select id, text, 1 - (embedding <=> ${v}::halfvec) as cosine from facts order by embedding <=> ${v}::halfvec limit 1`;
          return rows.length ? { id: String(rows[0].id), fact: String(rows[0].text), cosine: Number(rows[0].cosine) } : null;
        })(), timeoutMs);
      } catch { return null; }
    },
  };
}
