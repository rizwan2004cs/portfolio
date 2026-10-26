// Classic-mode behaviour on top of fully server-rendered content: one-open accordion, hover peek, hero loop line.
import { projectById } from "@/content/data";
import { esc, img } from "@/render/html";
import { wireContactForms } from "./contact";
import { startNudge } from "./nudge";
import { fine, installImageHandling, readShortlist, reduce, runSim, startClock, wireArch, writeShortlist } from "./shared";

export function mountClassic(root: HTMLElement): () => void {
  if (root.dataset.mounted) return () => {};
  root.dataset.mounted = "1";
  installImageHandling();
  const stopClock = startClock();
  const ac = new AbortController(), sig = { signal: ac.signal }, timers: number[] = [];
  const work = root.querySelector<HTMLElement>("#cwork")!;
  const rows = [...work.querySelectorAll<HTMLButtonElement>(".prow")];

  /* hover preview (Akshay-style): an image card trails the cursor over the work list */
  const peek = document.getElementById("peek")!, peekCard = document.getElementById("peekCard")!;
  let mx = 0, my = 0, px = 0, py = 0, raf = 0;
  const loopPeek = () => {
    px += (mx - px) * 0.18; py += (my - py) * 0.18;
    const vx = Math.max(-8, Math.min(8, (mx - px) * 0.08));
    peek.style.transform = `translate3d(${px + 28}px,${py - 120}px,0) rotate(${-4 + vx}deg)`;
    raf = peek.classList.contains("on") ? requestAnimationFrame(loopPeek) : 0;
  };
  if (fine()) rows.forEach((row) => {
    row.addEventListener("mouseenter", (e) => {
      if (reduce || row.getAttribute("aria-expanded") === "true") return;
      const p = projectById(row.dataset.id!);
      peekCard.innerHTML = p?.image ? img(p, "320px") : esc(row.dataset.title);
      if (!peek.classList.contains("on")) { px = mx = e.clientX; py = my = e.clientY; }
      peek.classList.add("on");
      if (!raf) raf = requestAnimationFrame(loopPeek);
    }, sig);
    row.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; }, sig);
    row.addEventListener("mouseleave", () => peek.classList.remove("on"), sig);
  });

  /* accordion: one project open at a time; drawers are server-rendered, so this only toggles */
  const toggle = (row: HTMLButtonElement, open: boolean) => {
    const d = document.getElementById(row.getAttribute("aria-controls")!)!;
    d.classList.toggle("open", open); row.setAttribute("aria-expanded", String(open));
  };
  rows.forEach((row) => (row.onclick = () => {
    const open = row.getAttribute("aria-expanded") !== "true";
    if (open) rows.filter((r) => r !== row && r.getAttribute("aria-expanded") === "true").forEach((r) => toggle(r, false));
    toggle(row, open);
    peek.classList.remove("on");
    if (!open) return;
    history.replaceState(null, "", `#${row.dataset.id}`);
    requestAnimationFrame(() => {
      row.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
      const arch = document.getElementById(row.getAttribute("aria-controls")!)!.querySelector<HTMLElement>(".arch[data-pid]");
      if (arch) void runSim(arch, null);
    });
  }));
  work.querySelectorAll<HTMLButtonElement>("[data-next]").forEach((b) => (b.onclick = () => {
    const next = rows.find((r) => r.dataset.id === b.dataset.next);
    if (next && next.getAttribute("aria-expanded") !== "true") next.click();
  }));
  // shortlisting here fills the same shortlist the agent's tray shows
  const sl = work.querySelectorAll<HTMLButtonElement>("[data-sl]");
  sl.forEach((b) => b.setAttribute("aria-pressed", String((readShortlist() ?? []).includes(b.dataset.sl!))));
  sl.forEach((b) => (b.onclick = () => {
    const id = b.dataset.sl!, list = readShortlist() ?? [], on = !list.includes(id);
    writeShortlist(on ? [...list, id] : list.filter((x) => x !== id));
    b.setAttribute("aria-pressed", String(on)); b.title = on ? "On your shortlist · open it in agent mode" : "";
  }));
  wireArch(work);
  // a shared link like /#ccr opens that project
  const fromHash = rows.find((r) => r.dataset.id === location.hash.slice(1));
  if (fromHash) fromHash.click();
  // in-page links (the toolkit's "used in") open the project they point at, not just scroll to its row
  addEventListener("hashchange", () => {
    const row = rows.find((r) => r.dataset.id === location.hash.slice(1));
    if (row && row.getAttribute("aria-expanded") !== "true") row.click();
  }, sig);

  /* hero line: one real pipeline replays; the primary model drops and the fallback takes over */
  const loop = root.querySelector<HTMLElement>("#loop");
  const items = loop ? [...loop.querySelectorAll<HTMLElement>("[data-i]")] : [];
  let k = 0;
  const tick = () => {
    items.forEach((el) => { const i = Number(el.dataset.i); el.className = i < k ? (i === 2 ? "x" : i === 3 ? "fbk" : "on") : i === k ? "on" : "dim"; });
    k = (k + 1) % (items.length + 2);
  };
  tick();
  if (!reduce && items.length) timers.push(window.setInterval(tick, 700));

  const stopSnake = startSnake(root);
  const stopNudge = startNudge(sig);
  // scroll-spy: the header link for the section under the reading line is marked current
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".secnav a[data-sec]")];
  const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    links.forEach((a) => (a.dataset.sec === e.target.id ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current")));
    // on narrow screens the links scroll sideways: keep the current one in view
    const cur = links.find((a) => a.dataset.sec === e.target.id), nav = cur?.parentElement;
    if (cur && nav && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: Math.max(0, cur.offsetLeft - 16), behavior: reduce ? "auto" : "smooth" });
  }), { rootMargin: "-45% 0px -50% 0px" });
  links.forEach((a) => { const sec = document.getElementById(a.dataset.sec!); if (sec) spy.observe(sec); });
  // contact: copy the address on click (mailto alone silently does nothing without a mail app)
  wireContactForms(root);
  root.querySelectorAll<HTMLElement>("[data-copy]").forEach((el) => el.addEventListener("click", () => {
    void navigator.clipboard?.writeText(el.dataset.copy!).then(() => {
      const note = root.querySelector<HTMLElement>(".copied");
      if (note) { note.textContent = "Copied · opening Gmail"; clearTimeout(Number(note.dataset.t)); note.dataset.t = String(setTimeout(() => (note.textContent = ""), 2400)); }
    });
  }, sig));

  return () => { ac.abort(); stopClock(); stopSnake(); stopNudge(); spy.disconnect(); timers.forEach(clearInterval); cancelAnimationFrame(raf); delete root.dataset.mounted; };
}

/** Box around an element's rendered text and buttons, not its full-width block box. */
function textRect(el: Element): DOMRect {
  const rects: DOMRect[] = [], rg = document.createRange(), walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent?.trim()) { rg.selectNodeContents(n); rects.push(rg.getBoundingClientRect()); }
  el.querySelectorAll("a, button").forEach((b) => rects.push(b.getBoundingClientRect()));
  if (!rects.length) return el.getBoundingClientRect();
  const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top));
  return new DOMRect(l, t, Math.max(...rects.map((r) => r.right)) - l, Math.max(...rects.map((r) => r.bottom)) - t);
}

/** A pixel snake in the empty space beside the hero: it steps along the page grid, chases a block, grows,
 *  and sheds back to size. Decorative only; paused offscreen, in hidden tabs, and frozen for reduced motion. */
function startSnake(root: HTMLElement): () => void {
  const field = root.querySelector<HTMLElement>("#pixels"), hero = root.querySelector<HTMLElement>(".chero");
  if (!field || !hero) return () => {};
  const C = 20, MIN = 4, MAX = 11;
  // free region: right of the hero's text, inside the hero's height, snapped to the 20px half-grid
  const box = () => {
    const f = root.getBoundingClientRect(), text = [...hero.querySelectorAll("h1, .sub, .loopline, .cta")].map(textRect);
    const left = Math.ceil((Math.max(...text.map((r) => r.right)) - f.left + 40) / C);
    const right = Math.floor((f.width - 40) / C) - 1, top = Math.ceil((hero.getBoundingClientRect().top - f.top + 40) / C);
    const bottom = Math.floor((hero.getBoundingClientRect().bottom - f.top - 40) / C) - 1;
    return { left, right, top, bottom, ok: right - left >= 8 && bottom - top >= 8 };
  };
  let b = box();
  field.style.height = `${hero.getBoundingClientRect().bottom - root.getBoundingClientRect().top}px`;
  if (!b.ok) return () => {};
  const cell = (cls = "") => { const i = document.createElement("i"); if (cls) i.className = cls; field.appendChild(i); return i; };
  const place = (el: HTMLElement, [x, y]: number[]) => (el.style.transform = `translate(${x * C}px,${y * C}px)`);
  const rnd = (a: number, z: number) => a + Math.floor(Math.random() * (z - a + 1));
  const cx = rnd(b.left + 3, b.right - 3), cy = rnd(b.top + 2, b.bottom - 2);
  let body: number[][] = Array.from({ length: MIN }, (_, k) => [cx - k, cy]), dir = [1, 0];
  let food = [rnd(b.left, b.right), rnd(b.top, b.bottom)];
  const els: HTMLElement[] = [], foodEl = cell("food");
  const draw = () => {
    while (els.length < body.length) els.push(cell());
    while (els.length > body.length) els.pop()!.remove();
    body.forEach((p, k) => { place(els[k], p); els[k].className = k === 0 ? "head" : ""; });
    els[0].style.transform += dir[0] < 0 ? " scaleX(-1)" : "";
    place(foodEl, food);
  };
  const free = ([x, y]: number[]) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom && !body.some(([u, v]) => u === x && v === y);
  const step = () => {
    const [hx, hy] = body[0];
    const toward = [[Math.sign(food[0] - hx), 0], [0, Math.sign(food[1] - hy)]].filter(([a, c]) => a || c);
    if (Math.abs(food[1] - hy) > Math.abs(food[0] - hx)) toward.reverse();
    const all = [dir, ...toward, [1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, c]) => !(a === -dir[0] && c === -dir[1]));
    // mostly greedy toward the block, with a little wandering so it reads as alive
    const opts = Math.random() < 0.15 ? all.slice().sort(() => Math.random() - 0.5) : [...toward, ...all];
    const next = opts.map(([a, c]) => [hx + a, hy + c]).find(free);
    if (!next) { body = body.slice(0, MIN).reverse(); dir = [-dir[0], -dir[1]]; return draw(); }
    dir = [next[0] - hx, next[1] - hy];
    body.unshift(next);
    if (next[0] === food[0] && next[1] === food[1]) {
      do food = [rnd(b.left, b.right), rnd(b.top, b.bottom)]; while (!free(food));
      if (body.length > MAX) body = body.slice(0, MIN);
    } else body.pop();
    draw();
  };
  draw();
  if (reduce) return () => field.replaceChildren();
  let timer = 0, visible = true;
  const run = () => { clearInterval(timer); timer = visible && !document.hidden ? window.setInterval(step, 150) : 0; };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; run(); });
  io.observe(hero);
  const onVis = () => run();
  const onResize = () => { b = box(); if (!b.ok) { clearInterval(timer); field.replaceChildren(); } };
  document.addEventListener("visibilitychange", onVis);
  addEventListener("resize", onResize);
  run();
  return () => { clearInterval(timer); io.disconnect(); document.removeEventListener("visibilitychange", onVis); removeEventListener("resize", onResize); field.replaceChildren(); };
}
