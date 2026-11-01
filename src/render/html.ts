// Shared HTML templates. Pure functions over the trusted content model (always escaped), used by the
// server-rendered pages (/, /work) and by the agent's client controller — one implementation.
import SIZES from "@/content/diagram-sizes.json";
import RESUME from "@/content/resume.json";
import type { Profile, Project } from "@/content/types";
import type { FitRow } from "@/agent/fit";
import { EDUCATION, EVENTS, EXPERIENCE, PROJECTS, roleDetail } from "@/content/data";

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const safeUrl = (u: unknown) => (/^(https?:|mailto:|\/)/.test(String(u)) ? String(u) : "#");

export const CHEV = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4"/></svg>';
export const BOLT = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9 1.5L3 9h4.5L7 14.5 13 7H8.5z"/></svg>';
export const BOOKMARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8v12l-4-3-4 3z"/></svg>';
export const STAR = '<svg class="star" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c.6 6.6 5.4 11.4 12 12-6.6.6-11.4 5.4-12 12-.6-6.6-5.4-11.4-12-12C6.6 11.4 11.4 6.6 12 0z"/></svg>';
export const ICON = {
  grid: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5"/><rect x="9" y="2" width="5" height="5"/><rect x="2" y="9" width="5" height="5"/><rect x="9" y="9" width="5" height="5"/></svg>',
  flow: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="6" width="4" height="4"/><rect x="10.5" y="6" width="4" height="4"/><path d="M5.5 8h5"/></svg>',
  doc: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3 3v10H4z"/><path d="M6 8h4M6 11h4"/></svg>',
  mail: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="3.5" width="13" height="9"/><path d="M1.5 4l6.5 5 6.5-5"/></svg>',
  bolt: BOLT,
  swap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 5h11l-3-3M14 11H3l3 3"/></svg>',
  bookmark: BOOKMARK,
  linkedin: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11zM5 7v4.5M5 4.6v.2M7.5 11.5V7m0 2c0-1.2.8-2 1.8-2s1.7.7 1.7 2v2.5"/></svg>',
  github: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 13.5c-2.5.8-2.5-1.3-3.5-1.5m7 3v-2.2c0-.6 0-1 .4-1.4 2-.2 3.6-1 3.6-4a3.1 3.1 0 0 0-.8-2.1 2.9 2.9 0 0 0-.1-2.1s-.7-.2-2.2.8a7.5 7.5 0 0 0-3.8 0C5.1 3 4.4 3.2 4.4 3.2a2.9 2.9 0 0 0-.1 2.1 3.1 3.1 0 0 0-.8 2.1c0 3 1.6 3.8 3.6 4 .4.4.4.8.4 1.4v2.2"/></svg>',
  phone: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h7v11h-7zM7 11.5h2"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10"/></svg>',
};
const FI = {
  flow: ICON.flow,
  shield: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l5.5 2v4c0 3.5-2.5 6-5.5 7-3-1-5.5-3.5-5.5-7v-4z"/><path d="M5.5 8l2 2 3-3.5"/></svg>',
  lock: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5"/><path d="M5 7V5a3 3 0 016 0v2"/></svg>',
  spark: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4M3.5 3.5l2.5 2.5M10 10l2.5 2.5M12.5 3.5L10 6M6 10l-2.5 2.5"/></svg>',
  db: '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="3.5" rx="5.5" ry="2"/><path d="M2.5 3.5v9c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2v-9M2.5 8c0 1.1 2.5 2 5.5 2s5.5-.9 5.5-2"/></svg>',
  bolt: BOLT,
  hash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2L4.5 14M11.5 2L10 14M2.5 5.5h11M2 10.5h11"/></svg>',
};
export function factIcon(t: string) {
  if (/fallback|mock|never stalls|crash|resume|failure|checkpoint|expire/i.test(t)) return FI.shield;
  if (/private|role|security|hidden|confirm|token|verified|filters/i.test(t)) return FI.lock;
  if (/state machine|graph|→|pipeline|phases?|crawl|BFS/i.test(t)) return FI.flow;
  if (/realtime|push|live|projector/i.test(t)) return FI.bolt;
  if (/offline|IndexedDB|queue|Pinecone|Postgres|Supabase|database|embedded/i.test(t)) return FI.db;
  if (/llama|gpt|gemini|whisper|groq|deepgram|murf|model/i.test(t)) return FI.spark;
  return FI.hash;
}
const HL = /(\b\d+\s?[–-]\s?\d+\b|\b\d+(?:[.,]\d+)+%?|\b\d{2,}%?(?:\s(?:ms|km|Cr|hours|records|sections|players|characters|agents|commits|asset classes|calculators|modules|entries))?\b|\b\d\s(?:players|wolves|calculators|modules|rounds?)\b|\b(?:[Ll]lama|gpt|[Gg]emini|qwen)[\w.-]*(?:\s\d[\w.]*)?(?:\s(?:Flash|Lite|\d+B))?|\b(?:LangGraph|Pinecone|LiveKit|Deepgram|Murf Falcon|Supabase Realtime|row-level security|state machine|deterministic mock|fallback|checkpoints?|validated|confirms|no database access|private reasoning)\b)/g;
/** Highlight on the raw text, then escape each piece: escaping first lets the regex match inside entities ("&#39;"). */
export const hl = (t: string) => String(t).split(HL).map((part, i) => (i % 2 ? `<mark>${esc(part)}</mark>` : esc(part))).join("");
export const factsHtml = (list: string[]) => `<ul class="facts">${list.map((f) => `<li class="fi">${factIcon(f)}<span>${hl(f)}</span></li>`).join("")}</ul>`;

export function img(p: Project, sizes: string, cls = "") {
  if (!p.image) return "";
  const b = p.image.replace(/\.jpg$/, "");
  return `<img src="/img/${b}-960.jpg" srcset="/img/${b}-480.jpg 480w, /img/${b}-960.jpg 960w, /img/${b}.jpg 1400w" sizes="${sizes}" alt="${esc(p.title)} screenshot" loading="lazy" decoding="async" class="${cls}" data-title="${esc(p.title)}" style="object-position:${esc(p.focus || "top")}">`;
}

const links = (p: Project) =>
  Object.entries(p.links || {}).map(([k, v]) => {
    // free-tier hosts sleep: say so, so a 30-second first load doesn't read as a dead demo
    const sleeps = k === "live" && /onrender\.com/.test(v);
    return `<a class="btn" href="${esc(safeUrl(v))}" target="_blank" rel="noopener"${sleeps ? ' title="Free-tier host: the first load can take about 30 seconds"' : ""}>${k === "live" ? "Live" : "Source"}${sleeps ? ' <small class="wake">wakes in ~30s</small>' : ""} <span class="arr">↗</span></a>`;
  }).join("");
// who built it, never truncated mid-list ("with Dinesh, Gowtham and Sriram"); where it was built is said elsewhere
function teamLine(team: string) {
  const [who, role] = team.split(/:\s*he\s+/);
  const short = who.replace(/,\s*(built at|on |a Claude|\d+ commits).*$/i, "").replace(/\s+at\s+.*$/i, (m) => (role ? "" : m)).trim();
  return role ? `${short} · ${role}` : short;
}
// compact cards get who built it; the full card also says who did what
const teamMeta = (p: Project, short = false) => `${p.year} · ${esc(short ? teamLine(p.team).split(" · ")[0] : teamLine(p.team))}`;

export function archBlock(p: Project) {
  if (!p.pipeline?.length) return "";
  return `<div class="arch grid-bg" data-pid="${esc(p.id)}"><div class="flow">${p.pipeline.map(([l, k], i) => `${i ? '<span class="ar"></span>' : ""}<span class="n ${esc(k)}" data-n="${esc(l)}">${esc(l)}</span>`).join("")}</div>
    ${p.fallbacks?.length ? `<div class="fb">on failure ↘ ${p.fallbacks.map((f) => `<span class="n" data-n="${esc(f)}">${esc(f)}</span>`).join("")}</div>` : ""}
    <div class="simbar"><span class="lbl">simulate</span><button class="btn" data-sim="-1" aria-pressed="false">Normal run</button>${(p.sims || []).map((x, i) => `<button class="btn danger" data-sim="${i}" aria-pressed="false">${BOLT}${esc(x.label)}</button>`).join("")}<span class="simst" aria-live="polite"></span></div></div>`;
}

/** Repo Mermaid diagrams, pre-rendered to /diagrams/<id>-<i>.svg at build time. */
/** Real SVG size from the render script, so images reserve space and keep their aspect ratio. */
export const diagramSize = (id: string, i: number): [number, number] => ((SIZES as Record<string, number[]>)[`${id}-${i}`] ?? [900, 420]) as [number, number];

export function diagramsBlock(p: Project) {
  if (!p.diagrams?.length) return "";
  return `<div class="dg"><div class="dgtabs"><span class="lbl">from repo docs</span>${p.diagrams.map((g, i) => `<button class="btn" data-dg="${i}" aria-pressed="false">${esc(g.title)}</button>`).join("")}</div>${p.diagrams
    .map((g, i) => {
      const [w, h] = diagramSize(p.id, i), src = `/diagrams/${esc(p.id)}-${i}.svg`;
      return `<div class="dgview" data-dgv="${i}"><a class="dgsvg" href="${src}" target="_blank" rel="noopener" title="Open full size"><img data-src="${src}" alt="${esc(p.title)}: ${esc(g.title)} (Mermaid diagram)" width="${w}" height="${h}"></a><p class="dgsrc">${esc(g.src)} · <a href="${src}" target="_blank" rel="noopener">open full size ↗</a></p></div>`;
    })
    .join("")}</div>`;
}

export function projectPanel(p: Project, opts: { compact?: boolean; arch?: boolean; shortlisted?: boolean; permalink?: boolean } = {}) {
  const pic = p.image ? `<div class="shot">${img(p, opts.compact ? "200px" : "(max-width:900px) 100vw, 680px")}</div>` : "";
  if (opts.compact)
    return `<article class="panel compact" data-id="${esc(p.id)}">${pic || `<div class="shot noimg" aria-hidden="true"><span>${esc(p.title)}</span><small>${esc((p.keywords ?? p.tags).slice(0, 3).join(" · "))}</small></div>`}<div class="body"><div class="ph"><h3>${esc(p.title)}</h3><small>${teamMeta(p, true)}</small></div><p class="one">${esc(p.oneLiner)}</p><div class="links"><button class="btn" data-expand="${esc(p.id)}">Open</button>${links(p)}</div></div></article>`;
  const facts = opts.arch ? p.facts : p.facts.slice(0, 3);
  return `<article class="panel" data-id="${esc(p.id)}">${opts.arch ? archBlock(p) : pic}
    <div class="body"><div class="ph${teamMeta(p).length > 48 ? " stack" : ""}"><h3>${esc(p.title)}</h3><small>${teamMeta(p)}</small></div><p class="one">${esc(p.oneLiner)}</p>
    ${factsHtml(facts)}
    <div class="chips">${p.stack.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
    <div class="links">${links(p)}${opts.permalink ? `<a class="btn" href="/work/${esc(p.id)}">Full write-up</a>` : ""}${opts.arch || !p.pipeline?.length ? "" : `<button class="btn" data-arch="${esc(p.id)}">Internals</button>`}<button class="btn sl" data-sl="${esc(p.id)}" aria-pressed="${!!opts.shortlisted}">${BOOKMARK}Shortlist</button></div></div>
    ${diagramsBlock(p)}
    <div class="src">source · ${esc(p.source)}</div></article>`;
}

export function profilePanel(pr: Profile) {
  return `<article class="panel"><div class="profile"><img src="/img/portrait-320.jpg" alt="${esc(pr.name)}" width="96" height="96">
    <div><h3>${esc(pr.name)}</h3><p class="one">${esc(pr.role)} · ${esc(pr.location)}</p>
    <div class="links"><a class="btn" href="${esc(pr.links.github)}" target="_blank" rel="noopener me">GitHub <span class="arr">↗</span></a><a class="btn" href="${esc(pr.links.linkedin)}" target="_blank" rel="noopener me">LinkedIn <span class="arr">↗</span></a></div>
    <ul class="also"><li>${esc(pr.education)}</li>${pr.also.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div></div></article>`;
}

/** One part of his profile, for a question about just that part: "has he won anything?" gets his events with the
 *  prize first, not his photo and links. Unknown focus falls back to the whole profile. */
export function profilePart(pr: Profile, focus?: string) {
  // `what` and `note` are already-escaped HTML
  const row = (when: string, what: string, note = "", hot = false) => `<li${hot ? ' class="hot"' : ""}><span class="pw">${esc(when)}</span><span>${what}${note ? `<small>${note}</small>` : ""}</span></li>`;
  const part = (title: string, rows: string) => `<article class="panel ppart"><div class="body"><div class="ph"><h3>${esc(title)}</h3><small>${esc(pr.name)}</small></div><ul class="also prows">${rows}</ul></div></article>`;
  if (focus === "events") {
    // the prize leads: it is what "has he won anything?" asks; the rest stay newest first
    const evs = [...EVENTS.filter((e) => e.kind === "won"), ...EVENTS.filter((e) => e.kind !== "won")];
    return part("Events and prizes", evs.map((e) => {
      const write = e.links?.find((l) => l.href.startsWith("/work/"));
      return row(e.when, `<b>${esc(e.title)}</b> · ${esc(e.where)}`, write ? `<a href="${esc(write.href)}">${esc(e.result)}</a>` : esc(e.result), e.kind === "won");
    }).join(""));
  }
  if (focus === "work") return part("Work", EXPERIENCE.map((x) => row(x.when, `<b>${esc(x.role)}</b> · ${esc(x.title)}`, esc(roleDetail(x)))).join(""));
  if (focus === "education") return part("Education", [row(EDUCATION.years, `<b>${esc(EDUCATION.degree)}</b> · ${esc(EDUCATION.school)}`, esc(`CGPA ${EDUCATION.cgpa}, ${EDUCATION.classAwarded}`)), ...EDUCATION.earlier.map(([s, g]) => row("", esc(s), esc(g)))].join(""));
  return profilePanel(pr);
}

/** An agent answer, made readable: two sentences to a paragraph, project names bold and clickable (they open the
 *  project), figures in bold. Every word is its own span so the answer can fade in word by word. Escapes everything. */
const TITLES = [...PROJECTS].sort((a, b) => b.title.length - a.title.length);
const TOKEN = new RegExp(`(${TITLES.map((p) => p.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})|((?:\\$|₹)?\\d[\\d,]*(?:\\.\\d+)?(?:%|k\\b|\\+)?)`, "g");
/** "mohammad-rizwan.tech/films" or "/films" in an answer becomes a link to it. */
const SITE_PATH = /(?:https?:\/\/)?(?:www\.)?mohammad-rizwan\.tech(\/[\w/-]*)?|(?<![\w/])(\/(?:films|agent|resume\.pdf|work\/[\w-]+))\b/g;
// a project's live or source URL named in an answer ("live at finboom-cyan.vercel.app") becomes the same link its panel has
const LINK_BY_HOST = new Map(PROJECTS.flatMap((p) => Object.values(p.links ?? {})).map((u) => [u.replace(/^https?:\/\//, "").replace(/\/$/, ""), u]));
const PROJECT_LINK = new RegExp([...LINK_BY_HOST.keys()].sort((a, b) => b.length - a.length).map((h) => h.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")).join("|"), "g");
export function answerHtml(text: string): string {
  const sentences = text.trim().split(/(?<=[.!?])\s+(?=[A-Z“"(])/);
  const paras: string[] = [];
  // short answers stay one paragraph; long ones break every two sentences
  for (let i = 0; i < sentences.length; i += sentences.length > 2 ? 2 : sentences.length) paras.push(sentences.slice(i, i + (sentences.length > 2 ? 2 : sentences.length)).join(" "));
  let n = 0;
  const words = (t: string) => t.split(/(\s+)/).map((w) => (/^\s+$/.test(w) || !w ? w : `<span class="w" style="animation-delay:${Math.min(n++ * 12, 500)}ms">${esc(w)}</span>`)).join("");
  const tokens = (seg: string) => {
    let out = "", last = 0;
    for (const m of seg.matchAll(TOKEN)) {
      out += words(seg.slice(last, m.index));
      const p = m[1] ? TITLES.find((x) => x.title === m[1]) : undefined;
      out += p ? `<button type="button" class="pj" tabindex="-1" data-openp="${esc(p.id)}">${words(m[0])}</button>` : `<b>${words(m[0])}</b>`;
      last = m.index! + m[0].length;
    }
    return out + words(seg.slice(last));
  };
  return paras.map((para) => {
    // a project's live or source host is one link, kept whole: no number inside it is a figure to highlight
    let out = "", last = 0;
    if (LINK_BY_HOST.size) for (const m of para.matchAll(PROJECT_LINK)) {
      out += tokens(para.slice(last, m.index)) + `<a class="pj" href="${esc(LINK_BY_HOST.get(m[0])!)}" target="_blank" rel="noopener">${words(m[0])}</a>`;
      last = m.index! + m[0].length;
    }
    const html = `<p>${out}${tokens(para.slice(last))}</p>`;
    // site links are added after escaping, on text that has no tags of its own
    return html.replace(SITE_PATH, (m, p1, p2) => { const path = p1 ?? p2 ?? "/"; return `<a class="pj" href="${esc(path)}">${m}</a>`; });
  }).join("");
}

/** Classic Work rows (Akshay-style). */
export const classicRows = (projects: Project[]) =>
  projects
    .map((p, i) => `<li><button class="prow" data-id="${esc(p.id)}" data-title="${esc(p.title)}" aria-expanded="false" aria-controls="drawer-${esc(p.id)}">
    <span class="pidx">P/${String(i + 1).padStart(2, "0")}</span><span class="ptitle">${esc(p.title)}</span>
    <span class="pstack">${esc(p.stack.slice(0, 3).join(" · "))}</span><span class="pyear">${p.year}</span><span class="parr" aria-hidden="true">↗</span></button>
    <div class="drawer" id="drawer-${esc(p.id)}">${projectPanel(p, { arch: !!p.pipeline?.length, permalink: true })}${drawerOptions(p, projects[i + 1])}</div></li>`)
    .join("");

function drawerOptions(p: Project, next?: Project) {
  const ask = p.sims?.length ? `How does ${p.title} handle failures?` : `Tell me about ${p.title}`;
  return `<div class="dopts"><span class="lbl">options</span>
    <a class="btn ask" href="/agent?q=${encodeURIComponent(ask)}">${p.sims?.length ? "Ask the agent: how does it handle failures?" : `Ask the agent about ${esc(p.title)}`} <span class="arr">↗</span></a>
    ${p.pipeline?.length ? `<a class="btn" href="/agent?q=${encodeURIComponent(`Internals of ${p.title}`)}">Internals in agent mode</a>` : ""}
    ${next ? `<button class="btn" data-next="${esc(next.id)}">Next: ${esc(next.title)} ↓</button>` : ""}</div>`;
}

/** Agent-mode project list: a collapsible accordion. */
export const indexPanel = (projects: Project[], of = projects.length) =>
  `<article class="panel">${projects.length < of ? `<p class="clcap">${projects.length} of ${of} projects</p>` : ""}<ul class="clist">${projects
    .map((p) => `<li data-id="${esc(p.id)}">
    <button class="crow" aria-expanded="false"><span class="cthumb">${p.image ? img(p, "72px") : esc(p.title.split(" ")[0])}</span>
      <span><span class="ct">${esc(p.title)}</span><span class="co">${esc(p.oneLiner)}</span></span><span class="cy">${p.year}</span>${CHEV}</button>
    <div class="cbody"><div><div class="cinner">
      <div>${p.image ? `<div class="cimg">${img(p, "(max-width:900px) 100vw, 320px")}</div>` : ""}</div>
      <div>${factsHtml(p.facts.slice(0, 3))}<div class="links">${links(p)}${p.pipeline.length ? `<button class="btn" data-arch="${esc(p.id)}">Internals</button>` : ""}<a class="btn" href="/work/${esc(p.id)}">Write-up</a></div></div>
    </div></div></div></li>`)
    .join("")}</ul></article>`;

export const harnessPanel = () => `<article class="panel harness"><div class="arch grid-bg">
    <div class="flow"><span class="n">visitor</span><span class="ar"></span><span class="n">scope filter</span><span class="ar"></span><span class="n">prompt guard</span><span class="ar"></span><span class="n">cache</span><span class="ar"></span><button class="n model" data-kill>gpt-oss-120b</button><span class="ar"></span><span class="n">grounding</span><span class="ar"></span><span class="n end">panels</span></div>
    <div class="fb">on failure ↘ <span class="n">120b · keys 2–3</span><span class="ar"></span><button class="n model" data-kill>gpt-oss-20b</button><span class="ar"></span><span class="n">nemotron 3.5 · nvidia</span><span class="ar"></span><span class="n">gemini-2.5-flash</span><span class="ar"></span><span class="n">openrouter · free</span><span class="ar"></span><span class="n router">deterministic router</span></div>
    <p class="hint">click a model to take it offline</p></div>
    <div class="body"><div class="ph"><h3>This agent</h3><small>you’re using it</small></div>
    <ul class="facts"><li>Opening tours are scripted and run in your browser: zero requests.</li><li>Repeated questions are served from cache: zero tokens.</li><li>A throttled model retries on a second key, then a smaller model, then three Nemotron models on NVIDIA’s quota, then Gemini on Google’s, then free models on OpenRouter, then a deterministic router: an answer every time.</li><li>Every sentence the model writes is checked against the facts its tools returned, by words and then by meaning (his facts sit in Neon Postgres with pgvector; a small model reads the closest ones); unsupported sentences are dropped.</li><li>Every panel is real content selected by ID; the model can’t write what you see.</li></ul></div></article>`;

/** Agent home: who Rizwan is, the agent greeting the visitor, and a two-line brief. Shared by SSR and the client. */
export function homeIntro(o: { greet: string; returning?: boolean; meta: string; role: string }) {
  const brief = `${PROFILE_BRIEF} ${o.returning ? "Pick up where you left off, or ask me anything." : "Ask me anything, or start below."}`;
  return `<div class="hwho"><img src="/img/portrait-320.jpg" alt="" width="48" height="48" class="ld"><div><b>Syed Mohammad Rizwan</b><span>AI engineer · ${esc(o.role)} · Bangalore</span></div></div>
    <h2 class="hello">${esc(o.greet)} <em>I’m Rizwan’s agent.</em></h2>
    <p class="hsub">${esc(brief)}</p>
    <p class="hmeta">${esc(o.meta)}</p>`;
}
const PROFILE_BRIEF = "He builds AI agents that don’t break.";

/** Inline resume viewer: pre-rendered page images (sharp at any zoom, same on every browser), the PDF one
 *  click away, and the extracted text for screen readers and copying. */
export function resumePanel() {
  const pages = (RESUME.sizes as number[][]).map(([w, h], i) => `<figure class="rpage"><img src="/resume/page-${i + 1}.png" srcset="/resume/page-${i + 1}.png ${w}w, /resume/page-${i + 1}@2x.png ${w * 2}w" sizes="(max-width:900px) 100vw, 680px" width="${w}" height="${h}" alt="Resume of Syed Mohammad Rizwan, page ${i + 1} of ${RESUME.pages}" decoding="async"></figure>`).join("");
  return `<article class="panel resume"><div class="rbar"><span class="rdoc">${ICON.doc}<b>resume.pdf</b><small>${RESUME.pages} page${RESUME.pages > 1 ? "s" : ""} · ${RESUME.kb} KB</small></span>
    <span class="racts"><button class="btn" data-rzoom aria-pressed="false">Zoom</button><a class="btn" href="/resume.pdf" download="Syed-Mohammad-Rizwan-Resume.pdf">Download</a><a class="btn" href="/resume.pdf" target="_blank" rel="noopener">Open <span class="arr">↗</span></a></span></div>
    <div class="rpages" tabindex="0" aria-label="Resume pages">${pages}</div>
    <details class="rtext"><summary>Text version</summary><pre>${esc(RESUME.text)}</pre></details></article>`;
}

/** The visitor's shortlist: what they picked, ready to copy into notes or share with a colleague. */
export function shortlistPanel(projects: Project[]) {
  const rows = projects.map((p) => `<li><a href="/work/${esc(p.id)}"><b>${esc(p.title)}</b></a><span>${esc(p.oneLiner)}</span></li>`).join("");
  return `<article class="panel shortlist"><div class="ph slhd"><h3>${BOOKMARK}Your shortlist</h3><small>${projects.length} project${projects.length === 1 ? "" : "s"}</small></div>
    ${projects.length ? `<ol class="sllist">${rows}</ol>` : `<p class="slempty">Nothing shortlisted yet. Use <b>Shortlist</b> on any project.</p>`}
    <div class="links slacts"><button class="btn dark" data-slcopy ${projects.length ? "" : "disabled"}>Copy as notes</button><button class="btn" data-slshare ${projects.length ? "" : "disabled"}>Share link</button><span class="slnote" role="status" aria-live="polite"></span></div></article>`;
}

/** Every way to reach him, after the visitor approves: email (Gmail compose + copy), LinkedIn, GitHub, resume. */
export function connectPanel(pr: Profile) {
  const gh = pr.links.github.replace(/^https?:\/\/(www\.)?github\.com\//, "").replace(/\/$/, "");
  const li = pr.links.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\//, "").replace(/\/$/, "");
  return `<article class="panel connect"><div class="ph"><h3>Connect with Rizwan</h3><small data-clock="label">Bangalore</small></div>
    <ul class="cn">
      <li><span class="k">${ICON.mail}Email</span><a class="v" href="https://mail.google.com/mail/?view=cm&to=${esc(pr.links.email)}" target="_blank" rel="noopener">${esc(pr.links.email)}</a><span class="cx"><button class="btn" data-copy="${esc(pr.links.email)}">Copy</button><a class="btn" href="https://mail.google.com/mail/?view=cm&to=${esc(pr.links.email)}" target="_blank" rel="noopener">Gmail <span class="arr">↗</span></a></span></li>
      ${pr.links.phone ? `<li><span class="k">${ICON.phone}Phone</span><a class="v" href="tel:${esc(pr.links.phone.replace(/\s/g, ""))}">${esc(pr.links.phone)}</a><span class="cx"><button class="btn" data-copy="${esc(pr.links.phone)}">Copy</button><a class="btn" href="tel:${esc(pr.links.phone.replace(/\s/g, ""))}">Call</a><a class="btn" href="https://wa.me/${esc(pr.links.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener">WhatsApp <span class="arr">↗</span></a></span></li>` : ""}
      <li><span class="k">${ICON.linkedin}LinkedIn</span><a class="v" href="${esc(safeUrl(pr.links.linkedin))}" target="_blank" rel="noopener me">${esc(li)}</a><span class="cx"><a class="btn" href="${esc(safeUrl(pr.links.linkedin))}" target="_blank" rel="noopener me">Open <span class="arr">↗</span></a></span></li>
      <li><span class="k">${ICON.github}GitHub</span><a class="v" href="${esc(safeUrl(pr.links.github))}" target="_blank" rel="noopener me">${esc(gh)}</a><span class="cx"><a class="btn" href="${esc(safeUrl(pr.links.github))}" target="_blank" rel="noopener me">Open <span class="arr">↗</span></a></span></li>
      <li><span class="k">${ICON.doc}Resume</span><span class="v">1 page PDF</span><span class="cx"><button class="btn" data-viewresume>View here</button><a class="btn" href="/resume.pdf" download="Syed-Mohammad-Rizwan-Resume.pdf">Download</a></span></li>
    </ul><p class="cnote" role="status" aria-live="polite"></p>
    <div class="cfwrap"><h4>Or leave a message</h4>${contactForm("agent")}</div></article>`;
}

/** A short message form that emails him (POST /api/contact). The "website" field is a spam trap people never see. */
export const contactForm = (source: "classic" | "agent") => `<form class="cform" data-contact="${source}" novalidate>
    <div class="cfrow"><label><span>Name</span><input name="name" autocomplete="name" required maxlength="120"></label>
    <label><span>Email</span><input name="email" type="email" autocomplete="email" required maxlength="200"></label></div>
    <label><span>Message</span><textarea name="message" rows="4" required minlength="5" maxlength="4000" placeholder="A role, a project, or just hello"></textarea></label>
    <label class="cftrap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
    <div class="cfacts"><button class="btn dark" type="submit">Send message</button><span class="cfnote" role="status" aria-live="polite"></span></div>
  </form>`;

/** Role fit report: each requirement with the project and fact that show it, or an honest gap. */
/** Two or three projects side by side: one row per aspect, cells straight from the write-ups. */
export function comparePanel(t: { projects: { id: string; title: string }[]; rows: { aspect: string; cells: Record<string, string> }[] }) {
  if (t.projects.length < 2) return "";
  return `<article class="panel fit compare"><div class="ph fithd"><h3>Side by side</h3><small>${t.projects.map((p) => esc(p.title)).join(" · ")}</small></div>
    <table class="cmp"><thead><tr><th></th>${t.projects.map((p) => `<th><button class="btn" data-openp="${esc(p.id)}">${esc(p.title)}</button></th>`).join("")}</tr></thead>
    <tbody>${t.rows.map((r) => `<tr><th>${esc(r.aspect)}</th>${t.projects.map((p) => `<td>${esc(r.cells[p.id] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <p class="fitnote">Every cell is read off the project's own write-up. Click a title to open it.</p></article>`;
}

export function fitPanel(rows: FitRow[]) {
  const n = rows.filter((r) => r.status === "match").length;
  const STATUS = { match: ["ok", "shown"], toolkit: ["warn", "toolkit only"], none: ["muted", "no public evidence"] } as const;
  return `<article class="panel fit"><div class="ph fithd"><h3>Role fit</h3><small>${n} of ${rows.length} requirements shown in his projects</small></div>
    <ol class="fitlist">${rows.map((r) => `<li class="${r.status}"><div class="fq"><b>${esc(r.requirement)}</b><span class="fs ${STATUS[r.status][0]}">${STATUS[r.status][1]}</span></div>
      ${r.projects.length ? r.projects.map((p) => `<div class="fe"><button class="btn" data-openp="${esc(p.id)}">${esc(p.title)}</button><span>${esc(p.evidence)}</span></div>`).join("") : `<div class="fe"><span>${r.status === "toolkit" ? "Listed in his toolkit; no public project demonstrates it yet." : "Nothing in his public write-ups covers this."}</span></div>`}</li>`).join("")}</ol>
    <p class="fitnote">Matched against his project write-ups only. Every line opens the evidence.</p></article>`;
}
