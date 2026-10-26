// DOM behaviour shared by the agent and the classic page.
import { projectById } from "@/content/data";
import type { Sim } from "@/content/types";
import { esc } from "@/render/html";

const mq = typeof window !== "undefined" ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export let reduce = mq?.matches ?? false;
mq?.addEventListener("change", (e) => (reduce = e.matches));
export const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reduce ? 0 : ms));
export const fmt = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);

let imagesInstalled = false;
/** Reveal images on load however they were inserted; swap failures for a typographic fallback. */
export function installImageHandling() {
  if (imagesInstalled) return;
  imagesInstalled = true;
  const mark = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0 && i.classList.add("ld");
  document.addEventListener("load", (e) => { const t = e.target as HTMLElement; if (t?.tagName === "IMG") t.classList.add("ld"); }, true);
  document.addEventListener("error", (e) => {
    const t = e.target as HTMLImageElement;
    if (t?.tagName !== "IMG" || t.dataset.failed) return;
    // one retry first: a dropped connection or a server restart shouldn't cost the visitor the picture
    if (!t.dataset.retried) {
      t.dataset.retried = "1";
      const { src, srcset } = t;
      setTimeout(() => { t.removeAttribute("srcset"); t.src = ""; if (srcset) t.srcset = srcset; t.src = src; }, 1500);
      return;
    }
    t.dataset.failed = "1";
    const title = t.dataset.title || "", small = t.closest(".cthumb");
    // small thumbnails get one word, the way projects without a screenshot already do
    t.outerHTML = `<span class="imgfail">${esc(small ? title.split(" ")[0] : title)}</span>`;
  }, true);
  document.querySelectorAll("img").forEach(mark);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => (n as Element).querySelectorAll?.("img").forEach((i) => mark(i as HTMLImageElement))))).observe(document.body, { childList: true, subtree: true });
}

type Runs = HTMLElement & { _run?: number };
/** Replay a request through a project's real pipeline; failures drop to the fallback row.
 *  Starting a new replay supersedes one in progress, so a click is never swallowed by the opening demo. */
export async function runSim(arch: Runs, sim: Sim | null, onDone?: (label: string, outcome: string) => void) {
  const run = (arch._run = (arch._run ?? 0) + 1);
  const stale = () => arch._run !== run;
  const nodes = [...arch.querySelectorAll<HTMLElement>(".flow .n")];
  const by = (l: string) => arch.querySelector<HTMLElement>(`.n[data-n="${CSS.escape(l)}"]`);
  const st = arch.querySelector<HTMLElement>(".simst")!;
  st.className = "simst"; st.textContent = "running…";
  arch.querySelectorAll(".n").forEach((n) => n.classList.remove("s-fail", "s-via", "s-ok", "s-hit"));
  arch.querySelector(".runner")?.remove();
  const dot = document.createElement("span"); dot.className = "runner"; arch.appendChild(dot);
  const pos = (el: HTMLElement): [number, number] => { const b = arch.getBoundingClientRect(), r = el.getBoundingClientRect(); return [r.left - b.left + r.width / 2 - 3 + arch.scrollLeft, r.top - b.top + r.height / 2 - 3]; };
  let at = pos(nodes[0]);
  const hop = async (el: HTMLElement, color = "var(--ink)") => {
    const to = pos(el);
    if (!reduce) await dot.animate([{ transform: `translate(${at[0]}px,${at[1]}px)`, background: color }, { transform: `translate(${to[0]}px,${to[1]}px)`, background: color }], { duration: 260, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" }).finished.catch(() => {});
    else dot.style.transform = `translate(${to[0]}px,${to[1]}px)`;
    at = to;
  };
  // the packet has delivered: fade it out so it never sits parked on top of the last node's label
  const land = () => { if (reduce) return dot.remove(); void dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, delay: 300, fill: "forwards" }).finished.then(() => dot.remove(), () => {}); };
  const shake = (el: HTMLElement) => !reduce && el.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "none" }], { duration: 220 });
  dot.style.transform = `translate(${at[0]}px,${at[1]}px)`;
  const failAt = sim ? nodes.findIndex((n) => n.dataset.n === sim.fails[0]) : -1;
  const upto = failAt >= 0 ? failAt : nodes.length - 1;
  for (let i = 0; i <= upto; i++) { await hop(nodes[i]); if (stale()) return; nodes[i].classList.add("s-hit"); await wait(60); }
  if (stale()) return;
  if (!sim || failAt < 0) { nodes.at(-1)!.classList.add("s-ok"); st.className = "simst ok"; st.textContent = "200 · answered"; land(); onDone?.("normal run", "answered"); return; }
  nodes[failAt].classList.add("s-fail"); shake(nodes[failAt]); await wait(380);
  for (const f of sim.fails.slice(1)) { const el = by(f); if (!el) continue; await hop(el, "var(--warn)"); if (stale()) return; el.classList.add("s-fail"); shake(el); await wait(320); }
  const via = by(sim.via);
  if (via) { await hop(via, "var(--warn)"); if (stale()) return; via.classList.add("s-via"); await wait(260); }
  if (stale()) return;
  if (sim.reach) {
    for (let i = failAt + 1; i < nodes.length; i++) { await hop(nodes[i], "var(--warn)"); if (stale()) return; nodes[i].classList.add("s-hit"); }
    nodes.at(-1)!.classList.add("s-ok"); st.className = "simst ok"; st.textContent = `recovered via ${sim.via}`;
  } else { st.className = "simst warn"; st.textContent = `failed safely · ${sim.via}`; }
  land();
  onDone?.(sim.label, sim.reach ? "recovered" : "failed safely");
}

/** Wire simulate buttons and repo-diagram tabs inside `root`. */
export function wireArch(root: ParentNode, onSim?: (label: string, outcome: string) => void) {
  root.querySelectorAll<HTMLButtonElement>("[data-sim]").forEach((b) => (b.onclick = () => {
    const arch = b.closest<HTMLElement>(".arch")!, p = projectById(arch.dataset.pid!), i = Number(b.dataset.sim);
    arch.querySelectorAll("[data-sim]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    void runSim(arch, i < 0 || !p?.sims ? null : p.sims[i], onSim);
  }));
  root.querySelectorAll<HTMLButtonElement>("[data-dg]").forEach((b) => (b.onclick = () => {
    const panel = b.closest<HTMLElement>(".dg")!, i = b.dataset.dg!;
    const v = panel.querySelector<HTMLElement>(`[data-dgv="${i}"]`)!, on = !v.classList.contains("on");
    panel.querySelectorAll(".dgview").forEach((x) => x.classList.remove("on"));
    panel.querySelectorAll("[data-dg]").forEach((x) => x.setAttribute("aria-pressed", String(x === b && on)));
    if (!on) return;
    v.classList.add("on");
    const im = v.querySelector<HTMLImageElement>("img[data-src]");
    if (im && !im.src) im.src = im.dataset.src!;
  }));
}

/** Live Bangalore time into every element with [data-clock] (format via data-clock="short|full|label"). */
/** Fill every [data-clock] now; call after inserting new markup so it doesn't wait for the next minute. */
export function paintClocks() {
  const d = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000), t = d.toTimeString().slice(0, 5);
  document.querySelectorAll<HTMLElement>("[data-clock]").forEach((el) => {
    const f = el.dataset.clock;
    el.textContent = f === "label" ? `Bangalore · ${t} IST` : f === "short" ? `${t} IST` : `BLR ${t} IST`;
    el.dataset.on = "1";
  });
}
export function startClock() {
  const tick = paintClocks;
  tick();
  const id = setTimeout(() => { tick(); setInterval(tick, 60000); }, (60 - new Date().getSeconds()) * 1000);
  return () => clearTimeout(id);
}

/** The shortlist lives for the tab and is shared by both modes: a project shortlisted in Classic is in the agent's tray. */
const SL_KEY = "rz_shortlist";
/** null when this tab has never shortlisted anything (as opposed to an emptied list). */
export function readShortlist(): string[] | null {
  try { const raw = sessionStorage.getItem(SL_KEY); if (raw === null) return null; const v: unknown = JSON.parse(raw); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return null; }
}
export function writeShortlist(ids: string[] | null) {
  try { if (ids) sessionStorage.setItem(SL_KEY, JSON.stringify(ids)); else sessionStorage.removeItem(SL_KEY); } catch { /* storage off */ }
}
