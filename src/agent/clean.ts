// a terminator ends a sentence only before whitespace or the end, so "2.5" and "llama-3.3-70b" stay whole
const SENTENCES = /(?:[^.!?]|[.!?]+(?=\S))+(?:[.!?]+(?=\s|$)|$)/g;

/** Plain text, at most four sentences, no markdown, no leaked "suggestions" talk. */
export function clean(text: string): string {
  const t = String(text)
    .split(/\n\s*(\*\*)?next steps/i)[0]
    .replace(/\*\*|__|^#+\s*/gm, "")
    .split("\n")
    .filter((l) => !/^\s*[-*•]\s/.test(l))
    .join(" ");
  // models like non-breaking hyphens (offline‑first); plain ones read the same and keep grounding exact
  const sentences = t.replace(/[\u2010-\u2012\u2212]/g, "-").replace(/\s+/g, " ").trim().match(SENTENCES) ?? [];
  return sentences
    .map((x) => x.trim())
    .filter((x) => !/\b(suggest(ion)?s?|next steps?|tool calls?|panel)\b/i.test(x))
    // last line of defence: no visitor ever reads tool-argument syntax
    .filter((x) => !/[{}]|"\w+"\s*:/.test(x))
    .slice(0, 4)
    .join(" ")
    .trim();
}

/** Models sometimes write the suggest tool call as text; cut it out and recover the options. */
export function repairLeak(text: string): { text: string; options: string[] | null } {
  const m = text.match(/(?:suggest|options)[^[{]{0,40}([[{][\s\S]*)$/i);
  if (!m || m.index === undefined) return { text, options: null };
  const options = [...m[1].matchAll(/"([^"]{2,40})"/g)].map((x) => x[1]).filter((o) => o !== "options");
  return { text: text.slice(0, m.index).trim(), options: options.length ? options.slice(0, 3) : null };
}

export const splitSentences = (text: string): string[] => (text.match(SENTENCES) ?? [text]).map((s) => s.trim()).filter(Boolean);

const TOOL_WORDS = "open_project|show_profile|list_projects|show_harness|match_role|offer_resume|offer_contact|search_projects";
/** gpt-oss sometimes writes a tool call as text ("open_project(id=\"pack\")") instead of making it. Cut it out of the
 *  answer and turn it back into a real call, so the panel still appears and the visitor never sees the syntax. */
export function leakedCalls(text: string): { text: string; calls: { id: string; type: "function"; function: { name: string; arguments: string } }[] } {
  // tool names are snake_case identifiers no real sentence uses, so any occurrence starts a leaked call ("… there. offer_resume")
  const at = text.search(new RegExp(`\\b(${TOOL_WORDS})\\b`, "i"));
  if (at < 0) return bareArgs(text);
  const tail = text.slice(at), calls: ReturnType<typeof leakedCalls>["calls"] = [];
  // one leaked call per line (or several on one line); its arguments run to the next call or the end of the line
  for (const m of tail.matchAll(new RegExp(`\\b(${TOOL_WORDS}|suggest)\\b([^\\n]*?)(?=\\b(?:${TOOL_WORDS}|suggest)\\b|\\n|$)`, "gi"))) {
    const name = m[1].toLowerCase(), body = m[2];
    if (name === "suggest") {
      const options = [...body.matchAll(/"([^"]{2,48})"/g)].map((x) => x[1]).filter((o) => o !== "options");
      if (options.length) calls.push({ id: `leak_${calls.length}`, type: "function", function: { name, arguments: JSON.stringify({ options }) } });
      continue;
    }
    const args: Record<string, string> = {};
    // id=… or positional ("pack", view="card")
    const id = body.match(/\bid\W{0,4}([a-z][a-z0-9-]*)/i)?.[1] ?? body.match(/^\W*["']([a-z][a-z0-9-]*)["']/i)?.[1];
    if (id) args.id = id.toLowerCase();
    if (/architecture/i.test(body)) args.view = "architecture";
    if (name !== "open_project" || args.id) calls.push({ id: `leak_${calls.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
  }
  return { text: text.slice(0, at).replace(/[\s(:,-]+$/, "").trim(), calls };
}

/** The other leak shape: bare JSON arguments with no tool name ("… sections. { "id": "ccr", "view": "architecture" } { ").
 *  The keys say which tool it was; everything from the first object on is cut from the answer. */
function bareArgs(text: string): ReturnType<typeof leakedCalls> {
  const at = text.search(/\{\s*"/);
  if (at < 0) return { text, calls: [] };
  const calls: ReturnType<typeof leakedCalls>["calls"] = [];
  for (const m of text.slice(at).matchAll(/\{[^{}]*\}/g)) {
    const body = m[0], call = (name: string, args: Record<string, unknown>) => calls.push({ id: `leak_${calls.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } });
    const strings = (key: string) => [...(body.match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)`))?.[1] ?? "").matchAll(/"([^"]{2,80})"/g)].map((x) => x[1]);
    const id = body.match(/"id"\s*:\s*"([a-z][a-z0-9-]*)"/i)?.[1];
    if (id) call("open_project", { id: id.toLowerCase(), ...(/"architecture"/.test(body) ? { view: "architecture" } : {}) });
    else if (/"options"/.test(body)) { const o = strings("options"); if (o.length) call("suggest", { options: o.slice(0, 3) }); }
    else if (/"requirements"/.test(body)) { const r = strings("requirements"); if (r.length) call("match_role", { requirements: r.slice(0, 8) }); }
  }
  return { text: text.slice(0, at).replace(/[\s(:,-]+$/, "").trim(), calls };
}

/** "His write-up doesn't cover that." four times is one sentence: drop exact repeats, keep the first. */
export function dedupeSentences(text: string): string {
  const seen = new Set<string>();
  return text.split(/(?<=[.!?])\s+/).filter((x) => { const k = x.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); if (!k || seen.has(k)) return false; seen.add(k); return true; }).join(" ");
}
