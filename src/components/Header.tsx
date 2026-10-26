import { MODEL_IDS } from "@/agent/models";

// [id, label, icon path]: line icons drawn on a 16px grid, stroked in the link's colour
const SECTIONS: [string, string, string][] = [
  ["work", "Work", "M2.5 5.5h11v8h-11zM5.5 5.5v-2h5v2M2.5 9h11"],
  ["projects", "Projects", "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z"],
  ["principles", "How I build", "M3 3h3.5v3.5h-3.5zM9.5 9.5h3.5v3.5h-3.5zM6.5 4.75h3.25v4.75"],
  ["events", "Events", "M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3"],
  ["contact", "Contact", "M2.5 3.5h11v9h-11zM2.5 4l5.5 4.5 5.5-4.5"],
];

// Plain <a> on purpose: switching modes is a full page load, so the agent's hand-managed DOM never meets React's reconciler.
export function Header({ mode }: { mode: "agent" | "classic" | "work" }) {
  return (
    <header className="site-header">
      <a className="who" href="/">Syed Mohammad Rizwan</a>
      {mode !== "agent" && (
        <nav className="secnav" aria-label="Sections">
          {SECTIONS.map(([id, label, d]) => <a key={id} href={`${mode === "classic" ? "" : "/"}#${id}`} data-sec={id}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>{label}</a>)}
        </nav>
      )}
      <div className="rt">
        <span className="clock" data-clock="full">BLR</span>
        {mode === "agent" && (
          // shown only while the trace pane is closed on desktop: the way back to it from anywhere, home included
          <button className="iconbtn trhead" id="trhead" type="button" aria-label="Show trace" title="Show trace">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h2M2.5 8h2M2.5 12h2M6.5 4h7M6.5 8h7M6.5 12h5" /></svg>
          </button>
        )}
        {mode === "agent" && (
          <button className="iconbtn" id="newbtn" type="button" aria-label="New session" title="New session">
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 2.5h11v11h-11zM8 5v6M5 8h6" /></svg>
          </button>
        )}
        {mode === "agent" && (
          <button className="pill" id="pill" type="button" aria-label="Model status. Click to take the model offline">
            <span className="d" />
            <span className="m">{MODEL_IDS[0].replace("openai/", "")}</span>
          </button>
        )}
        <nav className="seg" aria-label="Mode">
          <a href="/" aria-current={mode === "classic" ? "page" : undefined}>Classic</a>
          <a href="/agent" aria-current={mode === "agent" ? "page" : undefined}>Agent</a>
        </nav>
      </div>
    </header>
  );
}
