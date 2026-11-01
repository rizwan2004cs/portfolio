// Fills the `facts` table in Neon from src/content/facts.ts: creates the pgvector extension, table and indexes when
// missing, embeds new or changed facts with Nemotron, upserts by id and deletes facts no longer in the source.
//   npx tsx scripts/index-facts.ts            (reads DATABASE_URL and NVIDIA_API_KEY from the env, .env.local, .env.neon.local)
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { FACTS } from "../src/content/facts";
import { EMBED_DIMS, embed, vec } from "../src/server/retrieval";

for (const f of [".env.local", ".env.neon.local"]) {
  try { for (const line of readFileSync(f, "utf8").split("\n")) { const m = /^([A-Z_]+)=(.*)$/.exec(line.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1"); } } catch { /* optional */ }
}
const url = process.env.DATABASE_URL, key = process.env.NVIDIA_API_KEY;
if (!url || !key) { console.error("DATABASE_URL and NVIDIA_API_KEY are required"); process.exit(1); }
const sql = neon(url);

await sql`create extension if not exists vector`;
// DDL takes no bind parameters: the dimension is spliced in as a literal
await sql.query(`create table if not exists facts (
  id text primary key, kind text not null, project text, text text not null,
  tsv tsvector generated always as (to_tsvector('english', text)) stored,
  embedding halfvec(${EMBED_DIMS}) not null, updated_at timestamptz not null default now())`);
await sql`create index if not exists facts_embedding_hnsw on facts using hnsw (embedding halfvec_cosine_ops)`;
await sql`create index if not exists facts_tsv_gin on facts using gin (tsv)`;

const have = new Set((await sql`select id from facts`).map((r) => String(r.id)));
const fresh = FACTS.filter((f) => !have.has(f.id));
const stale = [...have].filter((id) => !FACTS.some((f) => f.id === id));
console.log(`${FACTS.length} facts in source · ${have.size} in the index · ${fresh.length} to embed · ${stale.length} stale`);

for (let i = 0; i < fresh.length; i += 32) {
  const batch = fresh.slice(i, i + 32);
  const vectors = await embed(batch.map((f) => f.text), "passage", key);
  for (const [j, f] of batch.entries()) {
    await sql`insert into facts (id, kind, project, text, embedding) values (${f.id}, ${f.kind}, ${f.project ?? null}, ${f.text}, ${vec(vectors[j])}::halfvec)
              on conflict (id) do update set kind = excluded.kind, project = excluded.project, text = excluded.text, embedding = excluded.embedding, updated_at = now()`;
  }
  console.log(`embedded ${Math.min(i + 32, fresh.length)} of ${fresh.length}`);
}
if (stale.length) await sql`delete from facts where id = any(${stale})`;
const [{ n }] = await sql`select count(*)::int as n from facts`;
console.log(`index holds ${n} facts`);
