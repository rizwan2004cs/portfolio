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
    async complete(messages: ChatMessage[], signal: AbortSignal, onTool?: (name: string) => void): Promise<AssistantMessage> {
      const until = cooling(fetchImpl).get(slot) ?? 0;
      if (until > Date.now()) throw new ModelError(`HTTP 429 · resting ${Math.ceil((until - Date.now()) / 1000)}s`, 429);
      // streamed, so a tool call shows the moment the model names it; the reply is still assembled whole before use
      const call = () => fetchImpl(url, {
        method: "POST",
        signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...body, messages, tools: TOOLS(), tool_choice: "auto", stream: true }),
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
      if ((r.headers.get("content-type") ?? "").includes("text/event-stream")) return readStream(r, onTool);
      const j = (await r.json()) as { choices?: { message?: AssistantMessage }[] };
      const msg = j.choices?.[0]?.message;
      if (!msg) throw new ModelError("empty choice");
      return msg;
    },
  };
}

/** One assistant message out of an OpenAI-style SSE stream: content deltas joined, tool calls assembled by index. */
export async function readStream(r: Response, onTool?: (name: string) => void): Promise<AssistantMessage> {
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let content = "";
  const named = new Set<string>();
  const take = (chunk: { choices?: { delta?: { content?: string | null; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }) => {
    const d = chunk.choices?.[0]?.delta;
    if (!d) return;
    if (d.content) content += d.content;
    for (const tc of d.tool_calls ?? []) {
      const i = tc.index ?? 0, cur = calls.get(i) ?? { id: "", name: "", args: "" };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.name += tc.function.name;
      if (tc.function?.arguments) cur.args += tc.function.arguments;
      calls.set(i, cur);
      if (cur.name && !named.has(`${i}`) && onTool) { named.add(`${i}`); onTool(cur.name); }
    }
  };
  const reader = r.body?.getReader();
  if (!reader) throw new ModelError("empty stream");
  const dec = new TextDecoder(); let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try { take(JSON.parse(data)); } catch { /* a partial or keep-alive line */ }
    }
  }
  const tool_calls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i}`, function: { name: c.name, arguments: c.args || "{}" } }));
  if (!content && !tool_calls.length) throw new ModelError("empty choice");
  return { role: "assistant", content: content || null, ...(tool_calls.length ? { tool_calls } : {}) };
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

const NVIDIA = "https://integrate.api.nvidia.com/v1/chat/completions";
/** NVIDIA's hosted Nemotron models on its free trial endpoints (a per-minute limit, no daily cap): fastest first, frontier last. */
export const NVIDIA_MODELS = ["nvidia/nemotron-3.5-lightning-30b-a3b", "nvidia/nemotron-3.5-super-vl-120b-a12b", "nvidia/nemotron-3-ultra-550b-a55b"] as const;
/** One Nemotron model on NVIDIA's OpenAI-compatible endpoint. Thinking is off: a visitor is waiting, and the answer is a tool pick, not a proof. */
export function nvidiaModel(id: string, key: string, fetchImpl: typeof fetch = fetch): ModelClient {
  return chatModel(id.replace(/^nvidia\//, ""), NVIDIA, key, { model: id, temperature: 0.3, max_tokens: 500, chat_template_kwargs: { enable_thinking: false } }, fetchImpl);
}

const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
/** Free OpenRouter models that call tools; OpenRouter tries them in order inside one request (it allows three). */
export const OPENROUTER_MODELS = ["nvidia/nemotron-3.5-lightning:free", "thinkingmachines/inkling-small:free", "google/gemma-4-31b-it:free"] as const;
/** Free models on OpenRouter: a third provider and quota, after Gemini and before the router. */
export function openRouterModel(key: string, fetchImpl: typeof fetch = fetch): ModelClient {
  return chatModel("openrouter · free models", OPENROUTER, key, { model: OPENROUTER_MODELS[0], models: [...OPENROUTER_MODELS], temperature: 0.3, max_tokens: 500 }, fetchImpl);
}

/** The model chain: each Groq model on every key (a throttled key hands the same model to the next), then NVIDIA's Nemotron
 *  models on their own quota, then Gemini on its, then free OpenRouter models, then the caller falls back to the deterministic router. */
export function modelChain(groqKeys: string[], geminiKey: string | undefined, fetchImpl: typeof fetch = fetch, openRouterKey?: string, nvidiaKey?: string): ModelClient[] {
  return [
    ...MODEL_IDS.flatMap((id) => groqKeys.map((k, i) => groqModel(id, k, fetchImpl, i + 1, groqKeys.length))),
    ...(nvidiaKey ? NVIDIA_MODELS.map((id) => nvidiaModel(id, nvidiaKey, fetchImpl)) : []),
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
