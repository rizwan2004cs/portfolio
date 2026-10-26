import type { Metadata } from "next";
import { AgentIsland } from "@/components/AgentIsland";
import { Intro } from "@/components/Intro";
import { Header } from "@/components/Header";
import { EXPERIENCE, PROJECTS } from "@/content/data";
import { homeIntro } from "@/render/html";
import { ldJson, profilePage } from "@/seo/jsonld";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Ask his AI agent",
  description: `Ask ${SITE.name}'s AI agent about his projects, experience and fit for a role. It shows its work: guard, model fallbacks and a grounding check on every answer.`,
  alternates: { canonical: "/agent" },
};

// Server-rendered shell: crawlable home content plus every element the client controller binds to.
export default function AgentPage() {
  return (
    <>
    {/* the trace pane is open by default; a visitor who closed it gets it closed again, before first paint */}
    <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("rz_trace")==="closed")document.documentElement.classList.add("trace-closed")}catch(e){}` }} />
    {/* the agent's boot intro: first agent view of the session only */}
    <Intro />
    <div className="agent-shell" id="shell">
      <Header mode="agent" />
      <main className="app">
        <section className="stage" aria-label="Agent">
          <h1 className="sr">Syed Mohammad Rizwan, AI engineer in Bangalore: talk to his portfolio agent</h1>
          <div className="feed grid-bg" id="feed" role="log" aria-live="polite" aria-relevant="additions">
            <div className="offline">model offline · deterministic router answering</div>
            <div className="col home" id="col">
              <div className="homeb" id="home">
                <div dangerouslySetInnerHTML={{ __html: homeIntro({ greet: "Hello.", role: `${EXPERIENCE[0].role}, ${EXPERIENCE[0].title}`, meta: "Bangalore" }) }} />
                <div className="hslot" id="hslot">
                  <form id="form" aria-busy="false" action="/">
                    <button type="button" className="plus" id="plus" aria-label="Tools" aria-expanded="false" aria-haspopup="menu">
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" /></svg>
                    </button>
                    <div className="menu" id="menu" role="menu" />
                    <input id="inp" name="q" placeholder="Ask about Rizwan’s work…" autoComplete="off" aria-label="Message the agent" maxLength={2000} />
                    <button type="submit">Send</button>
                  </form>
                  {/* said before the first message is sent: what is stored, and what is not */}
                  <p className="lognote">Questions and answers are stored to improve the agent. No IP addresses.</p>
                </div>
                <nav className="home-ssr-links" aria-label="Projects">
                  {PROJECTS.map((p) => <a key={p.id} href={`/work/${p.id}`}>{p.title}</a>)}
                  <a href="/">Classic site</a>
                  <a href="/resume.pdf">Resume (PDF)</a>
                </nav>
              </div>
            </div>
          </div>
          <div className="composer hidden">
            <div className="row2">
              <div className="sugg" id="sugg" />
              <button type="button" className="btn sltray" id="sltray" hidden>Shortlist</button>
              <button type="button" className="btn trbtn" id="trbtn">Trace</button>
              <button type="button" className="breaker" id="kill" role="switch" aria-checked="false"><span className="led" /><span id="killLbl">Kill the model</span></button>
            </div>
          </div>
        </section>
        <aside className="trace" aria-label="Trace">
          <div className="hd">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected="true" data-tab="trace">Trace</button>
              <button type="button" role="tab" aria-selected="false" data-tab="state">State</button>
              <button type="button" role="tab" aria-selected="false" data-tab="events">Events</button>
            </div>
            {/* not a tab: the protocol these events stream over, linked so it reads as a link */}
            <a className="aglink" href="https://docs.ag-ui.com/introduction" target="_blank" rel="noopener" title="Every event in this pane streams over the AG-UI protocol">AG-UI <span aria-hidden="true">↗</span></a>
            <button type="button" className="iconbtn trclose" id="trclose" aria-label="Close trace"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg></button>
          </div>
          <div className="tabpane on" id="tp-trace"><ol id="trace" aria-live="off"><li className="empty">Each request’s steps appear here.</li></ol></div>
          <div className="tabpane" id="tp-state"><div className="state" id="state" /></div>
          <div className="tabpane" id="tp-events"><ol className="events" id="events" /></div>
        </aside>
      </main>
      <noscript><p className="hsub" style={{ padding: 24 }}>The agent needs JavaScript. The <a href="/">classic site</a> has everything without it.</p></noscript>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldJson(profilePage("/agent")) }} />
      <AgentIsland />
    </div>
    </>
  );
}
