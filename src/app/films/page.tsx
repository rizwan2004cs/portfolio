import type { Metadata } from "next";
import { ClassicIsland } from "@/components/ClassicIsland";
import { Header } from "@/components/Header";
import { FILM_COUNT, FILMS, imdbUrl, posterUrl, watchUrl, type Film } from "@/content/films";
import { SITE } from "@/content/site";
import { ldJson } from "@/seo/jsonld";

const TITLE = "Films that shaped how I work · Syed Mohammad Rizwan";
const DESCRIPTION = `${FILM_COUNT} films and a series that shaped how Syed Mohammad Rizwan, an AI engineer in Bengaluru, thinks about learning, courage and curiosity, in his own words.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/films" },
  keywords: ["Syed Mohammad Rizwan", "Mohammad Rizwan", "favourite films", "films that inspire", ...FILMS.flatMap((g) => g.films.map((f) => f.title))],
  openGraph: { type: "article", title: TITLE, description: DESCRIPTION, url: "/films" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
/** A small typographic tile instead of a poster: the title's initials in the site's dot font, the year under them. */
const initials = (t: string) => t.replace(/^The\s+/i, "").split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w) && !/^(of|a|an|the|and)$/i.test(w)).slice(0, 3).map((w) => w[0].toUpperCase()).join("");

/** The official poster from TMDB's image server, over a typographic tile that shows if the poster can't load. */
function Poster({ f, hue }: { f: Film; hue: number }) {
  return (
    <a className="ftile" href={imdbUrl(f)} target="_blank" rel="noopener" style={{ ["--fh" as string]: hue }} aria-label={`${f.title} on IMDb`}>
      <span className="fi" aria-hidden="true">{initials(f.title)}</span>
      <span className="fy" aria-hidden="true">{f.kind === "TVSeries" ? "series" : f.year}</span>
      <img src={posterUrl(f)} srcSet={`${posterUrl(f, 92)} 92w, ${posterUrl(f, 185)} 185w`} sizes="72px" alt={`${f.title} (${f.year}) poster`} width={72} height={108} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
    </a>
  );
}

// the list as data: a collection he wrote, each item the film or series it is about
const graph = {
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  name: TITLE,
  description: DESCRIPTION,
  url: `${SITE.url}/films`,
  inLanguage: "en",
  author: { "@type": "Person", "@id": `${SITE.url}/#person`, name: SITE.name, url: SITE.url },
  isPartOf: { "@id": `${SITE.url}/#website` },
  mainEntity: {
    "@type": "ItemList",
    numberOfItems: FILM_COUNT,
    itemListElement: FILMS.flatMap((g) => g.films).map((f, i) => ({
      "@type": "ListItem", position: i + 1, url: `${SITE.url}/films#${slug(f.title)}`,
      item: { "@type": f.kind, name: f.title, image: posterUrl(f, 342), sameAs: imdbUrl(f), ...(f.kind === "Movie" ? { dateCreated: f.year } : { startDate: f.year }), ...(f.lang ? { inLanguage: f.lang } : {}), description: f.note },
    })),
  },
};

export default function FilmsPage() {
  let n = 0;
  return (
    <div className="classic-page">
      <Header mode="work" />
      <main className="classic grid-bg" id="classic">
        <article className="wk films">
          <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Syed Mohammad Rizwan</a> / Films</nav>
          <h1>Films that shaped how I work</h1>
          <p className="lede">Off the clock I watch a lot. These are the ones that stayed: about learning at any age, taking the leap, chasing the next level, and asking the one question nobody asks.</p>
          {FILMS.map((g, gi) => (
            <section key={g.theme} className="fgroup" aria-labelledby={`fg-${gi}`}>
              <h2 id={`fg-${gi}`}>{g.theme}</h2>
              <ul>
                {g.films.map((f) => (
                  <li key={f.title} id={slug(f.title)} className="film">
                    <Poster f={f} hue={(n++ * 47 + gi * 90) % 360} />
                    <div>
                      <h3>{f.title} <small>{f.kind === "TVSeries" ? `series · ${f.year}–` : f.year}{f.lang ? ` · ${f.lang}` : ""}</small></h3>
                      <p>{f.note}</p>
                      {f.quote && <blockquote>“{f.quote}”</blockquote>}
                      <p className="flinks"><a href={imdbUrl(f)} target="_blank" rel="noopener">IMDb ↗</a><a href={watchUrl(f)} target="_blank" rel="noopener">Where to watch ↗</a></p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="tmdb">Posters and where-to-watch listings from <a href="https://www.themoviedb.org/" target="_blank" rel="noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          <p className="byline">Picked and written by <a href="/" rel="author">Syed Mohammad Rizwan</a>, AI engineer in Bengaluru. When he isn’t watching, he <a href="/#projects">builds AI agents</a>.</p>
        </article>
      </main>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(graph) }} />
      <ClassicIsland />
    </div>
  );
}
