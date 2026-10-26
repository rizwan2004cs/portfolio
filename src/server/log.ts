import { neon } from "@neondatabase/serverless";
import type { AgentEvent, RunMeta } from "@/agent/types";

/** One visitor turn as stored in Neon (db/schema.sql → agent_turns). No IP address: a session id and a country. */
export interface TurnLog {
  session?: string;
  turn: number;
  question: string;
  events: AgentEvent[];
  meta?: RunMeta;
  ms: number;
  killed: boolean;
  country?: string;
  error?: string;
}
export type TurnLogger = (row: TurnLog) => Promise<void>;

const json = (v: unknown) => JSON.stringify(v ?? null);

/** Writes turns to Postgres over Neon's HTTP driver; undefined when no database is configured (local runs, tests). */
export function neonTurnLog(url: string | undefined): TurnLogger | undefined {
  if (!url) return undefined;
  const sql = neon(url);
  return async (r) => {
    const of = <T extends AgentEvent["type"]>(t: T) => r.events.filter((e): e is Extract<AgentEvent, { type: T }> => e.type === t);
    const answer = of("text").map((e) => e.text).join(" ").trim();
    await sql`insert into agent_turns
      (session, turn, question, answer, mode, model, ms, tools, panels, approvals, chips, trace, killed, country, error)
      values (${r.session ?? null}, ${r.turn}, ${r.question.slice(0, 2000)}, ${answer.slice(0, 4000) || null}, ${r.meta?.mode ?? null},
        ${r.meta?.model ?? null}, ${r.ms}, ${r.meta?.tools ?? null}, ${json(of("panel").map((e) => e.panel))}::jsonb,
        ${json(of("approval").map((e) => e.action))}::jsonb, ${json(of("suggest").at(-1)?.options ?? [])}::jsonb,
        ${json(of("trace").map(({ step, detail, level }) => ({ step, detail, level })))}::jsonb, ${r.killed}, ${r.country ?? null}, ${r.error ?? null})`;
  };
}
