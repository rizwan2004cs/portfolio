import { BEHAVIOR, KINDS, ruleKind, SENSITIVE, type Kind } from "./behavior";
import { NVIDIA_MODELS, OPENROUTER_MODELS } from "./models";
import type { ChatMessage } from "./types";
import PROMPT from "./classifier-prompt.json";

/** The outer agent: one call to a decision model sorts each message into a Kind before anything else runs. */
export interface Classification { kind: Kind; confidence: number; source: "model" | "rules"; note: string;
  /** the model's probability for each kind, when it gave them */
  probabilities?: Partial<Record<Kind, number>>;
  /** who the visitor said they are, when the message introduced them */
  visitor?: Visitor }
export interface Visitor { name?: string; company?: string; role?: string; hiringFor?: string }
/** The exchange before this message: "count" after "what's his body count" is the same topic, and "Not animal"
 *  after the agent's superhero joke is a follow-up to the joke. */
export interface Previous { user: string; agent?: string }
export type Classifier = (text: string, signal: AbortSignal, previous?: Previous) => Promise<Classification>;

/** Where the classifier runs: NVIDIA's fastest Nemotron first (no daily cap), the same model free on OpenRouter second. */
export interface ClassifierEndpoint { name: string; url: string; model: string; key: string }
export const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL || NVIDIA_MODELS[0];
export function classifierEndpoints(nvidiaKey?: string, openRouterKey?: string): ClassifierEndpoint[] {
  return [
    ...(nvidiaKey ? [{ name: "nvidia", url: "https://integrate.api.nvidia.com/v1/chat/completions", model: CLASSIFIER_MODEL, key: nvidiaKey }] : []),
    ...(openRouterKey ? [{ name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", model: OPENROUTER_MODELS[0], key: openRouterKey }] : []),
  ];
}
const SITE = "A portfolio site for Syed Mohammad Rizwan, an AI engineer, with an AI agent visitors chat with.";
const VISITOR_FIELDS = ["name", "company", "role", "hiringFor"] as const;

/** Below this the model's pick is a guess: a sensitive guess still wins (declining is cheaper than the model
 *  talking about him), anything else goes on to the model as a work question. */
export const CONFIDENT = 0.5;

/** How a classification turns into a decision: the kind the policy acts on. */
export function decide(c: Classification): Kind {
  if (c.source === "rules" || c.kind === "work") return c.kind;
  if (c.confidence >= CONFIDENT || SENSITIVE.includes(c.kind)) return c.kind;
  // unsure and not sensitive: if the sensitive kinds together outweigh work, decline as the likeliest of them
  const p = c.probabilities ?? {}, sensitive = SENSITIVE.map((k) => [k, p[k] ?? 0] as const).sort((a, b) => b[1] - a[1]);
  return sensitive.reduce((n, [, v]) => n + v, 0) > (p.work ?? 0) ? sensitive[0][0] : "work";
}

/** The classifier prompt: every kind's definition comes from the policy, so the model sorts by what production acts on;
 *  the site-specific rules and labelled examples live in classifier-prompt.json, shared with scripts/eval-intents.mjs
 *  (which mirrors this shape: change both together). */
export function classifierMessages(text: string, previous?: Previous): ChatMessage[] {
  const kinds = KINDS.map((k) => `- ${k}: ${BEHAVIOR[k].describe}`).join("\n");
  const examples = PROMPT.examples.map((e) => `"${e.text}" → ${e.kind}`).join("\n");
  const system = `${SITE}\nSort the visitor's newest message into exactly one kind. A short follow-up takes the kind of the exchange before it.\nKinds:\n${kinds}\n`
    + `Rules:\n${PROMPT.guidance.map((g) => `- ${g}`).join("\n")}\nExamples:\n${examples}\n`
    + `Reply with JSON only: {"kind": <kind>, "confidence": <0 to 1>, "visitor": {"name", "company", "role", "hiringFor"}} where "visitor" appears only when the kind is visitor_intro, with only the fields the message states.`;
  const context = previous ? `Previous visitor message: ${previous.user.slice(0, 500)}\n${previous.agent ? `Agent's reply: ${previous.agent.slice(0, 500)}\n` : ""}` : "";
  return [{ role: "system", content: system }, { role: "user", content: `${context}Visitor message: ${text.slice(0, 1500)}` }];
}

/** Nemotron with a short timeout, on NVIDIA then OpenRouter; any failure falls back to the word rules, so the site never
 *  depends on an endpoint being up. A timeout stops the chain: the visitor is waiting. */
export function nemotronClassifier(endpoints: ClassifierEndpoint[] | string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = 2000): Classifier {
  const list = typeof endpoints === "string" ? classifierEndpoints(endpoints) : endpoints ?? [];
  const rules = (text: string, why: string): Classification => ({ kind: ruleKind(text), confidence: 1, source: "rules", note: why });
  if (!list.length) return async (text) => rules(text, "rules · no classifier key");
  // the same message (a chip, a common greeting) never costs a second call
  const seen = new Map<string, Classification>();
  return async (text, signal, previous) => {
    const cacheKey = `${previous?.user.trim().toLowerCase() ?? ""}\u0000${text.trim().toLowerCase()}`;
    const hit = seen.get(cacheKey);
    if (hit) return { ...hit, note: `${hit.note} · cached` };
    let why = "unavailable";
    for (const ep of list) {
      try {
        const r = await fetchImpl(ep.url, {
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
          headers: { Authorization: `Bearer ${ep.key}`, "content-type": "application/json", ...(ep.name === "openrouter" ? { "X-OpenRouter-Title": "portfolio intent" } : {}) },
          body: JSON.stringify({ model: ep.model, temperature: 0, max_tokens: 120, chat_template_kwargs: { enable_thinking: false }, messages: classifierMessages(text, previous) }),
        });
        if (!r.ok) { why = `HTTP ${r.status}`; continue; }
        const content = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
        const parsed = parseAnswer(content);
        if (!parsed) { why = "unreadable"; continue; }
        const c: Classification = { ...parsed, source: "model", note: `${parsed.kind} · ${parsed.confidence.toFixed(2)} confidence · ${ep.model.split("/")[1].replace(":free", "")} · ${ep.name}` };
        if (seen.size > 2000) seen.delete(seen.keys().next().value as string);
        seen.set(cacheKey, c);
        return c;
      } catch (e) {
        if (signal.aborted) return rules(text, "rules · aborted");
        why = e instanceof Error && e.name === "TimeoutError" ? "timed out" : "unreachable";
        if (why === "timed out") break;
      }
    }
    return rules(text, `rules · classifier ${why}`);
  };
}

/** The first JSON object in the model's text, with only the fields the policy knows. */
export function parseAnswer(content: string): { kind: Kind; confidence: number; visitor?: Visitor } | null {
  const m = /\{[\s\S]*\}/.exec(content);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as { kind?: unknown; confidence?: unknown; visitor?: Record<string, unknown> };
    if (typeof j.kind !== "string" || !KINDS.includes(j.kind as Kind)) return null;
    const confidence = Math.min(1, Math.max(0, Number(j.confidence ?? 0))) || 0;
    const visitor: Visitor = {};
    if (j.visitor && typeof j.visitor === "object") for (const f of VISITOR_FIELDS) { const v = j.visitor[f]; if (typeof v === "string" && v.trim()) visitor[f] = v.trim().slice(0, 80); }
    return { kind: j.kind as Kind, confidence, ...(Object.keys(visitor).length ? { visitor } : {}) };
  } catch { return null; }
}
