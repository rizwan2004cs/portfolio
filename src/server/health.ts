import { neon } from "@neondatabase/serverless";
import type { SlotState } from "@/agent/models";
import type { Sql } from "./limits";

/** Which model keys are rate-limited or failing, shared by every server instance through the Neon database the site
 *  already uses. Vercel starts fresh instances often; without this each one rediscovers a throttled key by calling it,
 *  which is what made some turns take four to five seconds. Slots are stored as a hash, never as the key itself.
 *  Reads and writes are short and best-effort: a slow or missing table only means each instance learns on its own. */
export const HEALTH_DDL = "create table if not exists model_health (slot text primary key, rest_until timestamptz, fails integer not null default 0, last_ok timestamptz, updated_at timestamptz not null default now())";

export interface HealthBoard {
  /** recent slot states (the last fifteen minutes), or null when the table can't be read in time */
  load(signal?: AbortSignal): Promise<Record<string, SlotState> | null>;
  save(slot: string, state: SlotState): Promise<void>;
}

const ms = (v: unknown) => (v ? new Date(String(v)).getTime() || 0 : 0);
const at = (t: number) => (t > 0 ? new Date(t).toISOString() : null);

export function neonHealthBoard(url: string | undefined, timeoutMs = 400, sqlImpl?: Sql): HealthBoard | undefined {
  if (!url && !sqlImpl) return undefined;
  const sql: Sql = sqlImpl ?? (neon(url!) as unknown as Sql);
  const within = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error("health board timed out")), timeoutMs))]);
  return {
    async load() {
      try {
        const rows = await within(sql`select slot, rest_until, fails, last_ok from model_health where updated_at > now() - interval '15 minutes'`);
        return Object.fromEntries(rows.map((r) => [String(r.slot), { restUntil: ms(r.rest_until), fails: Number(r.fails) || 0, lastOk: ms(r.last_ok) }]));
      } catch { return null; }
    },
    async save(slot, s) {
      try {
        await within(sql`insert into model_health (slot, rest_until, fails, last_ok, updated_at) values (${slot}, ${at(s.restUntil)}, ${s.fails}, ${at(s.lastOk)}, now())
          on conflict (slot) do update set rest_until = excluded.rest_until, fails = excluded.fails, last_ok = excluded.last_ok, updated_at = now()`);
      } catch { /* best-effort: the instance keeps its own view */ }
    },
  };
}
