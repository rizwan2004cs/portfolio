import { FILM_COUNT, FILMS } from "@/content/films";
import { SITE } from "@/content/site";
import { LIFESTYLE_REPLY } from "./scope";

/** The one page outside his work: the films that shaped how he works. Questions about them are answered from that
 *  page, in his own words, instead of a pointer to it. */
const ALIASES: [RegExp, string][] = [
  [/snow leopard|walter mitty|beautiful things/i, "The Secret Life of Walter Mitty"], [/\bzoo\b|twenty seconds/i, "We Bought a Zoo"],
  [/good will/i, "Good Will Hunting"], [/\bintern\b.*(movie|film)|(movie|film).*\bintern\b|70.year.old/i, "The Intern"],
];
const FILM_Q = /\b(films?|movies?|cinema|tv series|favou?rite (film|movie|series|show))\b/i;
const titled = (text: string) => FILMS.flatMap((g) => g.films).find((f) => new RegExp(`\\b${f.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
export const isFilmQ = (text: string) => FILM_Q.test(text) || ALIASES.some(([re]) => re.test(text)) || !!titled(text);

export function filmsAnswer(text: string): string {
  const all = FILMS.flatMap((g) => g.films.map((f) => ({ ...f, theme: g.theme })));
  const alias = ALIASES.find(([re]) => re.test(text))?.[1];
  const one = all.find((f) => f.title === alias) ?? all.find((f) => f.title === titled(text)?.title);
  if (one) return `${one.title} (${one.year}${one.lang ? `, ${one.lang}` : ""}), under “${one.theme}”: ${one.take} ${one.note}${one.quote ? ` “${one.quote}”` : ""} The rest of the list is at /films.`;
  const themes = FILMS.map((g) => `${g.theme.toLowerCase()} (${g.films.map((f) => f.title).join(", ")})`).join("; ");
  const rank = /favou?rite|best|top|number one|most/i.test(text) ? "He doesn’t rank them. " : "";
  return `${rank}${FILM_COUNT - 1} films and a series shaped how he works, grouped by what they gave him: ${themes}. His note on each, with posters, is at /films.`;
}

/** What he does outside work, as far as the site says: poetry (VerseYou) and the films list; anything else isn't here. */
export function outsideAnswer(text: string): string {
  if (isFilmQ(text)) return filmsAnswer(text);
  const named = text.match(/\b(anime|cricket|football|soccer|basketball|badminton|chess|gym|fitness|yoga|running|marathon|swimming|music|songs?|singing|guitar|piano|gaming|video games|books?|reading|novels?|cooking|travel\w*|photography|pets?|dogs?|cats?|netflix|sports?)\b/i)?.[1];
  return named ? `${named[0].toUpperCase()}${named.slice(1).toLowerCase()} isn’t on the site. Two things outside work are: he writes poetry, which became VerseYou, and he keeps a list of films that shaped how he works (/films).` : LIFESTYLE_REPLY;
}

export const SITE_AGE_Q = /\b(how old is (this|the) (site|portfolio|website)|when (was|did) (this|the) (site|portfolio|website) (get )?(built|made|created|launched|go live|start)|last updated|when was it updated|what(’|')?s new (on|in) (the|this) (site|portfolio|website)|site updated|is (this|the) site (new|recent|up to date))\b/i;
export function siteAgeAnswer(): string {
  const [y, m, d] = SITE.updated.split("-").map(Number);
  const when = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `This site’s content was last updated on ${when}, the date its sitemap carries. It’s one of his 2026 projects: Next.js on Vercel, with this agent on top. Ask how it works.`;
}
