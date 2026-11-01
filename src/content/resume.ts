import { CERTS, EXPERIENCE } from "./data";

/** Facts that live only on the resume PDF (src/content/resume.json is its text): leadership, certifications and two
 *  college projects without a public repo. Kept here as dated, reviewable lines so the agent can cite them. */
export interface DatedFact { when: string; where: string; role?: string; text: string }
export const RESUME_FACTS: DatedFact[] = [
  { when: "Feb 2024 – Jan 2026", where: "IEEE Student Branch, NBKRIST", role: "Finance Team Lead (2025 – 2026), Treasurer (2024 – 2025)", text: "At the IEEE Student Branch at NBKRIST he was Treasurer (2024 – 2025), then Finance Team Lead (2025 – 2026), from Feb 2024 to Jan 2026." },
  { when: "2024", where: "college", text: "Health-care Application: a MERN-stack hospital system with patient records, appointments and multi-role access; a college project with no public repo." },
  { when: "2024", where: "college", text: "Keylogger: a security research project on how keystroke-logging malware works, to inform detection; a college project with no public repo." },
  ...CERTS.map(([cert, year]) => ({ when: year || "undated", where: cert.replace(/^.*— /, ""), text: `Certification: ${cert}${year ? ` (${year})` : ""}.` })),
];

/** The resume fact a question is about, by the names only it carries (IEEE, treasurer, keylogger, HackerRank…). */
const RESUME_KEYS: [RegExp, (f: DatedFact) => boolean][] = [
  [/\b(ieee|student branch|treasurer|finance team|finance lead)\b/i, (f) => /IEEE/.test(f.text)],
  [/\bkey ?logg\w*\b/i, (f) => /^Keylogger/.test(f.text)],
  [/\b(health-?care app\w*|hospital (system|app\w*|project)|mern)\b/i, (f) => /^Health-care/.test(f.text)],
  [/\bhackerrank\b/i, (f) => /HackerRank/.test(f.text)],
  [/\blinkedin learning\b/i, (f) => /LinkedIn/.test(f.text)],
];
export function resumeFactFor(text: string): DatedFact | undefined {
  const key = RESUME_KEYS.find(([re]) => re.test(text));
  return key && RESUME_FACTS.find(key[1]);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const month = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase());
/** "Mar – May 2026" → [2026-03, 2026-05]; "Jun 2026 – now" → [2026-06, open]; "Jun – Sep 2025" → [2025-06, 2025-09]. */
export function span(when: string): [number, number] | null {
  const m = /^([A-Za-z]{3})\w*(?: (\d{4}))? ?[–-] ?(?:([A-Za-z]{3})\w* (\d{4})|now|present)$/i.exec(when.trim());
  if (!m) return null;
  const endYear = m[4] ? Number(m[4]) : 9999, startYear = m[2] ? Number(m[2]) : Number(m[4]);
  const start = startYear * 12 + month(m[1]), end = m[3] ? Number(m[4]) * 12 + month(m[3]) : endYear * 12 + 11;
  return [start, end];
}

/** "what was he doing in April 2026?" / "in Aug 2025": the roles whose dates cover that month, newest first. */
export const WHEN_Q = /\b(?:in|during|around|by|on)\s+((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)\s*(20\d\d)\b|\b(?:in|during)\s+(20\d\d)\b/i;
export function whenAnswer(text: string): string | null {
  const m = WHEN_Q.exec(text);
  if (!m) return null;
  const mo = m[1] ? month(m[1]) : null, year = Number(m[2] ?? m[3]);
  const at = mo === null ? null : year * 12 + mo;
  const hits = EXPERIENCE.filter((x) => { const s = span(x.when); return s && (at === null ? s[0] <= year * 12 + 11 && s[1] >= year * 12 : s[0] <= at && s[1] >= at); });
  const label = mo === null ? String(year) : `${m[1].slice(0, 1).toUpperCase()}${m[1].slice(1, 3).toLowerCase()} ${year}`;
  if (!hits.length) return `His resume lists no role for ${label}. His experience: ${EXPERIENCE.map((x) => `${x.role} at ${x.title} (${x.when})`).join("; ")}.`;
  return `In ${label} he was ${hits.map((x) => `${x.role} at ${x.title} (${x.when})`).join(", and ")}. ${hits[0].body}`;
}
