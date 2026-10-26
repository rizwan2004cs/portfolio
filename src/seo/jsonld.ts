import type { Person, ProfilePage, WebSite, CreativeWork, WithContext } from "schema-dts";
import { PROFILE } from "@/content/data";
import type { Project } from "@/content/types";
import { SITE } from "@/content/site";

const PERSON_ID = `${SITE.url}/#person`;

export const person: Person = {
  "@type": "Person",
  "@id": PERSON_ID,
  name: PROFILE.name,
  jobTitle: "AI Engineer",
  description: PROFILE.summary,
  url: SITE.url,
  image: `${SITE.url}/img/portrait.jpg`,
  email: `mailto:${PROFILE.links.email}`,
  address: { "@type": "PostalAddress", addressLocality: "Bangalore", addressRegion: "Karnataka", addressCountry: "IN" },
  alumniOf: { "@type": "CollegeOrUniversity", name: "NBKR Institute of Science and Technology" },
  knowsAbout: ["AI agents", "LangGraph", "Retrieval-augmented generation", "Voice agents", "FastAPI", "Next.js", "Azure"],
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

/** Serialise for a <script type="application/ld+json">; escapes "<" so content can't close the tag. */
export const ldJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");
