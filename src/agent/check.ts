import { splitSentences } from "./clean";

/** One read of a whole draft against the facts the tools returned: a verdict per sentence from a small model, used on
 *  long answers where the word check alone is weakest. Any failure returns null and the word check's verdict stands. */
export const CHECK_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b";
const URL_ = "https://integrate.api.nvidia.com/v1/chat/completions";
export type SelfCheck = (draft: string, facts: string, signal?: AbortSignal) => Promise<{ sentence: string; ok: boolean; why: string }[] | null>;

export function nemotronSelfCheck(key: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = 2500): SelfCheck | undefined {
  if (!key) return undefined;
  return async (draft, facts, signal) => {
    const sentences = splitSentences(draft);
    if (sentences.length < 3) return null; // short answers keep the fast path
    try {
      const r = await fetchImpl(URL_, {
        method: "POST",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
        headers: { "content-type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: CHECK_MODEL, temperature: 0, max_tokens: 200, chat_template_kwargs: { enable_thinking: false }, messages: [
          { role: "system", content: "You check sentences written about a software engineer against facts from his portfolio. A sentence is supported only if every claim in it (names, numbers, technologies, roles, dates, outcomes) follows from the facts; paraphrase and figures of speech are fine, an added or contradicted detail is not. Reply with JSON only: {\"verdicts\": [{\"i\": <sentence number>, \"supported\": true|false, \"why\": \"<six words>\"}]} with one entry per sentence." },
          { role: "user", content: `Facts:\n${facts.slice(0, 6000)}\n\nSentences:\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}` },
        ] }),
      });
      if (!r.ok) return null;
      const content = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
      // the model may answer with the object asked for, or with the bare array
      const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(content);
      if (!m) return null;
      const j = JSON.parse(m[0]) as { verdicts?: unknown } | unknown[];
      const list = Array.isArray(j) ? j : Array.isArray((j as { verdicts?: unknown }).verdicts) ? ((j as { verdicts: unknown[] }).verdicts) : null;
      if (!list) return null;
      const verdicts = list as { i?: number; supported?: boolean; why?: string }[];
      return sentences.map((sentence, i) => { const v = verdicts.find((x) => Number(x.i) === i + 1); return { sentence, ok: v ? v.supported !== false : true, why: String(v?.why ?? "").slice(0, 60) }; });
    } catch { return null; }
  };
}
