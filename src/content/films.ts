/** Films and one series that shaped how he works, in his own words, grouped by what they gave him.
 *  Posters load from TMDB's image server (never copied onto this site), credited on the page as their terms ask;
 *  IDs come from Wikidata. A typographic tile shows underneath if a poster fails to load. */
export interface Film {
  title: string; year: string; kind: "Movie" | "TVSeries"; lang?: string; note: string; quote?: string;
  imdb: string; tmdb: number; poster: string;
}
export const posterUrl = (f: Film, w: 92 | 185 | 342 = 185) => `https://image.tmdb.org/t/p/w${w}${f.poster}`;
export const imdbUrl = (f: Film) => `https://www.imdb.com/title/${f.imdb}/`;
/** TMDB's "where to watch" page for India, which lists the official streaming and rental options */
export const watchUrl = (f: Film) => `https://www.themoviedb.org/${f.kind === "TVSeries" ? "tv" : "movie"}/${f.tmdb}/watch?locale=IN`;
export interface FilmGroup { theme: string; films: Film[] }

export const FILMS: FilmGroup[] = [
  {
    theme: "Reinventing yourself and taking the leap",
    films: [
      { title: "The Intern", imdb: "tt2361509", tmdb: 257211, poster: "/bTQ46fupPbjBfFBHuzfD3hxxL0Q.jpg", year: "2015", kind: "Movie", note: "Age never matters when it comes to learning new things and adapting to change: a lesson from a 70-year-old starting fresh." },
      { title: "Begin Again", imdb: "tt1980929", tmdb: 198277, poster: "/qx4HXHXt528hS4rwePZbZo20xqZ.jpg", year: "2014", kind: "Movie", note: "When you still have a spark and raw passion inside you, you can restart everything from scratch, wherever you are." },
      { title: "We Bought a Zoo", imdb: "tt1389137", tmdb: 74465, poster: "/dcOvIqdsojUdAtWt1nPT9xS76Su.jpg", year: "2011", kind: "Movie", note: "The push to risk being embarrassed for a moment, just to see a greater life on the other side.", quote: "Sometimes all you need is twenty seconds of insane courage." },
    ],
  },
  {
    theme: "Chasing greatness and pushing your limits",
    films: [
      { title: "Whiplash", imdb: "tt2582802", tmdb: 244786, poster: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg", year: "2014", kind: "Movie", note: "The high of achieving something great, and then still feeling it isn’t enough as you chase the next level." },
      { title: "Good Will Hunting", imdb: "tt0119217", tmdb: 489, poster: "/z2FnLKpFi1HPO7BEJxdkv6hpJSU.jpg", year: "1997", kind: "Movie", note: "Life isn’t only about doing what comes easy to you: real challenges, outside your comfort zone, are what make it exciting." },
    ],
  },
  {
    theme: "Soul-searching and a life refresh",
    films: [
      { title: "The Secret Life of Walter Mitty", imdb: "tt0359950", tmdb: 116745, poster: "/iAo1hlzsPV9XpYcLQp6Ud065tGO.jpg", year: "2013", kind: "Movie", note: "It plays like a full travel vlog, and shows how we race to find something out there that is already within us, unnoticed. The photographer who waits for the snow leopard and never takes the shot says it best.", quote: "Beautiful things don’t ask for attention." },
      { title: "Meiyazhagan", imdb: "tt26758372", tmdb: 1136423, poster: "/ngDEH7YqVaMCAD4LpNxRl6ScJnw.jpg", year: "2024", kind: "Movie", lang: "Tamil", note: "A three-hour conversation that feels like a complete life refresh. It pulls you in so deeply you feel you were right there with them." },
    ],
  },
  {
    theme: "Curiosity and challenging the system",
    films: [
      { title: "Silo", imdb: "tt14688458", tmdb: 125988, poster: "/r2QXomqKjkKHVtYGGtkf2l2Y7go.jpg", year: "2023", kind: "TVSeries", note: "A sci-fi series set in a future where no one is allowed to ask questions, until a single question is asked and everything begins to change." },
    ],
  },
];
export const FILM_COUNT = FILMS.reduce((n, g) => n + g.films.length, 0);
