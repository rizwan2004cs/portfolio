import type { Metadata } from "next";
import { ClassicIsland } from "@/components/ClassicIsland";
import { Header } from "@/components/Header";
import { FILM_COUNT, FILMS, imdbUrl, posterUrl, watchUrl, type Film } from "@/content/films";
import { SITE } from "@/content/site";
import { ldJson } from "@/seo/jsonld";

const TITLE = "Motivational films that shaped how I work · Syed Mohammad Rizwan";
const DESCRIPTION = "Motivational and feel-good movies, plus a sci-fi series, that shaped how Syed Mohammad Rizwan works: inspirational films on courage and fresh starts.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/films" },
  keywords: ["motivational movies", "feel-good movies", "inspirational films", "movies that change your perspective", "life-changing movies", "Syed Mohammad Rizwan", ...FILMS.flatMap((g) => g.films.map((f) => f.title))],
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
      <img src={posterUrl(f)} srcSet={`${posterUrl(f, 185)} 185w, ${posterUrl(f, 342)} 342w`} sizes="(max-width:600px) 88px, 120px" alt={`${f.title} (${f.year}) poster`} width={120} height={180} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
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
      item: { "@type": f.kind, name: f.title, genre: f.tags, image: posterUrl(f, 342), sameAs: imdbUrl(f), ...(f.kind === "Movie" ? { dateCreated: f.year } : { startDate: f.year }), ...(f.lang ? { inLanguage: f.lang } : {}), description: f.note },
    })),
  },
};

export default function FilmsPage() {
  let n = 0;
  return (
    <div className="classic-page">
      <Header mode="work" current="outside" />
      <main className="classic grid-bg" id="classic">
        <article className="wk films wide">
          <nav className="crumbs" aria-label="Breadcrumb"><a href="/">Syed Mohammad Rizwan</a> / Films</nav>
          <h1>Films that shaped how I work</h1>
          <p className="lede">Off the clock I watch a lot. These are the motivational and feel-good films that stayed with me: about learning at any age, taking the leap, chasing the next level, and asking the one question nobody asks.</p>
          {FILMS.map((g, gi) => (
            <section key={g.theme} className="fgroup" aria-labelledby={`fg-${gi}`}>
              <h2 id={`fg-${gi}`}>{g.theme}</h2>
              <ul>
                {g.films.map((f) => (
                  <li key={f.title} id={slug(f.title)} className="film">
                    <Poster f={f} hue={(n++ * 47 + gi * 90) % 360} />
                    <div>
                      <h3>{f.title} <small>{f.kind === "TVSeries" ? `series · ${f.year}–` : f.year}{f.lang ? ` · ${f.lang}` : ""}</small></h3>
                      <p className="ftags">{f.tags.map((t) => <span key={t}>{t}</span>)}</p>
                      <p className="ftake">{f.take}</p>
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
