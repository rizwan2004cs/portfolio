import { neon } from "@neondatabase/serverless";

/** A counter shared by every instance, in the Neon database the site already uses: a fixed window per key, one
 *  atomic upsert per hit. The in-memory limiter in the handler stays as the fallback when this is slow or down, so
 *  a database hiccup degrades to per-instance limits rather than refusing visitors. */
export interface Limiter { hit(key: string, windowSec: number, signal?: AbortSignal): Promise<number | null> }
export type Sql = (strings: TemplateStringsArray, ...params: unknown[]) => Promise<Record<string, unknown>[]>;

export const LIMITS_DDL = "create table if not exists rate_limits (key text primary key, window_start timestamptz not null default now(), count integer not null default 0)";

export function neonLimiter(url: string | undefined, timeoutMs = 800, sqlImpl?: Sql): Limiter | undefined {
  if (!url && !sqlImpl) return undefined;
  const sql: Sql = sqlImpl ?? (neon(url!) as unknown as Sql);
  return {
    async hit(key, windowSec) {
      try {
        const rows = await Promise.race([
          sql`insert into rate_limits (key, window_start, count) values (${key}, now(), 1)
              on conflict (key) do update set
                count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
                window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
              returning count`,
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("limiter timed out")), timeoutMs)),
        ]);
        const n = Number(rows[0]?.count);
        return Number.isFinite(n) ? n : null;
      } catch { return null; }
    },
  };
}
