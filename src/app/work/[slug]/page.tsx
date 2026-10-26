import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassicIsland } from "@/components/ClassicIsland";
import { Header } from "@/components/Header";
import { PROJECTS, projectById } from "@/content/data";
import type { Project } from "@/content/types";
import { SITE } from "@/content/site";
import { archBlock, diagramSize, esc, factsHtml, img } from "@/render/html";
import { ldJson, projectCrumbs, projectWork } from "@/seo/jsonld";

export const dynamicParams = false;
export const generateStaticParams = () => PROJECTS.map((p) => ({ slug: p.id }));

type Params = { params: Promise<{ slug: string }> };

/** What a search snippet shows: whole words, ≤ 155 characters. */
const snippet = (t: string, max = 155) => (t.length <= max ? t : `${t.slice(0, t.lastIndexOf(" ", max - 1)).replace(/[,;:·—-]+$/, "")}…`);
/** "PACK: AI agents playing a game", "CCR Compliance Advisor: RAG": the words someone would search for the project. */
const seoTitle = (p: Project) => {
  const [k1 = "", k2 = ""] = p.keywords ?? p.tags;
  // "multi-agent" alone reads oddly; a named tool after it ("multi-agent LangGraph") says what it is
  const kw = /^[A-Z]/.test(k2) && !/\s/.test(k1) && !/^[A-Z]/.test(k1) ? `${k1} ${k2}` : k1;
  const lead = kw && !p.title.toLowerCase().includes(kw.toLowerCase()) ? `${p.title}: ${kw}` : p.title;
  return `${lead} · Syed Mohammad Rizwan`.length <= 65 ? `${lead} · Syed Mohammad Rizwan` : `${p.title} · Syed Mohammad Rizwan`;
};
/** Other projects that share the most tags: links that tell Google how his work fits together. */
const related = (p: Project) => PROJECTS.filter((x) => x.id !== p.id)
  .map((x) => ({ x, n: x.tags.filter((t) => p.tags.includes(t)).length + x.stack.filter((t) => p.stack.includes(t)).length }))
  .sort((a, b) => b.n - a.n).slice(0, 3).map(({ x }) => x);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = projectById((await params).slug);
  if (!p) return {};
  // his name early, so a cut snippet still says who built it
  const title = seoTitle(p), description = snippet(`${p.oneLiner} By Syed Mohammad Rizwan, AI engineer in Bengaluru. Built with ${p.stack.slice(0, 3).join(", ")}.`);
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/work/${p.id}` },
    keywords: [p.title, ...(p.keywords ?? []).slice(0, 6), ...p.stack.slice(0, 4), "Syed Mohammad Rizwan", "Mohammad Rizwan"],
    authors: [{ name: SITE.name, url: SITE.url }],
    // the card image is work/[slug]/opengraph-image.tsx: name, one-liner, stack and screenshot
    openGraph: { type: "article", title, description, url: `/work/${p.id}`, authors: [SITE.url] },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Diagrams render inline here (they are the page's content), unlike the lazy tabs in agent mode. */
const diagrams = (id: string, list: { title: string; src: string }[], title: string) =>
  list.map((g, i) => {
    const [w, h] = diagramSize(id, i), src = `/diagrams/${esc(id)}-${i}.svg`;
    return `<figure class="panel dgfig"><figcaption class="ph"><h3>${esc(g.title)}</h3><small>${esc(g.src)}</small></figcaption><a class="dglink" href="${src}" target="_blank" rel="noopener" title="Open full size"><img class="dgimg" src="${src}" alt="${esc(title)}: ${esc(g.title)} (Mermaid diagram)" width="${w}" height="${h}" loading="lazy" decoding="async"></a><a class="dgfull" href="${src}" target="_blank" rel="noopener">Open full size ↗</a></figure>`;
  }).join("");

export default async function WorkPage({ params }: Params) {
  const p = projectById((await params).slug);
  if (!p) notFound();
  const i = PROJECTS.indexOf(p), prev = PROJECTS[i - 1], next = PROJECTS[i + 1];
  const ask = p.sims?.length ? `How does ${p.title} handle failures?` : `Tell me about ${p.title}`;
  const body = `
    ${p.pipeline.length ? `<article class="panel">${archBlock(p)}</article>` : ""}
    ${p.image ? `<div class="panel"><div class="shot">${img(p, "(max-width:900px) 100vw, 880px").replace(' loading="lazy"', ' fetchpriority="high"')}</div></div>` : ""}
    <article class="panel"><div class="body"><div class="ph"><h2>What it does</h2><small>${p.year} · ${esc(p.team)}</small></div>${factsHtml(p.facts)}
      <div class="chips">${p.stack.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div></div>
      <div class="src">source · ${esc(p.source)}</div></article>
    ${p.diagrams?.length ? diagrams(p.id, p.diagrams, p.title) : ""}`;
  return (
    <div className="classic-page">
      <Header mode="work" />
      <main className="classic grid-bg" id="classic">
        <article className="wk">
          <nav className="crumbs" aria-label="Breadcrumb"><a href="/#projects">Projects</a> / {p.title}</nav>
          <h1>{p.title}</h1>
          <p className="lede">{p.oneLiner}</p>
          <div className="cta" style={{ marginTop: "var(--s6)" }}>
            <a className="btn dark" href={`/agent?q=${encodeURIComponent(ask)}`}>Ask my agent about it <span className="arr">↗</span></a>
            {p.links.live && <a className="btn" href={p.links.live} target="_blank" rel="noopener" title={/onrender\.com/.test(p.links.live) ? "Free-tier host: the first load can take about 30 seconds" : undefined}>Live{/onrender\.com/.test(p.links.live) && <small className="wake"> wakes in ~30s</small>} <span className="arr">↗</span></a>}
            {p.links.source && <a className="btn" href={p.links.source} target="_blank" rel="noopener">Source <span className="arr">↗</span></a>}
          </div>
          <div id="cwork" dangerouslySetInnerHTML={{ __html: body }} />
          {/* who built it, in words: the page says his name, not just the title bar */}
          <p className="byline">Built by <a href="/" rel="author">Syed Mohammad Rizwan</a>, AI engineer in Bengaluru, in {p.year}. {p.team}.</p>
          <nav className="related" aria-label="Related projects">
            <h2>Related projects</h2>
            <ul>{related(p).map((x) => <li key={x.id}><a href={`/work/${x.id}`}><b>{x.title}</b></a> <span>{x.oneLiner}</span></li>)}</ul>
          </nav>
          <nav className="nav2" aria-label="More work">
            {prev ? <a className="btn" href={`/work/${prev.id}`}>← {prev.title}</a> : <span />}
            {next ? <a className="btn" href={`/work/${next.id}`}>{next.title} →</a> : <a className="btn" href="/#projects">All projects</a>}
          </nav>
        </article>
      </main>
      <div id="peek" aria-hidden="true"><div className="badge">VIEW</div><div className="card" id="peekCard" /></div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(projectWork(p)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(projectCrumbs(p)) }} />
      <ClassicIsland />
    </div>
  );
}
