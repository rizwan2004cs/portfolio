import { EDUCATION, EVENTS, EXPERIENCE, PROFILE, PROJECTS, roleDetail } from "@/content/data";
import { SITE } from "@/content/site";

// llms.txt: a plain-text map of the site for AI assistants and answer engines (ChatGPT, Perplexity, Claude…),
// built from the same content as the pages so it never drifts from them.
export const dynamic = "force-static";

export function GET() {
  const body = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${PROFILE.summary} Also known as Mohammad Rizwan (also spelled Mohammed Rizwan or Muhammad Rizwan). An AI engineer based in Bengaluru (Bangalore), India; not to be confused with others who share the name.`,
    "",
    "## Pages",
    `- [Portfolio](${SITE.url}/): work, experience, toolkit, events and contact`,
    `- [AI agent](${SITE.url}/agent): ask about his projects, experience or fit for a role; shows its trace`,
    `- [Resume (PDF)](${SITE.url}/resume.pdf)`,
    "",
    "## Experience",
    ...EXPERIENCE.map((x) => `- ${x.role}, ${x.title} (${x.when}): ${roleDetail(x)}`),
    "",
    "## Projects",
    ...PROJECTS.map((p) => `- [${p.title}](${SITE.url}/work/${p.id}) (${p.year}): ${p.oneLiner} Stack: ${p.stack.join(", ")}.`),
    "",
    "## Events and prizes",
    ...EVENTS.map((e) => `- ${e.when}: ${e.say}`),
    "",
    "## Education",
    `- ${EDUCATION.degree}, ${EDUCATION.school} (${EDUCATION.years}): CGPA ${EDUCATION.cgpa}, ${EDUCATION.classAwarded}`,
    "",
    "## Links",
    `- GitHub: ${PROFILE.links.github}`,
    `- LinkedIn: ${PROFILE.links.linkedin}`,
    `- Email: ${PROFILE.links.email}`,
    "",
  ].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
