import type { Metadata } from "next";
import { Fragment } from "react";
import { ClassicIsland } from "@/components/ClassicIsland";
import { Header } from "@/components/Header";
import { ClassicIntro } from "@/components/Intro";
import { CERTS, EDUCATION, EVENTS, EXPERIENCE, EXPERIENCE_BY_ORG, MARQUEE_A, MARQUEE_B, PRINCIPLES, PROFILE, PROJECTS, projectById, roleDetail, SIDE, TOOLKIT } from "@/content/data";
import { SITE } from "@/content/site";
import { classicRows, esc, STAR, contactForm } from "@/render/html";
import { ldJson, profilePage } from "@/seo/jsonld";

export const metadata: Metadata = {
  title: { absolute: `${SITE.name} — AI Engineer in Bangalore · Work, experience, toolkit` },
  description: `${PROFILE.summary} ${PROJECTS.length} projects: multi-agent LangGraph, cited RAG, voice agents and full-stack products.`,
  alternates: { canonical: "/" },
};

const years = PROJECTS.map((p) => p.year);
const toolCount = TOOLKIT.reduce((n, [, l]) => n + l.length, 0);
const strip = (list: string[]) => `<span>${list.map((w) => `<span class="w2">${esc(w)}</span>${STAR}`).join("")}</span>`;
// decorative: every item repeats real content further down the page
const TICKER: [string, string][] = [
  ...EVENTS.filter((e) => e.kind !== "attended").map((e): [string, string] => [e.result, e.title]),
  [EXPERIENCE[0].role, EXPERIENCE[0].title],
  [`${PROJECTS.length} projects`, "agents, RAG, voice, hardware"],
];
const LOOP = ["agent turn", "private notes", "llama-3.3-70b", "llama-3.1-8b", "speech + vote"];

function Ext({ href, children, dark }: { href: string; children: React.ReactNode; dark?: boolean }) {
  return <a className={`btn${dark ? " dark" : ""}`} href={href} target="_blank" rel="noopener me">{children} <span className="arr">↗</span></a>;
}

export default function ClassicPage() {
  return (
    <div className="classic-page">
      {/* opening: his name in dot-matrix, first view of the session only */}
      <ClassicIntro />
      <Header mode="classic" />
      <div className="ticker" aria-hidden="true">
        <div className="track">{[0, 1].map((k) => <span key={k}>{TICKER.map(([a, b]) => <span key={a + b}><em>{a}</em> · {b}</span>)}</span>)}</div>
      </div>
      <main className="classic grid-bg" id="classic">
        <div className="pixels" id="pixels" aria-hidden="true" />
        <div className="cwrap">
          <section className="chero">
            <div className="hstat"><span className="dotlive" />{PROFILE.location}<span className="sepd" /><span data-clock="short">IST</span></div>
            <h1><span className="ln"><span>Syed Mohammad</span></span>{" "}<span className="ln"><span>Rizwan</span></span></h1>
            <p className="sub">AI engineer in Bangalore. I build reliable AI agents.</p>
            <div className="loopline" id="loop" aria-hidden="true">
              {LOOP.map((s, i) => <Fragment key={s}>{i > 0 && <span>→</span>}<span data-i={i}>{s}</span></Fragment>)}
            </div>
            <div className="cta">
              <a className="btn dark" href="/agent?new">Talk to my agent <span className="arr">↗</span></a>
              <Ext href="/resume.pdf">Resume</Ext>
              <Ext href={PROFILE.links.github}>GitHub</Ext>
              <Ext href={PROFILE.links.linkedin}>LinkedIn</Ext>
            </div>
            <a className="scrollcue" href="#about" aria-label="Scroll to about"><span />scroll</a>
          </section>

          <section className="csec" id="about" aria-labelledby="h-about">
            <div className="csh"><h2 id="h-about"><span className="no">01</span>About</h2><span>Bangalore · B.Tech CSE ’26</span></div>
            <div className="about">
              <img src="/img/portrait-320.jpg" alt={PROFILE.name} width={200} height={200} className="ld" />
              <div>
                <p className="lead">{PROFILE.summary.replace(/^Builds/, "I build")}</p>
                <p className="lead2">Off the clock I write poetry and build tools for myself. When an open-source app I use is missing something, I fork it and add it, and send it upstream when others need it too.</p>
                <dl className="kv">
                  {[["Based in", PROFILE.location], ["Focus", "Reliable AI agents"], ["Studied", "B.Tech CSE, NBKRIST"]].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                </dl>
              </div>
            </div>
          </section>

          <section className="csec" id="work" aria-labelledby="h-exp">
            <div className="csh"><h2 id="h-exp"><span className="no">02</span>Work</h2><span>{EXPERIENCE.length} roles · {EXPERIENCE_BY_ORG.length} organisations</span></div>
            <ul className="tl">
              {/* one block per organisation; a promotion or intern-to-full-time move shows as roles inside it */}
              {EXPERIENCE_BY_ORG.map((g) => (
                <li key={g.org} className={g.roles.every((x) => x.minor) ? "minor" : ""}>
                  <span className="when">{g.when}</span>
                  <div>
                    <h3>{g.org}</h3>
                    {g.roles.length === 1 ? <p><b className="rn">{g.roles[0].role}</b> · {roleDetail(g.roles[0])}</p> : (
                      <ol className="roles">
                        {g.roles.map((x) => <li key={x.role}><div className="rh"><b className="rn">{x.role}</b><span className="rw">{x.when}</span></div><p>{roleDetail(x)}</p></li>)}
                      </ol>
                    )}
                  </div>
                  <span className={`tag${g.now ? " now" : ""}`}>{g.now ? "current" : g.roles[0].tag}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="csec" id="projects" aria-labelledby="h-work">
            <div className="csh"><h2 id="h-work"><span className="no">03</span>Projects</h2><span>{PROJECTS.length} projects, {Math.min(...years)}–{Math.max(...years)}</span></div>
            <ul className="plist" id="cwork" dangerouslySetInnerHTML={{ __html: classicRows(PROJECTS) }} />
          </section>

          <section className="csec" id="principles" aria-labelledby="h-pr">
            <div className="csh"><h2 id="h-pr"><span className="no">04</span>How I build</h2><span>{PRINCIPLES.length} habits, each with receipts</span></div>
            <ol className="pr">
              {PRINCIPLES.map((x, i) => (
                <li key={x.title}>
                  <span className="pn">{String(i + 1).padStart(2, "0")}</span>
                  <h3>{x.title}</h3>
                  <p>{x.body}</p>
                  <div className="proof"><span>seen in</span>{x.proof.map((id) => <a key={id} href={`/work/${id}`}>{projectById(id)?.title}</a>)}</div>
                </li>
              ))}
            </ol>
          </section>

          <section className="csec" id="toolkit" aria-labelledby="h-tk">
            <div className="csh"><h2 id="h-tk"><span className="no">05</span>Toolkit</h2><span>{toolCount} skills and tools across {TOOLKIT.length} areas</span></div>
            <div className="mq big" aria-hidden="true"><div className="track" style={{ "--d": "56s" } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: strip(MARQUEE_A) + strip(MARQUEE_A) }} /></div>
            <div className="mq serif rev" aria-hidden="true"><div className="track" style={{ "--d": "64s" } as React.CSSProperties} dangerouslySetInnerHTML={{ __html: strip(MARQUEE_B) + strip(MARQUEE_B) }} /></div>
            <div className="tk">
              {TOOLKIT.map(([h, l]) => <div key={h}><h3>{h}</h3><ul>{l.map((x) => {
                return <li key={x}><span>{x}</span></li>;
              })}</ul></div>)}
            </div>
          </section>

          <section className="csec" id="events" aria-labelledby="h-ev">
            <div className="csh"><h2 id="h-ev"><span className="no">06</span>Hackathons &amp; events</h2><span>{EVENTS.length} events · {EVENTS.filter((e) => e.kind === "won").length} prize</span></div>
            <ul className="ev">
              {EVENTS.map((e) => (
                <li key={e.title} className={e.kind}>
                  <span className="when">{e.when}</span>
                  <div>
                    <h3>{e.title}<small>{e.where}</small></h3>
                    <p>{e.body}</p>
                    {e.links && <div className="elinks">{e.links.map((l) => l.href.startsWith("/") ? <a key={l.label} href={l.href}>{l.label}</a> : <a key={l.label} href={l.href} target="_blank" rel="noopener">{l.label} <span className="arr">↗</span></a>)}</div>}
                  </div>
                  <span className={`res ${e.kind}`}>{e.kind === "won" && <span dangerouslySetInnerHTML={{ __html: STAR }} />}{e.result}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="csec" id="other" aria-labelledby="h-side">
            <div className="csh"><h2 id="h-side"><span className="no">07</span>Side builds &amp; open source</h2><span>builds what he needs · forks what he uses · upstreams what others need</span></div>
            <ul className="side">
              {SIDE.map((x) => {
                const inner = (
                  <>
                    <span className="sy">{x.year || "ongoing"}</span>
                    <span className="st"><b>{x.title}</b>{x.kind && <span className="tag">{x.kind}</span>}</span>
                    <span className="sb">{x.body}{x.stack.length > 0 && <small>{x.stack.join(" · ")}</small>}</span>
                    {x.href ? <span className="arr" aria-hidden="true">↗</span> : <span />}
                  </>
                );
                return <li key={x.title}>{x.href ? <a className="srow" href={x.href} {...(x.href.startsWith("/") ? {} : { target: "_blank", rel: "noopener" })}>{inner}</a> : <div className="srow">{inner}</div>}</li>;
              })}
            </ul>
          </section>

          <section className="csec" id="education" aria-labelledby="h-edu">
            <div className="csh"><h2 id="h-edu"><span className="no">08</span>Education &amp; certifications</h2><span>2020 – 2026</span></div>
            <div className="edu">
              <div className="deg">
                <h3>{EDUCATION.degree}</h3>
                <p>{EDUCATION.school} · {EDUCATION.years}</p>
                <div className="grade"><div><b>{EDUCATION.cgpa}</b><span>CGPA</span></div><div><b>Distinction</b><span>First Class</span></div></div>
                <div className="sub2">{EDUCATION.earlier.map(([a, b]) => <div key={a}><span>{a}</span><span>{b}</span></div>)}</div>
              </div>
              <ul className="certs">{CERTS.map(([c, y]) => <li key={c}>{c}<span>{y}</span></li>)}</ul>
            </div>
          </section>

          <section className="csec ccontact" id="contact" aria-labelledby="h-contact">
            <div className="csh"><h2 id="h-contact"><span className="no">09</span>Contact</h2><span data-clock="label" /></div>
            {/* opens a Gmail compose (works without a mail app) and copies the address, saying so */}
            <p className="cbig"><a href={`https://mail.google.com/mail/?view=cm&to=${PROFILE.links.email}`} target="_blank" rel="noopener" data-copy={PROFILE.links.email}>{PROFILE.links.email.split("@")[0]}<wbr />@{PROFILE.links.email.split("@")[1]}</a><span className="copied" role="status" aria-live="polite" /></p>
            <div className="cfwrap" dangerouslySetInnerHTML={{ __html: `<h4>Or leave a message</h4>${contactForm("classic")}` }} />
            <div className="cta" style={{ marginTop: "var(--s6)" }}>
              <a className="btn dark" href="/agent?new">Or ask my agent <span className="arr">↗</span></a>
              {PROFILE.links.phone && <Ext href={`https://wa.me/${PROFILE.links.phone.replace(/\D/g, "")}`}>WhatsApp</Ext>}
              <Ext href={PROFILE.links.github}>GitHub</Ext>
              <Ext href={PROFILE.links.linkedin}>LinkedIn</Ext>
              <Ext href="/resume.pdf">Resume</Ext>
            </div>
            <p className="fine">{PROFILE.name} · AI engineer · {PROFILE.location} · mohammad-rizwan.tech</p>
          </section>
        </div>
      </main>
      <div id="peek" aria-hidden="true"><div className="badge">VIEW</div><div className="card" id="peekCard" /></div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(profilePage("/")) }} />
      <ClassicIsland />
    </div>
  );
}
