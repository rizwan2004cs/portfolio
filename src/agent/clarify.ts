import { isProjectId, PROJECTS, projectById } from "@/content/data";

/** A short question the agent asked, with the two or three answers it can act on; it lives one turn in session state. */
export interface Pending { question: string; options: string[] }

const ORDINAL = ["first", "second", "third", "1st", "2nd", "3rd", "1", "2", "3", "one", "two", "three"];
/** The option the visitor picked, when their message is one: by text, by number or ordinal, or by the project it names. */
export function resolvePending(last: string, pending?: Pending): string | null {
  if (!pending?.options.length) return null;
  const t = last.trim().toLowerCase().replace(/[?!.]+$/, "");
  const byText = pending.options.find((o) => o.toLowerCase() === t || o.toLowerCase().replace(/[?!.]+$/, "") === t);
  if (byText) return byText;
  const m = /^(?:the\s+)?(first|second|third|1st|2nd|3rd|1|2|3|one|two|three)(?:\s+one)?$/i.exec(t);
  if (m) { const i = ORDINAL.indexOf(m[1].toLowerCase()) % 3; return pending.options[i] ?? null; }
  const named = PROJECTS.find((p) => t.includes(p.title.toLowerCase()));
  return named ? pending.options.find((o) => o.toLowerCase().includes(named.title.toLowerCase())) ?? null : null;
}

/** "the other one", "that one", "the second": which project, when two or more are on screen and the message names none. */
export function whichOne(last: string, shown: readonly string[], focus: string | null): Pending | null {
  const t = last.trim().toLowerCase();
  if (!/^(?:and\s+)?(?:the\s+)?(?:other|second|first|next|that|this|former|latter)\s+(?:one|project)\??$|^(?:what about|and)\s+(?:the\s+)?(?:other|second|first|next)(?:\s+one)?\??$/.test(t)) return null;
  const projects = [...new Set(shown.filter((id) => isProjectId(id)))].map((id) => projectById(id)!);
  const candidates = /\bother\b/.test(t) && focus ? projects.filter((p) => p.id !== focus) : projects;
  if (candidates.length === 1 && /\bother\b/.test(t)) return null; // "the other one" with exactly one other: no question needed
  if (candidates.length < 2) return null;
  return { question: `Which one do you mean?`, options: candidates.slice(0, 3).map((p) => `Open ${p.title}`) };
}
