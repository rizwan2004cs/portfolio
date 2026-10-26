import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClassicIsland } from "@/components/ClassicIsland";
import { Header } from "@/components/Header";
import { PROJECTS, projectById } from "@/content/data";
import { SITE } from "@/content/site";
import { archBlock, diagramSize, esc, factsHtml, img } from "@/render/html";
import { ldJson, projectCrumbs, projectWork } from "@/seo/jsonld";

export const dynamicParams = false;
export const generateStaticParams = () => PROJECTS.map((p) => ({ slug: p.id }));

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const p = projectById((await params).slug);
  if (!p) return {};
  return {
    title: p.title,
    description: `${p.oneLiner} ${p.facts[0] ?? ""} Built by ${SITE.name}, AI engineer in Bengaluru.`.trim(),
    alternates: { canonical: `/work/${p.id}` },
    // the card image is work/[slug]/opengraph-image.tsx: name, one-liner, stack and screenshot
    openGraph: { type: "article", title: `${p.title} · ${SITE.name}`, description: p.oneLiner, url: `/work/${p.id}` },
    twitter: { card: "summary_large_image", title: `${p.title} · ${SITE.name}`, description: p.oneLiner },
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
