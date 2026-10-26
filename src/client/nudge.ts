// A one-time nudge on Classic: moments after the page opens, a hand-drawn marker arrow sweeps up to the header's
// Agent button with a handwritten note. Shown once ever, never to someone who has used the agent,
// and it gets out of the way the moment they dismiss it, try the agent, or scroll on.
import { reduce } from "./shared";

const KEY = "rz_nudge";
const seen = (k: string, s: Storage) => { try { return s.getItem(k) !== null; } catch { return true; } };

// the opening intro (first view of the session) must finish before the arrow starts drawing
const introLeft = () => (document.documentElement.classList.contains("no-intro") || !document.querySelector(".intro") ? 0 : Math.max(0, 1900 - performance.now()));

export function startNudge(sig: { signal: AbortSignal }): () => void {
  const hero = document.querySelector<HTMLElement>(".chero h1"), target = document.querySelector<HTMLElement>('.seg a[href="/agent"]');
  // once ever; not for anyone who has used the agent (this tab or before), nor someone arriving from it
  if (!hero || !target || seen(KEY, localStorage) || seen("rz_seen", localStorage) || seen("rz_session", sessionStorage) || /\/agent/.test(document.referrer)) return () => {};
  let timer = 0, el: HTMLElement | null = null;
  const io = new IntersectionObserver(([e]) => {
    clearTimeout(timer);
    // the name has to stay in view: someone skimming past never sees it
    if (e.isIntersecting && e.intersectionRatio > 0.6 && scrollY < innerHeight * 0.4) timer = window.setTimeout(show, 1500 + introLeft());
  }, { threshold: [0, 0.6, 1] });
  io.observe(hero);

  function show() {
    io.disconnect();
    try { localStorage.setItem(KEY, "1"); } catch { /* storage off */ }
    const t = target!.getBoundingClientRect(), narrow = innerWidth < 640;
    // The reference arrow, traced with its tip at the origin and its head pointing along +x: it rises from the
    // bottom-left, bends over, and lands heading right, the same shape here: scaled, tilted a touch upward,
    // with its tip just left of the Agent button.
    const k = narrow ? 0.46 : 0.62, turn = (-10 * Math.PI) / 180, cos = Math.cos(turn), sin = Math.sin(turn);
    // the head arrives from the left, aimed at the middle of the button's side
    const tipX = t.left - 8, tipY = t.top + t.height * 0.55;
    const at = (x: number, y: number): [number, number] => [tipX + (x * cos - y * sin) * k, tipY + (x * sin + y * cos) * k];
    const P = (pts: [number, number][]) => pts.map(([x, y]) => at(x, y).map((v) => v.toFixed(1)).join(" "));
    const [s0, c1, c2, e] = P([[-310, 215], [-312, 70], [-190, -2], [0, 0]]);
    const [s0b, c1b, c2b, eb] = P([[-305, 212], [-304, 76], [-186, 5], [-6, 4]]);
    const arc = `M ${s0} C ${c1}, ${c2}, ${e}`;
    // the second, offset "dry brush" pass gives the stroke its two-tone marker look
    const streak = `M ${s0b} C ${c1b}, ${c2b}, ${eb}`;
    // the head: two barbs swept back from the tip, as long and open as the reference's
    // a slightly flatter head than the reference, so the upper barb never leaves the top of the screen
    const [b1, tip, b2] = P([[-82, -46], [5, 0], [-78, 44]]);
    const head = `M ${b1} L ${tip} L ${b2}`;
    const [sx, sy] = at(-310, 215);
    el = document.createElement("div");
    el.className = "nudge" + (reduce ? " still" : "");
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "You can ask my agent");
    // a frosted layer over the page; the Agent button shows through it as a spotlight, the arrow and note sit on top
    el.innerHTML = `<div class="dim" data-x></div>
      <a class="spot" href="/agent?new" style="left:${t.left}px;top:${t.top}px;width:${t.width}px;height:${t.height}px">Agent</a>
      <svg aria-hidden="true" width="${innerWidth}" height="${innerHeight}">
        <defs><filter id="nudge-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="2.6"/></filter></defs>
        <g filter="url(#nudge-rough)"><path class="arc" d="${arc}" pathLength="1"/><path class="streak" d="${streak}" pathLength="1"/><path class="head" d="${head}"/></g>
      </svg>
      <div class="note" style="left:${Math.max(16, Math.min(sx - (narrow ? 90 : 160), innerWidth - (narrow ? 300 : 380)))}px;top:${sy + 14}px">
        <p class="hand">psst, you can ask my agent</p>
        <p class="sub">It answers from my work and shows every step it takes.</p>
        <div class="acts"><a class="btn dark" href="/agent?new">Ask the agent <span class="arr">↗</span></a><button class="btn" type="button" data-x>Not now</button></div>
      </div>`;
    document.body.appendChild(el);
    // the page underneath can't scroll or be clicked while this is open
    document.documentElement.classList.add("nudging");
    el.querySelectorAll<HTMLElement>("[data-x]").forEach((x) => (x.onclick = hide));
    el.querySelector<HTMLAnchorElement>(".note .btn.dark")!.focus({ preventScroll: true });
    addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); }, sig);
    addEventListener("resize", hide, sig);
  }
  function hide() {
    if (!el) return;
    const gone = el; el = null;
    document.documentElement.classList.remove("nudging");
    gone.classList.add("out");
    setTimeout(() => gone.remove(), reduce ? 0 : 220);
  }
  return () => { clearTimeout(timer); io.disconnect(); el?.remove(); document.documentElement.classList.remove("nudging"); };
}
