import type { BreadcrumbList, Person, ProfilePage, WebSite, CreativeWork, WithContext } from "schema-dts";
import { EXPERIENCE, PROFILE } from "@/content/data";
import type { Project } from "@/content/types";
import { SITE } from "@/content/site";

const PERSON_ID = `${SITE.url}/#person`;
const CURRENT = EXPERIENCE.find((x) => x.now) ?? EXPERIENCE[0];

export const person: Person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: PROFILE.name,
  // people search for him as "Mohammad Rizwan" as often as by his full name
  alternateName: ["Mohammad Rizwan", "Rizwan"],
  givenName: "Mohammad Rizwan",
  familyName: "Syed",
  jobTitle: "AI Engineer",
  worksFor: { "@type": "Organization", name: CURRENT.title },
  hasOccupation: { "@type": "Occupation", name: CURRENT.role, occupationLocation: { "@type": "City", name: "Bengaluru" } },
  description: PROFILE.summary,
  url: SITE.url,
  image: `${SITE.url}/img/portrait.jpg`,
  email: `mailto:${PROFILE.links.email}`,
  address: { "@type": "PostalAddress", addressLocality: "Bangalore", addressRegion: "Karnataka", addressCountry: "IN" },
  alumniOf: { "@type": "CollegeOrUniversity", name: "NBKR Institute of Science and Technology" },
  knowsAbout: ["AI agents", "Multi-agent systems", "LangGraph", "Retrieval-augmented generation", "Voice agents", "Python", "FastAPI", "TypeScript", "Next.js", "Azure"],
  sameAs: [PROFILE.links.github, PROFILE.links.linkedin],
};

export const siteGraph: WithContext<WebSite> = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE.url}/#website`,
  url: SITE.url,
  name: SITE.name,
  description: SITE.description,
  inLanguage: "en",
  publisher: { "@id": PERSON_ID },
};

export const profilePage = (path: string): WithContext<ProfilePage> => ({
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  url: SITE.url + path,
  name: SITE.title,
  mainEntity: person,
});

export const projectWork = (p: Project): WithContext<CreativeWork> => ({
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  name: p.title,
  description: p.oneLiner,
  url: `${SITE.url}/work/${p.id}`,
  dateCreated: String(p.year),
  keywords: p.stack.join(", "),
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
