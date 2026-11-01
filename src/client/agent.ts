// Agent-mode controller: renders the conversation, consumes the AG-UI event stream from /api/agent,
// and runs the zero-request paths (scripted tours, known intents) locally.
import { EXPERIENCE, PROFILE, PROJECTS } from "@/content/data";
import type { Project } from "@/content/types";
import { fitRows } from "@/agent/fit";
import { compareTable } from "@/agent/compare";
import type { Exchange } from "@/agent/types";
import { trimHistory } from "./history";
import { mountVoice } from "./voice";
import { wireContactForms } from "./contact";
import { answerHtml, CHEV, comparePanel, connectPanel, esc, fitPanel, harnessPanel, homeIntro, ICON, indexPanel, profilePart, projectPanel, resumePanel, shortlistPanel } from "@/render/html";
import { fine, fmt, installImageHandling, paintClocks, readShortlist, reduce, runSim, startClock, wait, wireArch, writeShortlist } from "./shared";

type Meta = { mode: string; model?: string; ms?: number; tools?: number; fallback?: boolean };
type Ev =
  | { type: "text"; text: string } | { type: "tool"; name: string; args: Record<string, unknown> }
  | { type: "panel"; panel: { kind: string; id?: string } } | { type: "approval"; action: "resume" | "contact" }
  | { type: "suggest"; options: string[] } | { type: "frontend"; name: string; args: { mode: string } }
  | { type: "trace"; step: string; detail: string; level: string } | { type: "done"; meta: Meta }
  | { type: "state"; state: Record<string, unknown> };

const P = new Map(PROJECTS.map((p) => [p.id, p]));
/** The projects a list panel shows: the ids in its key ("pack,ccr"), or all of them. */
const listed = (ids?: string) => { const want = (ids ?? "").split(",").filter((x) => P.has(x)); return want.length ? PROJECTS.filter((p) => want.includes(p.id)) : PROJECTS; };
const q = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s)!;
const store = (k: string, v?: string) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { /* storage off */ } return null; };
const SESSION_KEY = "rz_session";
const ROLE = `${EXPERIENCE[0].role}, ${EXPERIENCE[0].title}`;

export function mountAgent(shell: HTMLElement): () => void {
  if (shell.dataset.mounted) return () => {};
  shell.dataset.mounted = "1";
  installImageHandling();
  const stopClock = startClock();

  const col = q("#col"), feed = q("#feed"), sugg = q("#sugg"), traceEl = q("#trace"), form = q<HTMLFormElement>("#form"), inp = q<HTMLInputElement>("#inp");
  // the mic shows only where the browser can listen; a spoken question gets its reply read back once
  const voice = mountVoice(document.querySelector<HTMLButtonElement>("#mic"), inp, (t) => void send(t));
  const RETURNING = store("rz_seen");
  let turns: string[] = [], said: string[] = [], convo: Exchange[] = [], turnSaid: string[] = [], turnShowed: string[] = [], focusId = "", shown = new Set<string>(), busy = false, down = false, turnNo = 0, tStart = 0, lastAgentRun = false;
  let target: HTMLElement | null = null, queued: string | null = null, focusTurn = -1, lastChips: string[] = [];
  let PREV: { html: string; turns: string[]; said?: string[]; convo?: Exchange[]; focusId?: string; shown: string[]; down?: boolean; shortlist?: string[]; trace?: string; events?: string; state?: Record<string, unknown>; turnNo?: number } | null = null;

  /* ---------- small helpers ---------- */
  // set when the visitor answers a choice card: whatever the agent adds next is brought into view, so the answer
  // never lands below the fold (on a phone the card fills the screen)
  let reveal = false;
  function add(html: string, into?: Element): HTMLElement {
    const d = document.createElement("div"); d.innerHTML = html.trim();
    const el = d.firstElementChild as HTMLElement; (into || target || col).appendChild(el);
    if (reveal && !into) { reveal = false; requestAnimationFrame(() => el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })); }
    return el;
  }
  // a project named in an answer opens that project
  const wireAnswer = (el: ParentNode) => el.querySelectorAll<HTMLButtonElement>(".msg .pj[data-openp]").forEach((b) => (b.onclick = () => void send(`Open ${P.get(b.dataset.openp!)!.title}`)));
  async function say(text: string, opts: { big?: boolean } = {}) {
    const words = text.split(/(\s+)/), slot = target?.querySelector(".ttext") ?? undefined;
    // the plain sentence for screen readers; the formatted one (paragraphs, project links, figures) for the eye
    const shown = opts.big ? words.map((w, i) => (/\s+/.test(w) ? w : `<span class="w" style="animation-delay:${Math.min(i * 12, 500)}ms">${esc(w)}</span>`)).join("") : answerHtml(text);
    const el = add(`<div class="msg${lastAgentRun ? " cont" : ""}"><span class="mark${down ? " degraded" : ""}" aria-hidden="true"><i></i></span><div class="text${opts.big ? " big" : ""}"><span class="sr">${esc(text)}</span><span class="tv" aria-hidden="true">${shown}</span></div></div>`, slot);
    wireAnswer(el);
    turnSaid.push(text);
    lastAgentRun = true;
    await wait(Math.min(words.length * 12, 500) + 80);
    return el;
  }
  /** Next steps that move the conversation forward: the turn's own hints first, then what fits the project in
   *  focus, then things not seen yet (weighted to the visitor's roles). Never something already asked or on screen. */
  function smartChips(hint: string[]): string[] {
    const norm = (t: string) => t.toLowerCase().replace(/[’']/g, "'").replace(/[?.!\s]+$/g, "").trim();
    const asked = new Set(said.map(norm));
    const unseen = PROJECTS.filter((p) => !shown.has(p.id));
    const roles = Array.isArray(S.focus) ? (S.focus as string[]) : [];
    const ROLE_TAGS: Record<string, string[]> = { ai: ["agents", "ai", "voice", "multi-agent", "rag"], fullstack: ["full-stack", "mobile", "realtime"], backend: ["full-stack", "team", "forecasting", "crawler"] };
    const affinity = (p: Project) => roles.reduce((n, r) => n + p.tags.filter((t) => ROLE_TAGS[r]?.includes(t)).length, 0);
    // project follow-ups only while that project is what the last turn was about; after a contact or
    // shortlist turn they would just repeat the same three chips
    const focus = focusTurn === turnNo ? P.get(focusId) : undefined;
    const related = focus ? unseen.map((p) => ({ p, n: p.tags.filter((t) => focus.tags.includes(t)).length + (p.keywords ?? []).filter((k) => (focus.keywords ?? []).includes(k)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0]?.p : undefined;
    const fresh = [...unseen].sort((a, b) => affinity(b) - affinity(a))[0];
    const GENERIC = new Set(["Everything he’s built", "How does this site work?", "Get resume", "Contact Rizwan"]);
    const pool = [
      down ? "Restore the model" : "", // while offline, the way back always shows
      ...hint.filter((h) => !GENERIC.has(h)),
      ...(focus ? [focus.sims?.length ? `How does ${focus.title} handle failures?` : "", focus.pipeline.length && !shown.has("arch:" + focus.id) ? `Internals of ${focus.title}` : "", related ? `Open ${related.title}` : ""] : []),
      fresh ? `Open ${fresh.title}` : "",
      !shown.has("profile") && !shown.has("events") ? "Has he won anything?" : "",
      said.length >= 2 && !asked.has(norm("What’s his superpower?")) ? "What’s his superpower?" : "",
      roles.includes("ai") || roles.includes("backend") || roles.includes("fullstack") || (S.visitor as string) === "hire" ? "What should I ask him in an interview?" : "",
      said.length >= 3 && !down && !q("#kill").classList.contains("used") ? "Take the model offline" : "", // only to visitors who haven't tried it

      "Everything he’s built", "How does this site work?", "Get resume", "Contact Rizwan",
    ];
    const useful = (c: string) => {
      if (!c || asked.has(norm(c))) return false;
      if (c === "Everything he’s built") return !shown.has("index");
      if (c === "How does this site work?") return !shown.has("harness");
      // not while the same approval is already waiting on screen
      if (c === "Get resume") return !shown.has("done:resume") && !col.querySelector('.approval[data-action="resume"]:not(.resolved)');
      if (c === "Contact Rizwan") return !shown.has("done:contact") && !col.querySelector('.approval[data-action="contact"]:not(.resolved)');
      const open = c.match(/^Open (.+)$/i)?.[1], intl = c.match(/^Internals of (.+)$/i)?.[1];
      if (open) { const p = byTitle(open); return !p || !shown.has(p.id); }
      if (intl) { const p = byTitle(intl); return !p || !shown.has("arch:" + p.id); }
      return true;
    };
    const seen = new Set<string>(), before = new Set(lastChips.map(norm));
    const ok = pool.filter((c) => useful(c) && !seen.has(norm(c)) && seen.add(norm(c)));
    // the same row twice in a row reads as a stuck agent: what was offered last time goes to the back
    const pinned = ok.filter((c) => c === "Restore the model"), rest = ok.filter((c) => c !== "Restore the model");
    const picked = [...pinned, ...rest.filter((c) => !before.has(norm(c))), ...rest.filter((c) => before.has(norm(c)))].slice(0, 3);
    lastChips = picked;
    return picked;
  }
  function chips(hint: string[]) {
    const opts = smartChips(hint);
    sugg.innerHTML = "";
    opts.slice(0, 3).forEach((o, i) => { const b = document.createElement("button"); b.innerHTML = `${fine() ? `<kbd>${i + 1}</kbd>` : ""}${esc(o)}`; b.style.animationDelay = i * 40 + "ms"; b.onclick = () => void send(o); sugg.appendChild(b); });
  }

  /* ---------- shared state + AG-UI event log ---------- */
  // `session` is the server's snapshot of the conversation (focus, what was shown and offered, who the visitor is):
  // it goes back with every message, so the agent remembers across turns and reloads
  const S: Record<string, unknown> = { visitor: null, focus: null, model: "online", mode: "agent", onScreen: [], shortlist: [], approvals: {}, session: null };
  function renderState(changed: string[] = []) {
    const lines = Object.entries(S).map(([k, v]) => `  <span class="k">"${k}"</span>: <span${changed.includes(k) ? ' class="flash"' : ""}>${esc(JSON.stringify(v))}</span>`);
    q("#state").innerHTML = `{\n${lines.join(",\n")}\n}`;
    if (changed.length) setTimeout(() => q("#state").querySelectorAll(".flash").forEach((e) => e.classList.remove("flash")), 900);
  }
  function setState(patch: Record<string, unknown>) {
    const changed = Object.keys(patch).filter((k) => JSON.stringify(S[k]) !== JSON.stringify(patch[k]));
    if (!changed.length) return;
    Object.assign(S, patch); renderState(changed);
    if (changed.includes("shortlist")) writeShortlist(S.shortlist as string[]);
    logEv("STATE_DELTA", changed.map((k) => `/${k}`).join(" "), "state");
  }
  function logEv(type: string, detail = "", cls = "") {
    const li = document.createElement("li"); li.className = cls; li.innerHTML = `<b>${esc(type)}</b><span>${esc(detail)}</span>`;
    const ol = q("#events"); ol.appendChild(li); if (ol.children.length > 300) ol.firstChild!.remove(); ol.parentElement!.scrollTop = ol.parentElement!.scrollHeight;
  }

  /* ---------- trace ---------- */
  // the pane scrolls, not the list: keep the newest step in view
  const followTrace = () => { const pane = traceEl.parentElement!; pane.scrollTop = pane.scrollHeight; };
  // a new turn folds the earlier ones to their heading line: the newest steps stay in view, older ones a click away
  const foldTurn = (th: HTMLElement, open: boolean) => {
    th.classList.toggle("shut", !open); th.querySelector("button")!.setAttribute("aria-expanded", String(open));
    traceEl.querySelectorAll<HTMLElement>(`li.r[data-turn="${th.dataset.turn}"]`).forEach((r) => (r.hidden = !open));
  };
  // delegated, so headings restored from a saved session toggle too
  traceEl.addEventListener("click", (e) => { const th = (e.target as HTMLElement).closest<HTMLElement>("li.th"); if (th && (e.target as HTMLElement).closest("button")) foldTurn(th, th.classList.contains("shut")); });
  function traceTurn(label: string) {
    traceEl.querySelector(".empty")?.remove();
    traceEl.querySelectorAll<HTMLElement>("li.th:not(.shut)").forEach((th) => foldTurn(th, false));
    const li = document.createElement("li"); li.className = "th"; li.dataset.turn = String(++turnNo);
    li.innerHTML = `<button type="button" aria-expanded="true">${CHEV}<span>turn ${turnNo} · “${esc(label.slice(0, 32))}”</span></button><span>…</span>`;
    traceEl.appendChild(li); followTrace(); tStart = performance.now(); return li;
  }
  function tr(level: string, step: string, detail: string) {
    const li = document.createElement("li"); li.className = "r " + (level || ""); li.dataset.turn = String(turnNo);
    // a step that lands in a folded turn (an approval answered later) opens that turn again
    const th = traceEl.querySelector<HTMLElement>(`li.th[data-turn="${turnNo}"].shut`); if (th) foldTurn(th, true);
    li.innerHTML = `<span class="d"></span><span class="k">${esc(step)}</span><span class="x">${esc(detail)}</span><span class="t">${fmt(performance.now() - tStart)}</span>`;
    traceEl.appendChild(li); followTrace();
  }

  /* ---------- panels ---------- */
  function wirePanel(el: HTMLElement) {
    el.querySelectorAll<HTMLButtonElement>("[data-expand]").forEach((b) => (b.onclick = () => { const p = P.get(b.dataset.expand!)!; const full = add(projectPanel(p, { shortlisted: (S.shortlist as string[]).includes(p.id) })); el.replaceWith(full); full.dataset.key = el.dataset.key ?? ""; wirePanel(full); }));
    el.querySelectorAll<HTMLButtonElement>("[data-arch]").forEach((b) => (b.onclick = () => void send(`Internals of ${P.get(b.dataset.arch!)!.title}`)));
    el.querySelectorAll<HTMLButtonElement>(".crow").forEach((b) => (b.onclick = () => {
      const li = b.parentElement as HTMLElement, open = !li.classList.contains("open");
      if (open) li.parentElement!.querySelectorAll("li.open").forEach((o) => { o.classList.remove("open"); o.querySelector(".crow")!.setAttribute("aria-expanded", "false"); });
      li.classList.toggle("open", open); b.setAttribute("aria-expanded", String(open));
      if (open) { shown.add(li.dataset.id!); store("rz_last", li.dataset.id!); chips(nextFor(P.get(li.dataset.id!)!)); }
    }));
    el.querySelectorAll<HTMLButtonElement>("[data-kill]").forEach((b) => (b.onclick = () => setDown(!down)));
    el.querySelectorAll<HTMLButtonElement>("[data-rzoom]").forEach((b) => (b.onclick = () => {
      const on = b.getAttribute("aria-pressed") !== "true", pages = el.querySelector<HTMLElement>(".rpages")!;
      b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Fit" : "Zoom"; pages.classList.toggle("zoomed", on);
    }));
    el.querySelectorAll<HTMLImageElement>(".rpage img").forEach((im) => (im.onclick = () => el.querySelector<HTMLButtonElement>("[data-rzoom]")?.click()));
    el.querySelectorAll<HTMLButtonElement>("[data-sl]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.sl!, list = S.shortlist as string[], on = !list.includes(id);
      setState({ shortlist: on ? [...list, id] : list.filter((x) => x !== id) });
      document.querySelectorAll(`[data-sl="${id}"]`).forEach((x) => x.setAttribute("aria-pressed", String(on)));
      syncTray();
    }));
    el.querySelectorAll<HTMLButtonElement>(".connect [data-copy], .connect[data-copy]").forEach((b) => (b.onclick = async () => {
      const note = el.querySelector<HTMLElement>(".cnote");
      try { await navigator.clipboard.writeText(b.dataset.copy!); b.textContent = "Copied"; if (note) note.textContent = `${b.dataset.copy!.includes("@") ? "Email" : "Phone number"} copied`; } catch { if (note) note.textContent = "Couldn’t reach the clipboard"; }
    }));
    if (el.classList.contains("connect")) el.querySelectorAll<HTMLButtonElement>("[data-viewresume]").forEach((b) => (b.onclick = () => { const v = showPanel("resume"); v?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" }); }));
    el.querySelectorAll<HTMLButtonElement>("[data-openp]").forEach((b) => (b.onclick = () => void send(`Open ${P.get(b.dataset.openp!)!.title}`)));
    el.querySelectorAll<HTMLButtonElement>("[data-slcopy]").forEach((b) => (b.onclick = () => void copyNote(el, shortlistNotes(), "Copied · paste into your notes")));
    el.querySelectorAll<HTMLButtonElement>("[data-slshare]").forEach((b) => (b.onclick = () => void copyNote(el, `${location.origin}/agent?shortlist=${(S.shortlist as string[]).join(",")}`, "Link copied · it opens this shortlist")));
    wireArch(el, (label, outcome) => logEv("CUSTOM", `simulation · ${label} → ${outcome}`));
    wireContactForms(el);
  }
  /* ---------- shortlist: pick projects, copy them as notes or share the set ---------- */
  const shortlisted = () => (S.shortlist as string[]).map((id) => P.get(id)).filter((p): p is Project => !!p);
  function syncTray() {
    const n = (S.shortlist as string[]).length, tray = q<HTMLButtonElement>("#sltray");
    tray.hidden = n === 0; tray.innerHTML = `${ICON.bookmark}Shortlist · ${n}`;
  }
  function shortlistNotes() {
    const site = location.origin;
    return [`${PROFILE.name} — AI engineer, ${PROFILE.location}`, "", "Shortlisted work:",
      ...shortlisted().flatMap((p) => [`• ${p.title}: ${p.oneLiner}`, `  ${site}/work/${p.id}`]),
      "", `Resume: ${site}/resume.pdf`, `Email: ${PROFILE.links.email}`, `GitHub: ${PROFILE.links.github}`].join("\n");
  }
  async function copyNote(el: HTMLElement, text: string, ok: string) {
    const note = el.querySelector<HTMLElement>(".slnote");
    try { await navigator.clipboard.writeText(text); if (note) note.textContent = ok; } catch { if (note) note.textContent = "Couldn’t reach the clipboard"; }
  }

  function citeFold(el: HTMLElement, p: Project) {
    const d = document.createElement("details"); d.className = "cite";
    d.innerHTML = `<summary><span class="lbl">source</span><b>${esc(p.title)}</b><span class="co">${esc(p.oneLiner)}</span>${CHEV}</summary>`;
    el.replaceWith(d); d.appendChild(el);
  }
  function showPanel(kind: string, id?: string, opts: { compact?: boolean } = {}): HTMLElement | undefined {
    const key = `${kind}:${id || ""}`, existing = col.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`);
    // asked again: draw it again here, in the reply, instead of pointing back up the page
    if (existing) tr("", "ui", `shown again here · ${key.replace(":", " ").trim()}`);
    let html: string;
    // a focused profile (events, work, education) or a filtered list counts as shown only for what it shows
    if (kind === "profile") { html = profilePart(PROFILE, id); shown.add(id || "profile"); }
    else if (kind === "index") { html = indexPanel(listed(id), PROJECTS.length); if (!id) shown.add("index"); }
    else if (kind === "harness") { html = harnessPanel(); shown.add("harness"); }
    else if (kind === "resume") { html = resumePanel(); }
    else if (kind === "connect") { html = connectPanel(PROFILE); }
    else if (kind === "fit" && id) { html = fitPanel(fitRows(id.split("|"))); }
    else if (kind === "compare" && id) { html = comparePanel(compareTable(id.split("|"))); if (!html) return; }
    else if (kind === "shortlist") { html = shortlistPanel(shortlisted()); }
    else {
      const p = id ? P.get(id) : undefined; if (!p) return;
      html = projectPanel(p, { ...opts, arch: kind === "architecture", shortlisted: (S.shortlist as string[]).includes(p.id), permalink: true }); shown.add(p.id); store("rz_last", p.id);
    }
    const el = add(html); el.dataset.key = key; wirePanel(el); paintClocks();
    turnShowed.push(id && P.has(id) ? P.get(id)!.title : kind === "profile" ? "his profile" : kind === "index" ? "the project list" : kind === "harness" ? "how this agent is built" : kind);
    setState({ onScreen: [...shown].filter((x) => !x.includes(":")) });
    if (id && P.has(id)) { focusId = id; focusTurn = turnNo; if (kind === "architecture") shown.add("arch:" + id); }
    if (kind === "architecture") requestAnimationFrame(() => { const a = el.querySelector<HTMLElement>(".arch[data-pid]"); if (a) void runSim(a, null); });
    return el;
  }
  function approvalCard(action: "resume" | "contact") {
    const qtext = action === "resume" ? "Show his resume here?" : "Show Rizwan’s contact details?";
    const el = add(`<div class="approval" data-action="${action}" role="group" tabindex="-1" aria-labelledby="aq${turnNo}"><div class="q"><span class="lbl">NEEDS APPROVAL</span><span id="aq${turnNo}">${qtext}</span></div><div class="acts"><button class="btn dark" data-a="yes">Show <kbd>↵</kbd></button><button class="btn" data-a="no">Not now <kbd>esc</kbd></button></div></div>`);
    tr("warn", "approval", `waiting for you to approve ${action === "resume" ? "the resume" : "his contact details"}`);
    wireApproval(el, action);
    setTimeout(() => { if (document.activeElement !== inp) el.focus({ preventScroll: true }); }, 50); // not while typing
  }
  function wireApproval(el: HTMLElement, action: "resume" | "contact") {
    const t0 = performance.now();
    const title = document.title; document.title = "● Waiting for you · Rizwan";
    let done = false;
    const resolve = (yes: boolean) => {
      if (done) return; done = true;
      document.title = title;
      el.classList.add("resolved"); q(".lbl", el).textContent = yes ? "APPROVED" : "DECLINED";
      const acts = q(".acts", el);
      if (yes && action === "resume") {
        acts.innerHTML = `<span class="status">shown below · ${fmt(performance.now() - t0)}</span>`;
        const target0 = target; target = null; // the viewer goes into the conversation even after the turn ended
        const viewer = showPanel("resume"); target = target0;
        viewer?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      }
      else if (yes && action === "contact") {
        acts.innerHTML = `<span class="status">shown below · ${fmt(performance.now() - t0)}</span>`;
        const target0 = target; target = null;
        const card = showPanel("connect"); target = target0;
        card?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      } else acts.innerHTML = '<span class="status">skipped</span>';
      tr(yes ? "ok" : "", "approval", yes ? `you approved · ${action === "resume" ? "resume" : "contact details"} shown` : "you declined · nothing shared");
      shown.add("done:" + action); setState({ approvals: { ...(S.approvals as object), [action]: yes ? "granted" : "declined" } });
      inp.focus();
    };
    el.querySelectorAll<HTMLButtonElement>("[data-a]").forEach((b) => (b.onclick = () => resolve(b.dataset.a === "yes")));
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === el) { e.preventDefault(); resolve(true); } if (e.key === "Escape") resolve(false); });
  }

  /* ---------- outage ---------- */
  function setDown(on: boolean) {
    down = on; shell.classList.toggle("down", on); setState({ model: on ? "offline (router)" : "online" });
    const k = q("#kill"); k.setAttribute("aria-checked", String(on)); k.classList.add("used");
    q("#killLbl").innerHTML = on ? 'Model offline<span class="lbl2"> · restore</span>' : "Kill the model";
    // inside a turn (the "Try to break it" tour) the outage belongs to that turn; on its own it gets a row
    if (!busy) { const li = traceTurn(on ? "kill the model" : "restore the model"); li.lastElementChild!.textContent = ""; }
    tr(on ? "err" : "ok", "outage", on ? "visitor took the model offline" : "model restored");
    if (!busy && col.classList.contains("started")) chips([]); // "Restore the model" leads while offline
  }

  /* ---------- agentic GenUI: plan card ---------- */
  const STEP = (name: string, args: Record<string, unknown> = {}) => {
    const t = P.get(String(args.id))?.title ?? String(args.id ?? "");
    const ids = Array.isArray(args.ids) ? args.ids.length : 0, part = ({ events: "his events and prizes", work: "his work history", education: "his education" } as Record<string, string>)[String(args.focus)];
    return ({ show_profile: part ? `Show ${part}` : "Open his profile", list_projects: ids && ids < PROJECTS.length ? `List the ${ids} projects that fit` : "List everything he’s built", search_projects: `Search his work for “${String(args.query ?? "")}”`,
      open_project: args.view === "architecture" ? `Map ${t}’s architecture` : `Open ${t}`, show_harness: "Show how this agent is built",
      offer_resume: "Ask before sharing the resume", offer_contact: "Ask before sharing his contact details", match_role: "Match the role to his work", switch_mode: `Switch to ${String(args.mode)} view` } as Record<string, string>)[name] ?? name;
  };
  function planCard(steps: [string, string][] = []) {
    const el = add(`<div class="plan"><button class="phd" aria-expanded="true"><span class="ico run"></span><b>Working</b><span class="cnt"></span><span class="t"></span>${CHEV}</button><ol></ol></div>`);
    const ol = q("ol", el), t0 = performance.now(), items: { li: HTMLElement; state: string }[] = [];
    const head = () => { q(".cnt", el).textContent = ` · ${items.filter((i) => i.state === "done").length} of ${items.length}`; };
    const api = {
      add(label: string, tool = "") { const li = document.createElement("li"); li.className = "todo"; li.innerHTML = `<span class="ico todo"></span><span>${esc(label)}</span><span class="tool">${esc(tool)}</span>`; ol.appendChild(li); items.push({ li, state: "todo" }); head(); return items.length - 1; },
      run(i: number) { const it = items[i]; if (!it) return; it.state = "run"; it.li.className = "run"; (it.li.firstChild as HTMLElement).className = "ico run"; logEv("STEP_STARTED", it.li.children[1].textContent ?? "", "run"); },
      done(i: number) { const it = items[i]; if (!it || it.state === "done") return; it.state = "done"; it.li.className = "done"; (it.li.firstChild as HTMLElement).className = "ico done"; logEv("STEP_FINISHED", it.li.children[1].textContent ?? "", "run"); head(); },
      finish() {
        items.forEach((_, i) => api.done(i));
        q(".phd .ico", el).className = "ico done";
        q(".phd b", el).textContent = items.length === 1 ? "Done" : `All ${items.length} steps complete`;
        q(".cnt", el).textContent = ""; q(".t", el).textContent = fmt(performance.now() - t0);
        if (items.length > 1) { el.classList.add("collapsed"); q(".phd", el).setAttribute("aria-expanded", "false"); }
      },
    };
    q<HTMLButtonElement>(".phd", el).onclick = () => { const c = el.classList.toggle("collapsed"); q(".phd", el).setAttribute("aria-expanded", String(!c)); };
    steps.forEach(([l, tool]) => api.add(l, tool));
    return api;
  }
  // human in the loop: the agent asks, the visitor picks, the tour adapts
  // A question card blocks its tour until answered. Typing something else skips it (skipPending), and a
  // card restored from a saved session stays usable: each option carries the message it stands for.
  let skipPending: (() => void) | null = null;
  function skipCard(el: HTMLElement) { el.classList.add("resolved", "skipped"); q(".lbl", el).textContent = "SKIPPED"; }
  function choiceCard(question: string, options: [string, string, string, string][]) {
    return new Promise<string | null>((res) => {
      const el = add(`<div class="choice" role="group" aria-label="${esc(question)}"><span class="lbl">YOUR CALL</span><p>${esc(question)}</p><div class="opts">${options.map(([v, b, s, msg]) => `<button class="opt" data-v="${esc(v)}" data-send="${esc(msg)}"><b>${esc(b)}</b><small>${esc(s)}</small></button>`).join("")}</div></div>`);
      logEv("CUSTOM", "human_in_the_loop · awaiting choice", "run"); tr("warn", "hitl", "waiting for your choice");
      skipPending = () => { skipPending = null; skipCard(el); tr("", "hitl", "skipped · visitor asked something else"); res(null); };
      el.querySelectorAll<HTMLButtonElement>(".opt").forEach((b) => (b.onclick = () => { if (el.classList.contains("resolved")) return; skipPending = null; b.classList.add("picked"); el.classList.add("resolved"); tr("ok", "hitl", "picked · " + b.dataset.v); reveal = true; res(b.dataset.v!); }));
      // never steal focus from a visitor who is already typing: their Enter must send their message
      setTimeout(() => { if (document.activeElement !== inp) q<HTMLButtonElement>(".opt", el).focus({ preventScroll: true }); }, 60);
    });
  }
  // several answers allowed: toggle any, "all" selects everything, then confirm
  function multiChoiceCard(question: string, options: [string, string, string][], all: [string, string, string]) {
    return new Promise<string[] | null>((res) => {
      const el = add(`<div class="choice multi" data-hire role="group" aria-label="${esc(question)}"><span class="lbl">YOUR CALL · PICK ANY</span><p>${esc(question)}</p><div class="opts">${[...options, all].map(([v, b, s]) => `<button class="opt" aria-pressed="false" data-v="${esc(v)}"><b>${esc(b)}</b><small>${esc(s)}</small></button>`).join("")}</div><div class="go"><button class="btn dark" data-go disabled>Show me <kbd>↵</kbd></button></div></div>`);
      logEv("CUSTOM", "human_in_the_loop · awaiting choices", "run"); tr("warn", "hitl", "waiting for your choices");
      skipPending = () => { skipPending = null; skipCard(el); tr("", "hitl", "skipped · visitor asked something else"); res(null); };
      const opts = [...el.querySelectorAll<HTMLButtonElement>(".opt")], go = q<HTMLButtonElement>("[data-go]", el);
      const picked = () => opts.filter((o) => o.getAttribute("aria-pressed") === "true").map((o) => o.dataset.v!);
      opts.forEach((b) => (b.onclick = () => {
        if (el.classList.contains("resolved")) return;
        const on = b.getAttribute("aria-pressed") !== "true";
        if (b.dataset.v === all[0]) opts.forEach((o) => o.setAttribute("aria-pressed", String(on)));
        else { b.setAttribute("aria-pressed", String(on)); opts.find((o) => o.dataset.v === all[0])!.setAttribute("aria-pressed", String(options.every(([v]) => picked().includes(v)))); }
        go.disabled = !picked().length;
      }));
      const done = () => {
        const v = picked().filter((x) => x !== all[0]);
        if (!v.length || el.classList.contains("resolved")) return;
        skipPending = null; el.classList.add("resolved"); opts.forEach((o) => o.getAttribute("aria-pressed") === "true" && o.classList.add("picked"));
        tr("ok", "hitl", "picked · " + v.join(" + ")); reveal = true; res(v);
      };
      go.onclick = done;
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" && !go.disabled && (e.target as HTMLElement).dataset.go === undefined) { e.preventDefault(); done(); } });
      setTimeout(() => { if (document.activeElement !== inp) opts[0].focus({ preventScroll: true }); }, 60);
    });
  }
  async function toolLine(label: string, tool: string) {
    const plan = planCard([[label, tool]]);
    tr("", "tool", tool); plan.run(0); await wait(240); plan.finish();
  }
  function metaLine(meta: Meta) {
    const map: Record<string, [string, string]> = {
      tour: ["scripted tour · in your browser, no model call", ""], facts: ["answered straight from his facts · no model call", ""], cache: ["replayed an earlier answer · 0 tokens", ""],
      router: [down ? "model offline → deterministic router answered · no AI" : "every model failed → deterministic router answered · no AI", "warn"],
      scope: ["refused before any model call", ""], guard: ["blocked by the prompt guard", "warn"],
      partial: ["model failed mid-answer → stopped with what was verified", "warn"], local: ["answered in your browser · no model call", ""], aborted: ["cancelled", "warn"],
    };
    const tools = `${meta.tools} tool${meta.tools === 1 ? "" : "s"}`;
    const m = map[meta.mode] ?? [`answered by ${meta.model}${meta.fallback ? " after a fallback" : ""} · ${fmt(meta.ms ?? 0)} · ${tools}`, meta.fallback ? "warn" : ""];
    add(`<div class="meta ${m[1]}"><span class="d"></span>${esc(m[0])}</div>`);
  }
  const nextFor = (p: Project) => {
    const others = PROJECTS.filter((x) => x.id !== p.id && !shown.has(x.id)).slice(0, 1);
    const first = p.sims?.length ? `How does ${p.title} handle failures?` : p.pipeline?.length ? `Internals of ${p.title}` : null;
    return [first, ...others.map((o) => `Open ${o.title}`), "Everything he’s built"].filter(Boolean) as string[];
  };

  /* ---------- scripted, zero-request tours ---------- */
  const TOURS: Record<string, () => Promise<string[]>> = {
    "i’m a recruiter": async () => {
      setState({ visitor: "recruiter" });
      await say("Quick question first, so the tour fits.");
      // roles combine (his own job spans all three), so this is pick-any, with "All of it" as a shortcut
      const focus = await multiChoiceCard("What are you hiring for?", [["ai", "AI & agents", "LLM systems, RAG, voice, multi-agent"], ["fullstack", "Full-stack product", "web + mobile, shipped"], ["backend", "Backend & APIs", "services, data, auth"]], ["all", "All of it", "the way he works day to day"]);
      if (!focus) return ["Everything he’s built", "Get resume", "Contact Rizwan"];
      return showHire(focus);
    },
    "i’m an engineer": async () => {
      setState({ visitor: "engineer" });
      const pick = await choiceCard("Pick a system to open up.", [["pack", "Multi-agent", "7 LangGraph agents, 4-step fallback", "Internals of PACK"], ["ccr", "RAG", "74,975 sections, cited answers", "Internals of CCR Compliance Advisor"], ["voice", "Voice", "10 agents on LiveKit", "Internals of Ten Days of Voice Agents"], ["harness", "This site", "the agent you’re using", "How does this site work?"]]);
      if (!pick) return ["Everything he’s built", "How does this site work?", "Internals of PACK"];
      setState({ focus: pick });
      const plan = planCard([[pick === "harness" ? "Show how this agent is built" : `Map ${P.get(pick)!.title}’s architecture`, pick === "harness" ? "show_harness" : "open_project"]]);
      plan.run(0); await wait(260);
      if (pick === "harness") showPanel("harness"); else showPanel(P.get(pick)!.pipeline.length ? "architecture" : "project", pick);
      plan.finish();
      return pick === "harness" ? ["Everything he’s built", "Internals of PACK"] : nextFor(P.get(pick)!);
    },
    "try to break it": async () => {
      setState({ visitor: "breaker" }); if (!down) setDown(true);
      await say("I’ve taken my model offline. Nothing breaks: every answer now comes from a deterministic router, with no AI involved. Watch, I’ll answer one now.");
      queued = "Show me his voice agents"; // a real answer through the router, so the visitor sees it keep working
      return ["How does PACK keep a game going?", "Get resume", "Restore the model"];
    },
    "just exploring": async () => { setState({ visitor: "explorer" }); await say("Start with the fun one: seven AI agents playing Werewolf."); const plan = planCard([["Open PACK", "open_project"]]); plan.run(0); await wait(240); showPanel("project", "pack"); plan.finish(); return ["Everything he’s built", "Something with voice", "How does this site work?"]; },
  };
  const ROLE_PICKS: Record<string, string[]> = { ai: ["pack", "ccr", "voice", "verseyou"], fullstack: ["finboom", "cpl", "kerala"], backend: ["ngo", "ccr", "pulsevo"] };
  const ROLE_LABEL: Record<string, string> = { ai: "AI & agents", fullstack: "Full-stack product", backend: "Backend & APIs" };
  async function showHire(focus: string[]) {
    setState({ focus });
    // round-robin across the chosen roles so each is represented early; every matching project is shown
    // ("All of it" covers all ten, in order of relevance)
    const lists = focus.map((f) => ROLE_PICKS[f]), picks: string[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (l[i] && !picks.includes(l[i])) picks.push(l[i]);
    if (focus.length === 3) for (const p of PROJECTS) if (!picks.includes(p.id)) picks.push(p.id);
    const plan = planCard([["Open his profile", "show_profile"], ...picks.map((id): [string, string] => [`Open ${P.get(id)!.title}`, "open_project"]), ["Ask before sharing the resume", "offer_resume"]]);
    plan.run(0); await wait(240); showPanel("profile"); plan.done(0);
    // the best four first; the rest wait behind "Show N more" so the tour stays readable
    const first = picks.slice(0, 4), rest = picks.slice(4);
    for (let i = 0; i < first.length; i++) { plan.run(i + 1); await wait(220); showPanel("project", first[i], { compact: true }); plan.done(i + 1); }
    for (let i = first.length; i < picks.length; i++) plan.done(i + 1);
    if (rest.length) {
      const more = add(`<button class="btn more" data-more>Show ${rest.length} more project${rest.length === 1 ? "" : "s"} <span aria-hidden="true">↓</span></button>`);
      more.onclick = () => {
        const target0 = target; target = null;
        for (const id of rest) { const el = showPanel("project", id, { compact: true }); if (el) more.before(el); }
        target = target0; more.remove(); chips([]);
      };
    }
    plan.run(picks.length + 1); await wait(160); approvalCard("resume"); plan.finish();
    return ["Everything he’s built", "How does this site work?", "Contact Rizwan"];
  }
  const rolesIn = (t: string) => /\ball( of it)?\b/i.test(t) ? ["ai", "fullstack", "backend"] : [/\b(ai|agents?)\b/i.test(t) && "ai", /full.?stack/i.test(t) && "fullstack", /\b(backend|apis?)\b/i.test(t) && "backend"].filter(Boolean) as string[];
  const byTitle = (t: string) => PROJECTS.find((p) => p.title.toLowerCase() === t.toLowerCase().trim() || p.id === t.toLowerCase().trim());

  /* ---------- send ---------- */
  async function send(raw: string) {
    const text = String(raw).trim(); if (!text) return;
    if (busy) { queued = text; inp.value = ""; inp.placeholder = "Queued: " + text.slice(0, 40); skipPending?.(); return; }
    busy = true; form.setAttribute("aria-busy", "true"); sugg.innerHTML = ""; lastAgentRun = false;
    let th: HTMLElement | null = null;
    try {
      await leaveHome(); col.classList.add("started");
      const bubble = add(`<div class="msg user"><div class="bubble">${esc(text)}</div></div>`);
      bubble.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      th = traceTurn(text);
      target = add('<div class="turn"><div class="ttext"></div></div>');
      let next: string[] | null = null, meta: Meta | null = null;
      turnSaid = []; turnShowed = [];
      const tour = TOURS[text.toLowerCase().replace(/'/g, "’")];
      // "Open PACK architecture" (a model-written chip) is the internals view, still answered locally
      const fast = text.match(/^(internals of|open) (.+?)(?:'s|’s)?( architecture| internals)?\??$/i), fp = fast ? byTitle(fast[2]) : undefined;
      const listQ = /^(everything he.?s built|what has he built\??|(list|show|view)( me)?( all)?( his)? (work|projects)|all projects|projects|his work|open (a )?project|(ask about|tell me about) (a|his) projects?)$/i.test(text);
      const hireRoles = /^hiring for /i.test(text) ? rolesIn(text) : [], hireQ = hireRoles.length > 0;
      const shortlistQ = /^(show |open |view )?(my |the )?shortlist$/i.test(text);
      // the site's own internals have one answer: shown here, no model call (and no model picking a random project)
      const siteQ = /^(how does (this|the) (site|agent|portfolio|chat) work\??|how (is|was) (this|the) (site|agent) (built|made)\??|internals( of (this|the) (site|agent))?|show (me )?(the )?harness)$/i.test(text);
      const offlineQ = /^(take the model offline|kill the model)$/i.test(text), restoreQ = /^(restore|bring back|turn on)( the)? model$/i.test(text);
      // commands that never need a model: answered here, instantly, and can't be misread
      const profileQ = /^((view|show|open|see)\s)?(his\s)?profile$|^(ask |tell me )?about (rizwan|him)$|^who(’|')?s rizwan\??$|^who is (he|rizwan)\??$/i.test(text);
      const classicQ = /^(switch (to )?(the )?classic( mode| site| view)?|switch mode|(open |go to )?(the )?classic( site| mode| view)?)$/i.test(text);
      const resumeQ = /^((get|see|view|open|show|download)\s)?(his\s)?(resume|cv)$/i.test(text);
      const contactQ = /^(contact( rizwan| him)?|connect( with)?( rizwan| him)?|email( rizwan| him)?|(his )?linkedin|(his )?socials?|get in touch|how (do|can) i (reach|contact) (him|rizwan)\??|reach (him|rizwan))$/i.test(text);
      const archQ = text.match(/^(?:view|show|open)?\s*(?:the\s)?(?:architecture|internals|diagram)(?: of (.+))?$/i);
      const archP = archQ ? (archQ[1] ? byTitle(archQ[1]) : P.get([...shown].reverse().find((x) => P.has(x)) ?? "")) : undefined;
      const fail = text.match(/^how does (.+?) (?:handle failures|keep a game going)\??$/i), fpF = fail ? byTitle(fail[1]) : undefined;
      // local runs get synthetic RUN_* entries; remote runs log the server's real AG-UI events
      const local = () => logEv("RUN_STARTED", `turn ${turnNo} · local · “${text.slice(0, 40)}”`, "run");
      try {
        if (tour) { local(); tr("ok", "tour", "scripted tour · runs in your browser, no model call"); next = await tour(); meta = { mode: "tour" }; }
        else if (offlineQ || restoreQ) {
          local(); tr("ok", "fast path", "model switch flipped in your browser · no model call");
          if (offlineQ && !down) setDown(true); if (restoreQ && down) setDown(false);
          await say(restoreQ ? "Model restored: answers come from gpt-oss-120b again, with the same guardrails." : "Model offline. Ask anything: the deterministic router answers without AI.");
          next = restoreQ ? ["Everything he’s built", "How does this site work?"] : ["Show me his voice agents", "Get resume"]; meta = { mode: "local" };
        } else if (shortlistQ) {
          local(); tr("ok", "fast path", "your shortlist, answered in your browser · no model call");
          const n = (S.shortlist as string[]).length;
          await say(n ? `Your shortlist: ${n} project${n === 1 ? "" : "s"}. Copy it as notes or share it.` : "Nothing shortlisted yet. Use Shortlist on any project.");
          showPanel("shortlist");
          next = n ? ["Get resume", "Contact Rizwan"] : ["Everything he’s built"]; meta = { mode: "local" };
        } else if (siteQ) {
          local(); tr("ok", "fast path", "how this site works, answered in your browser · no model call");
          await say("Every message passes a prompt guard and a scope filter. Known questions are answered right here; the rest go to a model chain (gpt-oss-120b, gpt-oss-20b, Nemotron on NVIDIA, Gemini, free OpenRouter models) with a deterministic router behind it, and every sentence is checked against his facts.");
          await toolLine("Show how this agent is built", "show_harness"); showPanel("harness");
          next = ["Everything he’s built", "Try to break it", "Get resume"]; meta = { mode: "local" };
        } else if (hireQ) {
          local(); tr("ok", "fast path", "projects for your roles, answered in your browser · no model call");
          setState({ visitor: "recruiter" });
          await say("Here’s what fits, across the roles you picked.");
          next = await showHire(hireRoles); meta = { mode: "local" };
        } else if (profileQ || classicQ || resumeQ || contactQ) {
          local(); tr("ok", "fast path", "a known command, answered in your browser · no model call");
          if (profileQ) {
            await say("Here’s Rizwan.");
            await toolLine("Open his profile", "show_profile"); showPanel("profile");
            next = ["Everything he’s built", "Get resume", "Contact Rizwan"];
          } else if (classicQ) {
            await say("Switching you to the classic site.");
            saveSession(); setTimeout(() => { location.href = "/"; }, 500);
            next = ["Everything he’s built"];
          } else {
            const action = resumeQ ? "resume" : "contact";
            await say(action === "resume" ? "His resume, once you approve." : "Every way to reach him, once you approve.");
            await toolLine(action === "resume" ? "Ask before sharing the resume" : "Ask before sharing his contact details", action === "resume" ? "offer_resume" : "offer_contact");
            approvalCard(action);
            next = action === "resume" ? ["Everything he’s built", "Contact Rizwan"] : ["Everything he’s built", "Get resume"];
          }
          meta = { mode: "local" };
        } else if (listQ) {
          local(); tr("ok", "fast path", "a known question, answered in your browser · no model call");
          await say(shown.has("index") ? "Here it is again." : "Everything he’s shipped. Open any one.");
          const plan = planCard([["List everything he’s built", "list_projects"]]); plan.run(0); await wait(200);
          showPanel("index"); plan.finish();
          next = ["How does this site work?", "I’m a recruiter", "Get resume"]; meta = { mode: "local" };
        } else if (archP) {
          local(); tr("ok", "fast path", "architecture of the project on screen, answered in your browser · no model call");
          await say(archP.pipeline.length ? `Here’s how ${archP.title} is put together.` : `${archP.title} has no pipeline diagram; here are its facts.`);
          const plan = planCard([[`Map ${archP.title}’s architecture`, "open_project"]]); plan.run(0); await wait(220);
          showPanel(archP.pipeline.length ? "architecture" : "project", archP.id); plan.finish();
          next = nextFor(archP); meta = { mode: "local" };
        } else if (fail && fpF) {
          local(); tr("ok", "fast path", "answered from his facts in your browser · no model call");
          const fx = fpF.facts.filter((f) => /fallback|mock|stall|crash|resume|checkpoint|confirm|validated|never|plain message|template|timeout/i.test(f));
          await say(fx.length ? fx[0] : `His write-up doesn’t cover failure handling for ${fpF.title}.`);
          const sims = fpF.sims ?? [];
          const plan = planCard([[`Map ${fpF.title}’s architecture`, "open_project"], ...(sims.length ? [[`Replay: ${sims.at(-1)!.label}`, "simulate"] as [string, string]] : [])]);
          plan.run(0); await wait(220);
          const el = showPanel(fpF.pipeline.length ? "architecture" : "project", fpF.id); plan.done(0);
          if (sims.length && el) {
            plan.run(1); const arch = el.querySelector<HTMLElement>(".arch");
            arch?.querySelectorAll("[data-sim]").forEach((x) => x.setAttribute("aria-pressed", String((x as HTMLElement).dataset.sim === String(sims.length - 1))));
            await wait(300); if (arch) await runSim(arch, sims.at(-1)!, (l, o) => logEv("CUSTOM", `simulation · ${l} → ${o}`));
          }
          plan.finish(); next = nextFor(fpF).filter((x) => !/handle failures/.test(x)); meta = { mode: "local" };
        } else if (fp && fast) {
          local(); tr("ok", "fast path", "opening a project, answered in your browser · no model call");
          const archView = (/^internals/i.test(fast[1]) || !!fast[3]) && fp.pipeline.length > 0;
          await say(archView ? `Here’s how ${fp.title} is put together.` : `Here’s ${fp.title}.`);
          await toolLine(archView ? `Map ${fp.title}’s architecture` : `Open ${fp.title}`, "open_project");
          showPanel(archView ? "architecture" : "project", fp.id);
          next = nextFor(fp); meta = { mode: "local" };
        } else meta = await remote(text, (o) => (next = o));
      } catch (e) {
        tr("err", "network", e instanceof Error ? e.message : "failed");
        await say("Lost the connection for a moment. These still work offline:"); next = ["Everything he’s built", "Get resume"]; meta = { mode: "local" };
      }
      // refused messages and tour buttons are UI, not conversation: keep them out of the history sent to the model
      if (!tour && meta?.mode !== "scope" && meta?.mode !== "guard") {
        turns.push(text);
        // what the agent said and showed this turn travels with the next message, so the model sees its own replies
        const showed = [...new Set(turnShowed)].slice(0, 5), agent = turnSaid.join(" ").slice(0, 2000);
        convo.push({ user: text, ...(agent ? { agent } : {}), ...(showed.length ? { showed } : {}) });
      }
      said.push(text);
      if (meta?.mode === "local" || meta?.mode === "tour") logEv("RUN_FINISHED", meta.mode, "run");
      if (meta) metaLine(meta);
      voice.say(turnSaid.join(" "));
      th.lastElementChild!.textContent = fmt(performance.now() - tStart);
      chips(next ?? ["Everything he’s built", "Get resume"]);
      saveSession();
    } finally { target = null; busy = false; form.setAttribute("aria-busy", "false"); inp.placeholder = "Ask about Rizwan’s work…"; drainQueue(); }
  }
  function drainQueue() { if (queued && !busy) { const t = queued; queued = null; setTimeout(() => void send(t), 50); } }

  /* ---------- AG-UI stream ---------- */
  async function remote(text: string, setNext: (o: string[]) => void): Promise<Meta> {
    // pixel spinner: the agent mark's ring lights up in turn while the model works
    const ring = [0, 1, 2, 5, 8, 7, 6, 3], cells = Array.from({ length: 9 }, (_, k) => (k === 4 ? '<i class="c"></i>' : `<i style="--i:${ring.indexOf(k)}"></i>`)).join("");
    const think = add(`<div class="tools"><div class="pend think" role="status" aria-label="Working"><span class="pixspin" aria-hidden="true">${cells}</span><span class="tl">working</span></div></div>`);
    try { return await stream(text, setNext, think); } finally { think.remove(); } // never leave "working" behind, even on a dropped connection
  }
  async function stream(text: string, setNext: (o: string[]) => void, think: HTMLElement): Promise<Meta> {
    const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ history: trimHistory([...convo, { user: text }].slice(-6)), shown: [...shown], state: S.session, killModel: down }) });
    if (res.status === 429) { think.remove(); await say("You’re going fast. Give it a minute; the buttons below still work."); return { mode: "local" }; }
    if (!res.ok || !res.body) throw new Error("HTTP " + res.status);
    let meta: Meta | null = null, plan: ReturnType<typeof planCard> | null = null, pending: number | null = null, compactNext = false;
    const textBuf = new Map<string, string>(), toolBuf = new Map<string, { name: string; args: string }>();
    let chain = Promise.resolve();
    const handle = async (e: Ev) => {
      if (e.type !== "trace") think.remove();
      if (e.type === "trace") tr(e.level, e.step, e.detail);
      else if (e.type === "state") setState({ session: e.state, focus: (e.state.focus as string | null) ?? S.focus });
      else if (e.type === "text") await say(e.text);
      else if (e.type === "tool") {
        if (e.name === "suggest") return;
        if (!plan) plan = planCard();
        pending = plan.add(STEP(e.name, e.args), e.name); plan.run(pending); await wait(180);
        if (["search_projects", "switch_mode"].includes(e.name)) plan.done(pending);
      } else if (e.type === "panel") {
        if (plan && pending != null) plan.done(pending);
        const pel = showPanel(e.panel.kind, e.panel.id, { compact: compactNext && e.panel.kind === "project" }); if (e.panel.kind === "project") compactNext = true;
        // a project the question didn't name is evidence for the answer, not the answer: shown as a folded citation
        const pp = e.panel.id ? P.get(e.panel.id) : undefined;
        if (pel && pp && (e.panel.kind === "project" || e.panel.kind === "architecture") && !new RegExp(`\\b(${pp.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${pp.id})\\b`, "i").test(text)) citeFold(pel, pp);
        await wait(160);
      } else if (e.type === "frontend" && e.name === "switch_mode") { saveSession(); setTimeout(() => { location.href = e.args.mode === "classic" ? "/" : "/agent"; }, 900); }
      else if (e.type === "approval") { if (plan && pending != null) plan.done(pending); approvalCard(e.action); }
      else if (e.type === "suggest") setNext(e.options);
      else if (e.type === "done") { meta = e.meta; plan?.finish(); }
    };
    // AG-UI events → UI events; the Events tab shows the protocol as it arrives
    const onAgui = (a: Record<string, any>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const logged = () => logEv(a.type, a.type === "CUSTOM" ? `${a.name} · ${JSON.stringify(a.value).slice(0, 60)}` : a.type === "TEXT_MESSAGE_CONTENT" ? String(a.delta).slice(0, 60) : a.type === "TOOL_CALL_START" ? a.toolCallName : a.type === "RUN_FINISHED" ? JSON.stringify(a.result) : "", a.type.startsWith("RUN") ? "run" : "");
      chain = chain.then(logged); // log in render order, so the Events tab never runs ahead of the UI
      let ui: Ev | null = null;
      switch (a.type) {
        case "TEXT_MESSAGE_START": textBuf.set(a.messageId, ""); break;
        case "TEXT_MESSAGE_CONTENT": textBuf.set(a.messageId, (textBuf.get(a.messageId) ?? "") + a.delta); break;
        case "TEXT_MESSAGE_END": ui = { type: "text", text: textBuf.get(a.messageId) ?? "" }; textBuf.delete(a.messageId); break;
        case "TOOL_CALL_START": toolBuf.set(a.toolCallId, { name: a.toolCallName, args: "" }); break;
        case "TOOL_CALL_ARGS": { const t = toolBuf.get(a.toolCallId); if (t) t.args += a.delta; break; }
        case "TOOL_CALL_END": { const t = toolBuf.get(a.toolCallId); if (t) { let args = {}; try { args = JSON.parse(t.args || "{}"); } catch { /* keep {} */ } ui = { type: "tool", name: t.name, args }; } break; }
        case "CUSTOM":
          if (a.name === "panel") ui = { type: "panel", panel: a.value };
          else if (a.name === "approval") ui = { type: "approval", action: a.value.action };
          else if (a.name === "suggest") ui = { type: "suggest", options: a.value.options };
          else if (a.name === "frontend_tool") ui = { type: "frontend", name: a.value.name, args: a.value.args };
          else if (a.name === "trace") ui = { type: "trace", ...a.value };
          break;
        case "STATE_SNAPSHOT": ui = { type: "state", state: a.snapshot }; break;
        case "RUN_FINISHED": ui = { type: "done", meta: a.result ?? { mode: "local" } }; break;
        case "RUN_ERROR": ui = { type: "trace", step: "run", detail: a.message, level: "err" }; break;
      }
      if (ui) { const u = ui; chain = chain.then(() => handle(u)).catch((err) => console.error(err)); }
    };
    const reader = res.body.getReader(), dec = new TextDecoder(); let buf = "";
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i); buf = buf.slice(i + 2);
        const data = block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
        if (!data) continue;
        try { onAgui(JSON.parse(data)); } catch { /* skip malformed frame */ }
      }
    }
    await chain; think.remove();
    if (!meta) { tr("err", "stream", "ended without RUN_FINISHED"); await say("The answer was cut off. Try again, or use the buttons below."); return { mode: "local" }; }
    return meta;
  }

  /* ---------- home ---------- */
  function renderHome() {
    const now = new Date(), h = now.getHours();
    const hello = h < 5 ? "Still up?" : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
    const blr = new Date(Date.now() + (330 + now.getTimezoneOffset()) * 60000);
    const t = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const sameTz = now.getTimezoneOffset() === -330, lastId = store("rz_last"), ref = document.referrer;
    const fromLinkedIn = /linkedin\./i.test(ref), fromGitHub = /github\./i.test(ref);
    const cards: { k: string; b: string; s: string; cls?: string }[] = [
      { k: "hire", b: "I’m hiring", s: "pick your roles · profile, matching projects, resume" },
      { k: "eng", b: "I build agents", s: "open the internals of a 7-agent system" },
      { k: "explore", b: "Just exploring", s: "seven AI agents playing Werewolf" },
      { k: "break", b: "Try to break it", s: "switch my AI off and watch me keep answering", cls: "danger" },
    ];
    if (fromGitHub) cards.unshift(cards.splice(1, 1)[0]);
    if (RETURNING && lastId && P.get(lastId)) cards[2] = { k: "resume:" + lastId, b: "Pick up where you left off", s: P.get(lastId)!.title };
    col.classList.add("home"); col.innerHTML = "";
    const home = add(`<div class="homeb" id="home">
      ${homeIntro({
        greet: RETURNING ? "Welcome back." : hello, returning: !!RETURNING, role: ROLE,
        meta: `${sameTz ? `Bangalore · ${t(now)}` : `${t(now)} for you · ${t(blr)} in Bangalore`}${fromLinkedIn ? " · hello from LinkedIn" : fromGitHub ? " · hello from GitHub" : ""}`,
      })}
      <div class="hslot" id="hslot"></div>
      <div class="tools2">
        <button data-q="Everything he’s built">${ICON.grid}Projects</button><button data-q="How does this site work?">${ICON.flow}Internals</button>
        <button data-q="Get resume">${ICON.doc}Resume</button><button data-q="Contact Rizwan">${ICON.mail}Contact</button>
      </div>
      <div class="cards">${cards.map((c, i) => `<button class="card2 ${c.cls || ""} ${(fromLinkedIn && c.k === "hire") || (fromGitHub && c.k === "eng") ? "hl" : ""}" data-k="${esc(c.k)}" style="animation-delay:${80 + i * 50}ms"><b>${esc(c.b)}<span>↗</span></b><small>${esc(c.s)}</small></button>`).join("")}</div>
      <nav class="home-ssr-links" aria-label="Projects">${PROJECTS.map((p) => `<a href="/work/${esc(p.id)}">${esc(p.title)}</a>`).join("")}<a href="/">Classic site</a></nav>
    </div>`);
    q("#hslot").appendChild(form); q(".composer").classList.add("hidden");
    home.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((b) => (b.onclick = () => void send(b.dataset.q!)));
    home.querySelectorAll<HTMLButtonElement>("[data-k]").forEach((b) => (b.onclick = () => void startCard(b.dataset.k!)));
    store("rz_seen", "1");
  }
  async function leaveHome() {
    const home = document.getElementById("home"); if (!home) return;
    home.classList.add("leaving"); await wait(180); home.remove();
    col.classList.remove("home"); q(".composer").prepend(q(".row2")); q(".composer").appendChild(form); q(".composer").classList.remove("hidden");
  }
  async function startCard(k: string) {
    if (k.startsWith("resume:")) return send(`Open ${P.get(k.slice(7))!.title}`);
    if (k === "break") return send("Try to break it"); // the tour itself takes the model down, inside its own turn
    return send(({ hire: "I’m a recruiter", eng: "I’m an engineer", explore: "Just exploring" } as Record<string, string>)[k]);
  }

  /* ---------- sessions survive a trip to Classic ---------- */
  function saveSession() {
    if (ending) return;
    try { if (col.classList.contains("started")) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ html: col.innerHTML, turns, said, convo, focusId, shown: [...shown], down, shortlist: S.shortlist, trace: traceEl.innerHTML, events: q("#events").innerHTML, state: S, turnNo })); } catch { /* storage off */ }
  }
  /** A question card from a saved session: still answerable, and the answer is sent as an ordinary message. */
  function reviveCard(el: HTMLElement) {
    const opts = [...el.querySelectorAll<HTMLButtonElement>(".opt")];
    const finish = (msg: string) => { el.classList.add("resolved"); void send(msg); };
    if (el.hasAttribute("data-hire")) {
      const go = el.querySelector<HTMLButtonElement>("[data-go]");
      const picked = () => opts.filter((o) => o.getAttribute("aria-pressed") === "true").map((o) => o.dataset.v!);
      opts.forEach((b) => (b.onclick = () => {
        if (el.classList.contains("resolved")) return;
        const on = b.getAttribute("aria-pressed") !== "true";
        if (b.dataset.v === "all") opts.forEach((o) => o.setAttribute("aria-pressed", String(on))); else b.setAttribute("aria-pressed", String(on));
        if (go) go.disabled = !picked().filter((v) => v !== "all").length;
      }));
      if (go) go.onclick = () => {
        const v = picked().filter((x) => x !== "all");
        if (!v.length) return;
        opts.forEach((o) => o.getAttribute("aria-pressed") === "true" && o.classList.add("picked"));
        finish(`Hiring for ${v.length === 3 ? "all of it" : v.map((x) => ROLE_LABEL[x]).join(" and ")}`);
      };
    } else opts.forEach((b) => (b.onclick = () => { if (el.classList.contains("resolved") || !b.dataset.send) return; b.classList.add("picked"); finish(b.dataset.send); }));
  }
  function restoreSession() {
    if (!PREV) return;
    const wasDown = !!PREV.down;
    // the side panes are part of the session too: trace, AG-UI events and shared state come back with the chat
    if (PREV.trace) { traceEl.innerHTML = PREV.trace; requestAnimationFrame(followTrace); }
    if (PREV.events) q("#events").innerHTML = PREV.events;
    if (PREV.state) { Object.assign(S, PREV.state, { model: PREV.down ? "offline (router)" : "online" }); renderState(); }
    if (PREV.turnNo) turnNo = PREV.turnNo;
    if (PREV.focusId) focusTurn = turnNo;
    if (PREV.shortlist?.length) { setState({ shortlist: PREV.shortlist.filter((id) => P.has(id)) }); syncTray(); }
    col.classList.remove("home"); col.innerHTML = PREV.html; turns = PREV.turns; said = PREV.said ?? [...PREV.turns]; convo = PREV.convo ?? PREV.turns.map((user) => ({ user })); focusId = PREV.focusId ?? ""; shown = new Set(PREV.shown); PREV = null;
    if (wasDown && !down) setDown(true);
    col.classList.add("started");
    col.querySelectorAll<HTMLElement>(".approval:not(.resolved)").forEach((a) => wireApproval(a, (a.dataset.action === "contact" ? "contact" : "resume")));
    col.querySelectorAll<HTMLElement>(".choice:not(.resolved)").forEach(reviveCard);
    // redraw restored panels from current data: a saved session must not keep stale markup (or old bugs) after a deploy
    col.querySelectorAll<HTMLElement>("[data-key]").forEach((el) => {
      const key = el.dataset.key!, kind = key.slice(0, key.indexOf(":")), id = key.slice(key.indexOf(":") + 1), p = id ? P.get(id) : undefined;
      const html = kind === "project" && p ? projectPanel(p, { compact: el.classList.contains("compact"), shortlisted: (S.shortlist as string[]).includes(p.id), permalink: !el.classList.contains("compact") })
        : kind === "architecture" && p ? projectPanel(p, { arch: true, shortlisted: (S.shortlist as string[]).includes(p.id), permalink: true })
        : kind === "index" ? indexPanel(listed(id), PROJECTS.length) : kind === "profile" ? profilePart(PROFILE, id) : kind === "harness" ? harnessPanel()
        : kind === "resume" ? resumePanel() : kind === "shortlist" ? shortlistPanel(shortlisted()) : kind === "connect" ? connectPanel(PROFILE)
        : kind === "fit" && id ? fitPanel(fitRows(key.slice(4).split("|"))) : kind === "compare" && id ? comparePanel(compareTable(key.slice(8).split("|"))) : null;
      if (!html) return;
      const d = document.createElement("div"); d.innerHTML = html.trim();
      const fresh = d.firstElementChild as HTMLElement; fresh.dataset.key = key; el.replaceWith(fresh);
    });
    col.querySelectorAll<HTMLElement>(".panel").forEach(wirePanel);
    wireAnswer(col);
    q(".composer").prepend(q(".row2")); q(".composer").appendChild(form); q(".composer").classList.remove("hidden");
    col.lastElementChild?.scrollIntoView({ block: "end" }); chips(["Everything he’s built", "How does this site work?", "Get resume"]);
    setState({ onScreen: [...shown].filter((x) => !x.includes(":")) });
  }

  let ending = false; // set by New session so the pagehide save can't write the old conversation back
  function newSession() {
    ending = true;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage off */ }
    writeShortlist(null);
    location.href = "/agent";
  }

  /* ---------- wiring ---------- */
  const MENU: ([string, string, () => void, string?] | "sep")[] = [
    ["Projects", ICON.grid, () => void send("Everything he’s built")], ["Internals", ICON.flow, () => void send("How does this site work?")],
    ["Resume", ICON.doc, () => void send("Get resume")], ["Contact", ICON.mail, () => void send("Contact Rizwan")], "sep",
    ["New session", ICON.plus, () => newSession()], ["Kill the model", ICON.bolt, () => setDown(!down), "danger"], ["Switch to Classic", ICON.swap, () => { saveSession(); location.href = "/"; }],
  ];
  function openMenu(on: boolean) {
    const m = q("#menu"), b = q("#plus"); m.classList.toggle("on", on); b.setAttribute("aria-expanded", String(on));
    if (!on) return;
    m.innerHTML = MENU.map((x, i) => (x === "sep" ? '<div class="sep"></div>' : `<button role="menuitem" class="${x[3] || ""}" data-i="${i}">${x[1]}${x[0] === "Kill the model" && down ? "Restore the model" : x[0]}</button>`)).join("");
    m.querySelectorAll<HTMLButtonElement>("button").forEach((x) => (x.onclick = () => { openMenu(false); (MENU[Number(x.dataset.i)] as [string, string, () => void])[2](); }));
    q<HTMLButtonElement>("button", m).focus();
  }
  const ac = new AbortController(), sig = { signal: ac.signal };
  document.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => (b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    document.querySelectorAll(".tabpane").forEach((p) => p.classList.toggle("on", p.id === "tp-" + b.dataset.tab));
  }));
  q<HTMLButtonElement>("#plus").onclick = (e) => { e.stopPropagation(); openMenu(!q("#menu").classList.contains("on")); };
  addEventListener("click", (e) => { if (!(e.target as Element).closest?.("#menu")) openMenu(false); }, sig);
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") { openMenu(false); shell.classList.remove("trace-open"); }
    // ⌘1 / Ctrl+1 switch browser tabs; shortcuts only fire on a bare key outside any text field
    const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement || (document.activeElement as HTMLElement | null)?.isContentEditable;
    if (e.metaKey || e.ctrlKey || e.altKey || typing) return;
    if (e.key === "/") { e.preventDefault(); inp.focus(); }
    if (/^[1-3]$/.test(e.key)) (sugg.children[Number(e.key) - 1] as HTMLElement | undefined)?.click();
  }, sig);
  addEventListener("pagehide", saveSession, sig);
  form.onsubmit = (e) => { e.preventDefault(); const v = inp.value; inp.value = ""; void send(v); }; // send() queues while busy
  q<HTMLButtonElement>("#kill").onclick = () => setDown(!down);
  q<HTMLButtonElement>("#pill").onclick = () => setDown(!down);
  // the sheet was hidden while turns ran, so it opens at the newest step rather than wherever it last stood
  // desktop: the pane sits beside the chat, open by default, and its close choice is remembered;
  // phones: it is a sheet over the composer, opened on demand
  const wide = matchMedia("(min-width: 901px)");
  const paneClosed = (on: boolean) => { document.documentElement.classList.toggle("trace-closed", on); store("rz_trace", on ? "closed" : "open"); };
  q<HTMLButtonElement>("#trbtn").onclick = () => {
    if (wide.matches) { paneClosed(false); requestAnimationFrame(followTrace); return; }
    if (shell.classList.toggle("trace-open")) requestAnimationFrame(followTrace);
  };
  q<HTMLButtonElement>("#trhead").onclick = () => { paneClosed(false); requestAnimationFrame(followTrace); };
  q<HTMLButtonElement>("#trclose").onclick = () => {
    if (wide.matches) paneClosed(true); else shell.classList.remove("trace-open");
    q<HTMLButtonElement>("#trbtn").focus();
  };
  // on phones the trace is a sheet over the composer: tapping the conversation or Escape closes it
  q("#feed").addEventListener("click", () => shell.classList.remove("trace-open"), sig);
  q<HTMLButtonElement>("#newbtn").onclick = () => newSession();
  q<HTMLButtonElement>("#sltray").onclick = () => void send("Show my shortlist");

  // boot
  // The conversation lives for the tab: refresh, back/forward and Classic ↔ Agent all bring it back.
  // Only "Talk to my agent" links (?new) and the New session button start fresh. ?q= asks inside it.
  const params = new URLSearchParams(location.search), ask = params.get("q"), fresh = params.has("new");
  if (fresh) { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } } // the shortlist outlives ?new; only New session clears it
  try { const s = sessionStorage.getItem(SESSION_KEY); if (s) { const v = JSON.parse(s); if (v?.html) PREV = v; } } catch { /* ignore */ }
  renderState(); logEv("STATE_SNAPSHOT", "initial state", "state");
  if (ask || fresh) history.replaceState(null, "", "/agent");
  if (PREV) restoreSession();
  else renderHome();
  // the tab's shortlist is the truth: whatever Classic added or removed shows in the tray
  const fromTab = readShortlist();
  if (fromTab) {
    const list = fromTab.filter((id) => P.has(id));
    setState({ shortlist: list }); syncTray();
    document.querySelectorAll<HTMLElement>("[data-sl]").forEach((b) => b.setAttribute("aria-pressed", String(list.includes(b.dataset.sl!))));
  }
  // a shared shortlist link (/?shortlist=pack,ccr) opens that shortlist
  const sharedList = (params.get("shortlist") ?? "").split(",").filter((id) => P.has(id)).slice(0, 10);
  if (sharedList.length) { history.replaceState(null, "", "/agent"); setState({ shortlist: sharedList }); syncTray(); void send("Show my shortlist"); }
  else if (ask) void send(ask.slice(0, 2000));
  else setTimeout(() => inp.focus({ preventScroll: true }), 300);
  void feed;

  return () => { ac.abort(); stopClock(); delete shell.dataset.mounted; };
}
