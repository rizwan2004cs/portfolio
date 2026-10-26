import { BEHAVIOR, KINDS, ruleKind, SENSITIVE, type Kind } from "./behavior";

/** The outer agent: one call to a decision model sorts each message into a Kind before anything else runs. */
export interface Classification { kind: Kind; confidence: number; source: "model" | "rules"; note: string }
export type Classifier = (text: string, signal: AbortSignal) => Promise<Classification>;

const DECISIONS = "https://openrouter.ai/api/alpha/decisions";
/** Free decision models, tried in order: a rate-limited one hands the message to the next. */
export const CLASSIFIER_MODELS = ["baseten/mammoth-1:free", "inception/mercury-decide:free"] as const;
const SITE = "A portfolio site for Syed Mohammad Rizwan, an AI engineer, with an AI agent visitors chat with.";

/** Below this the model's pick is a guess: a sensitive guess still wins (declining is cheaper than the model
 *  talking about him), anything else goes on to the model as a work question. */
export const CONFIDENT = 0.5;

/** How a classification turns into a decision: the kind the policy acts on. */
export function decide(c: Classification): Kind {
  if (c.source === "rules" || c.kind === "work") return c.kind;
  return c.confidence >= CONFIDENT || SENSITIVE.includes(c.kind) ? c.kind : "work";
}

/** OpenRouter's Decisions API with a short timeout; any failure falls back to the word rules, so the site never
 *  depends on a free endpoint being up. */
export function decisionClassifier(key: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = 1500): Classifier {
  const rules = (text: string, why: string): Classification => ({ kind: ruleKind(text), confidence: 1, source: "rules", note: why });
  if (!key) return async (text) => rules(text, "rules · no classifier key");
  const criteria = Object.fromEntries(KINDS.map((k) => [k, BEHAVIOR[k].describe]));
  // the same message (a chip, a common greeting) never costs a second call
  const seen = new Map<string, Classification>();
  return async (text, signal) => {
    const cacheKey = text.trim().toLowerCase();
    const hit = seen.get(cacheKey);
    if (hit) return { ...hit, note: `${hit.note} · cached` };
    let last = "";
    for (const model of CLASSIFIER_MODELS) {
      try {
        const r = await fetchImpl(DECISIONS, {
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          headers: { Authorization: `Bearer ${key}`, "content-type": "application/json", "X-OpenRouter-Title": "portfolio intent" },
          body: JSON.stringify({ model, state: { site: SITE, visitor_message: text.slice(0, 1500) }, questions: { kind: { type: "choice", instructions: "What kind of message is this?", criteria } } }),
        });
        if (!r.ok) { last = `HTTP ${r.status}`; if (r.status === 429 || r.status >= 500) continue; break; }
        const a = ((await r.json()) as { answers?: { kind?: { choice?: string; confidence?: number } } }).answers?.kind;
        if (!a?.choice || !KINDS.includes(a.choice as Kind)) { last = "no kind"; continue; }
        const confidence = Number(a.confidence ?? 0);
        const c: Classification = { kind: a.choice as Kind, confidence, source: "model", note: `${a.choice} · ${confidence.toFixed(2)} confidence · ${model.split("/")[1].replace(":free", "")}` };
        if (seen.size > 2000) seen.delete(seen.keys().next().value as string);
        seen.set(cacheKey, c);
        return c;
      } catch (e) {
        if (signal.aborted) break;
        last = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable";
        if (last === "timed out") break; // the visitor is waiting: no second model after a timeout
      }
    }
    return rules(text, `rules · classifier ${last || "unavailable"}`);
  };
}
