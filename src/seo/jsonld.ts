import type { BreadcrumbList, Person, ProfilePage, SoftwareSourceCode, WebSite, WithContext } from "schema-dts";
import { EDUCATION, EVENTS, EXPERIENCE, PROFILE } from "@/content/data";
import type { Project } from "@/content/types";
import { SITE } from "@/content/site";

const PERSON_ID = `${SITE.url}/#person`;
const CURRENT = EXPERIENCE.find((x) => x.now) ?? EXPERIENCE[0];

export const person: Person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: PROFILE.name,
  // every way people spell or shorten his name, so a search for any of them can resolve to this one person
  alternateName: ["Mohammad Rizwan", "Mohammed Rizwan", "Muhammad Rizwan", "Syed Rizwan", "Rizwan Syed", "Rizwan"],
  // what tells him apart from everyone else with the name
  disambiguatingDescription: "AI engineer and software developer in Bengaluru, India; Associate Software Engineer (R&D) at Novulis Consulting.",
  givenName: "Mohammad Rizwan",
  familyName: "Syed",
  jobTitle: "AI Engineer",
  worksFor: { "@type": "Organization", name: CURRENT.title },
  hasOccupation: { "@type": "Occupation", name: CURRENT.role, occupationLocation: { "@type": "City", name: "Bengaluru" } },
  description: PROFILE.summary,
  url: SITE.url,
  image: `${SITE.url}/img/portrait.jpg`,
  email: `mailto:${PROFILE.links.email}`,
  address: { "@type": "PostalAddress", addressLocality: "Bengaluru", addressRegion: "Karnataka", addressCountry: "IN" },
  alumniOf: { "@type": "CollegeOrUniversity", name: EDUCATION.school, alternateName: "NBKRIST" },
  award: EVENTS.filter((e) => e.kind === "won").map((e) => `${e.result.replace(/^won /, "")} prize, ${e.title} (${e.where}, ${e.when})`),
  homeLocation: { "@type": "City", name: "Bengaluru", alternateName: "Bangalore" },
  knowsAbout: ["AI agents", "Multi-agent systems", "LangGraph", "Retrieval-augmented generation", "Voice agents", "Python", "FastAPI", "TypeScript", "Next.js", "Azure"],
  // every profile that is him: the links search engines use to join them into one person
  sameAs: [PROFILE.links.github, PROFILE.links.linkedin],
  mainEntityOfPage: SITE.url,
};

export const siteGraph: WithContext<WebSite> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE.url}/#website`,
  url: SITE.url,
  name: SITE.name,
  alternateName: ["Mohammad Rizwan", "mohammad-rizwan.tech"],
  description: SITE.description,
  inLanguage: "en",
  publisher: { "@id": PERSON_ID },
};

export const profilePage = (path: string): WithContext<ProfilePage> => ({
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  url: SITE.url + path,
  name: SITE.title,
  dateModified: SITE.updated,
  inLanguage: "en",
  isPartOf: { "@id": `${SITE.url}/#website` },
  mainEntity: person,
});

/** A project as what it is, code with an author: the repository, languages and topics, credited to him. */
export const projectWork = (p: Project): WithContext<SoftwareSourceCode> => ({
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: p.title,
  description: p.oneLiner,
  url: `${SITE.url}/work/${p.id}`,
  dateCreated: String(p.year),
  keywords: [...(p.keywords ?? []), ...p.stack].join(", "),
  programmingLanguage: p.stack.filter((x) => /^(Python|TypeScript|JavaScript|Java\b|Kotlin|SQL)/.test(x)),
  ...(p.links.source ? { codeRepository: p.links.source } : {}),
  ...(p.links.live ? { targetProduct: { "@type": "SoftwareApplication", name: p.title, url: p.links.live, applicationCategory: "WebApplication", operatingSystem: "Web" } } : {}),
  author: { "@type": "Person", "@id": PERSON_ID, name: PROFILE.name, url: SITE.url },
  creator: { "@id": PERSON_ID },
  ...(p.image ? { image: `${SITE.url}/img/${p.image}` } : {}),
});

/** The trail a write-up sits on (the same one its page shows): Google can print it under the link in results. */
export const projectCrumbs = (p: Project): WithContext<BreadcrumbList> => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url },
    { "@type": "ListItem", position: 2, name: "Projects", item: `${SITE.url}/#projects` },
    { "@type": "ListItem", position: 3, name: p.title, item: `${SITE.url}/work/${p.id}` },
  ],
});

/** Serialise for a <script type="application/ld+json">; escapes "<" so content can't close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
