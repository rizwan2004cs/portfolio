import type { AgentEvent } from "./types";

export const CONTENT_VERSION = "v1";

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();

/** Same question + same screen → same answer. Unicode-aware so non-Latin questions never collide on "". */
export const cacheKey = (turns: string[], shown: string[], version = CONTENT_VERSION) =>
  [version, turns.map(norm).join(" | "), [...shown].sort().join(",")].join("§");

export interface AnswerCache {
  get(key: string): AgentEvent[] | undefined;
  set(key: string, events: AgentEvent[]): void;
}

/** In-memory LRU with TTL. On Vercel a warm function instance keeps it; cold starts simply miss. */
export function makeCache({ ttlMs = 7 * 24 * 3600 * 1000, max = 500, now = () => Date.now() } = {}): AnswerCache {
  const m = new Map<string, { at: number; events: AgentEvent[] }>();
  return {
    get(key) {
      const hit = m.get(key);
      if (!hit) return undefined;
      if (now() - hit.at > ttlMs) { m.delete(key); return undefined; }
      m.delete(key); m.set(key, hit); // refresh recency
      return hit.events;
    },
    set(key, events) {
      m.set(key, { at: now(), events });
      while (m.size > max) m.delete(m.keys().next().value as string);
    },
  };
}
