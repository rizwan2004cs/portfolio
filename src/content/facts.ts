import { EDUCATION, EVENTS, EXPERIENCE, GAPS, PROFILE, PROJECTS, SIDE, TOOLKIT, WHY_HIM } from "./data";
import { RESUME_FACTS } from "./resume";

/** One sentence the site stands behind, with where it comes from. The retrieval index (Neon pgvector) holds exactly
 *  these, so a model sentence can be checked against them by meaning as well as by words. */
export interface Fact { id: string; kind: "project" | "stack" | "team" | "event" | "experience" | "education" | "side" | "toolkit" | "profile" | "resume"; project?: string; text: string }

/** A short stable id from the text itself: the index is upserted by id, so an unchanged fact is never re-embedded. */
export const factId = (kind: string, text: string) => {
  let h = 7; for (const ch of text) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return `${kind}:${(h >>> 0).toString(36)}`;
};
const fact = (kind: Fact["kind"], text: string, project?: string): Fact => ({ id: factId(kind, text), kind, text, ...(project ? { project } : {}) });

export const FACTS: Fact[] = [
  fact("profile", `${PROFILE.name} is ${PROFILE.role} in ${PROFILE.location}. ${PROFILE.summary}`),
  fact("profile", WHY_HIM),
  fact("profile", GAPS),
  ...PROJECTS.flatMap((p) => [
    fact("project", `${p.title}: ${p.oneLiner}`, p.id),
    ...p.facts.map((f) => fact("project", f, p.id)),
    fact("stack", `${p.title} is built with ${p.stack.join(", ")}.`, p.id),
    fact("team", `${p.title} team: ${p.team}.`, p.id),
  ]),
  ...EVENTS.flatMap((e) => [fact("event", e.say), fact("event", `${e.title}, ${e.where} (${e.when}): ${e.result}. ${e.body}`)]),
  ...EXPERIENCE.map((x) => fact("experience", `${x.role} at ${x.title} (${x.when}): ${x.body}`)),
  fact("education", `${EDUCATION.degree}, ${EDUCATION.school} (${EDUCATION.years}), CGPA ${EDUCATION.cgpa}, ${EDUCATION.classAwarded}.`),
  ...EDUCATION.earlier.map(([what, score]) => fact("education", `${what}: ${score}.`)),
  ...SIDE.map((s) => fact("side", `${s.title} (${s.year}): ${s.body} Built with ${s.stack.join(", ")}.`)),
  ...TOOLKIT.map(([group, items]) => fact("toolkit", `${group}: ${items.join(", ")}.`)),
  ...RESUME_FACTS.map((r) => fact("resume", r.text)),
];
