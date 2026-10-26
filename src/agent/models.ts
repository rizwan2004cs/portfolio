import { TOOL_DEFS } from "./tools";
import { ModelError, type AssistantMessage, type ChatMessage, type ModelClient, type Screen } from "./types";

const GROQ = "https://api.groq.com/openai/v1/chat/completions";
export const MODEL_IDS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"] as const;
export const GUARD_MODEL = "meta-llama/llama-prompt-guard-2-86m";

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const GEMINI_MODEL = "gemini-2.5-flash";
const TOOLS = () => TOOL_DEFS.map((f) => ({ type: "function", function: f }));

// A throttled key sits out its retry-after window instead of costing every visitor a doomed round trip.
// Keyed per fetch implementation so tests with their own fake fetch never share state.
const COOL = new WeakMap<typeof fetch, Map<string, number>>();
const cooling = (f: typeof fetch) => COOL.get(f) ?? (COOL.set(f, new Map()), COOL.get(f)!);

/** Any OpenAI-compatible chat endpoint with our closed-world tools. */
function chatModel(name: string, url: string, key: string, body: Record<string, unknown>, fetchImpl: typeof fetch): ModelClient {
  const slot = `${url}|${String(body.model)}|${key}`;
  return {
    name,
    async complete(messages: ChatMessage[], signal: AbortSignal): Promise<AssistantMessage> {
      const until = cooling(fetchImpl).get(slot) ?? 0;
      if (until > Date.now()) throw new ModelError(`HTTP 429 · resting ${Math.ceil((until - Date.now()) / 1000)}s`, 429);
      const call = () => fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...body, messages, tools: TOOLS(), tool_choice: "auto" }),
      });
      let r: Response;
      try { r = await call(); }
      catch (e) {
        // a key that hangs is likely overloaded: rest it for a minute so the next visitor isn't stuck behind it
        if (e instanceof Error && e.name === "TimeoutError") cooling(fetchImpl).set(slot, Date.now() + 60_000);
        throw e;
      }
      // a malformed tool call comes back as 400 tool_use_failed: a one-off generation glitch, so retry once
      if (r.status === 400 && /tool_use_failed/.test(await r.clone().text().catch(() => ""))) r = await call();
      if (r.status === 429) {
        const wait = Number(r.headers.get("retry-after"));
        cooling(fetchImpl).set(slot, Date.now() + Math.min(Number.isFinite(wait) && wait > 0 ? wait : 20, 300) * 1000);
      }
      if (!r.ok) throw new ModelError(`HTTP ${r.status}`, r.status);
      const j = (await r.json()) as { choices?: { message?: AssistantMessage }[] };
      const msg = j.choices?.[0]?.message;
      if (!msg) throw new ModelError("empty choice");
      return msg;
    },
  };
}

/** `slot` numbers the key when there are several, so the trace can tell "same model, next key" apart from a model change. */
export function groqModel(id: string, key: string, fetchImpl: typeof fetch = fetch, slot = 1, keys = 1): ModelClient {
  const name = id.replace(/^.*\//, "") + (keys > 1 ? ` · key ${slot}` : "");
  return chatModel(name, GROQ, key, { model: id, parallel_tool_calls: true, temperature: 0.3, max_completion_tokens: 500, reasoning_effort: "low" }, fetchImpl);
}

/** Google's Gemini through its OpenAI-compatible endpoint: a separate provider and quota, last before the router. */
export function geminiModel(key: string, fetchImpl: typeof fetch = fetch): ModelClient {
  return chatModel(GEMINI_MODEL, GEMINI, key, { model: GEMINI_MODEL, temperature: 0.3, max_tokens: 500, reasoning_effort: "low" }, fetchImpl);
}

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
/** Free OpenRouter models that call tools; OpenRouter tries them in order inside one request (it allows three). */
export const OPENROUTER_MODELS = ["nvidia/nemotron-3.5-lightning:free", "thinkingmachines/inkling-small:free", "google/gemma-4-31b-it:free"] as const;
/** Free models on OpenRouter: a third provider and quota, after Gemini and before the router. */
export function openRouterModel(key: string, fetchImpl: typeof fetch = fetch): ModelClient {
  return chatModel("openrouter · free models", OPENROUTER, key, { model: OPENROUTER_MODELS[0], models: [...OPENROUTER_MODELS], temperature: 0.3, max_tokens: 500 }, fetchImpl);
}

/** The model chain: each Groq model on every key (a throttled key hands the same model to the next),
 *  then Gemini on its own quota, then free OpenRouter models, then the caller falls back to the deterministic router. */
export function modelChain(groqKeys: string[], geminiKey: string | undefined, fetchImpl: typeof fetch = fetch, openRouterKey?: string): ModelClient[] {
  return [
    ...MODEL_IDS.flatMap((id) => groqKeys.map((k, i) => groqModel(id, k, fetchImpl, i + 1, groqKeys.length))),
    ...(geminiKey ? [geminiModel(geminiKey, fetchImpl)] : []),
    ...(openRouterKey ? [openRouterModel(openRouterKey, fetchImpl)] : []),
  ];
}

/** Prompt-injection screen. Fails open: safety rests on closed-world tools and output checks, not on this. */
export function groqScreen(keys: string | string[] | undefined, fetchImpl: typeof fetch = fetch): Screen {
  const list = (Array.isArray(keys) ? keys : [keys]).filter((k): k is string => !!k);
  return async (text, signal) => {
    if (!list.length) return { ok: true, note: "skipped · no key configured" };
    try {
      let r: Response | undefined;
      for (const key of list) {
        r = await fetchImpl(GROQ, {
          method: "POST",
          signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model: GUARD_MODEL, messages: [{ role: "user", content: text.slice(0, 2000) }] }),
        });
        if (r.status !== 429) break; // throttled: try the next key
      }
      if (!r?.ok) return { ok: true, note: "unavailable · let through (tools are closed-world)" };
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      const score = parseFloat(j.choices?.[0]?.message?.content ?? "");
      if (!Number.isFinite(score)) return { ok: true, note: "unreadable score · let through" };
      return { ok: score <= 0.8, note: `${score > 0.8 ? "flagged" : "passed"} · injection risk ${score < 0.001 ? "<0.001" : score.toFixed(3)}` };
    } catch {
      return { ok: true, note: "timed out · let through" };
    }
  };
}
