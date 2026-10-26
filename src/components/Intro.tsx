import { MODEL_IDS } from "@/agent/models";

// First-visit intro: Rizwan's agent is drawn pixel by pixel (head traced clockwise, then antenna, ears,
// eyes that open and blink), its harness "boots" in dot-matrix type, then the panel wipes away.
// Pure CSS: it runs off the main thread while the page hydrates, never takes input, and a head
// script skips it after the first view of the session or when reduced motion is on.
const W = 13, H = 12;
type Cell = { r: number; c: number; cls?: string; span?: number; delay: number };

const outline: [number, number][] = [];
for (let r = 2; r <= 10; r++) for (let c = 1; c <= 11; c++) if (r === 2 || r === 10 || c === 1 || c === 11) outline.push([r, c]);
// clockwise from the top centre, so the head reads as being traced
const cy = 6, cx = 6;
const angle = ([r, c]: [number, number]) => (Math.atan2(c - cx, cy - r) + 2 * Math.PI) % (2 * Math.PI);
outline.sort((a, b) => angle(a) - angle(b));

const TRACE = 9; // ms per outline pixel
const T_FEATURES = outline.length * TRACE + 20;
const cells: Cell[] = [
  ...outline.map(([r, c], i) => ({ r, c, delay: i * TRACE })),
  { r: 1, c: 6, delay: T_FEATURES },
  { r: 0, c: 6, cls: "tip", delay: T_FEATURES + 40 },
  { r: 5, c: 0, delay: T_FEATURES }, { r: 6, c: 0, delay: T_FEATURES },
  { r: 5, c: 12, delay: T_FEATURES }, { r: 6, c: 12, delay: T_FEATURES },
  { r: 4, c: 3, cls: "eye", span: 2, delay: T_FEATURES + 60 },
  { r: 4, c: 8, cls: "eye", span: 2, delay: T_FEATURES + 60 },
  ...[5, 6, 7].map((c) => ({ r: 8, c, cls: "mouth", delay: T_FEATURES + 110 })),
];

const BOOT = ["scope filter", "prompt guard", "cache", MODEL_IDS[0].replace("openai/", ""), "grounding"];

// each page's intro plays once per session (its own key), never for reduced motion
const skip = (key: string) => `try{var s=sessionStorage;if(s.getItem("${key}")||matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("no-intro");s.setItem("${key}","1")}catch(e){document.documentElement.classList.add("no-intro")}`;
export const INTRO_SKIP = skip("rz_intro");

export function Intro() {
  return (
    <>
    {/* runs before the intro paints: skip it after the first agent view of the session, and for reduced motion */}
    <script dangerouslySetInnerHTML={{ __html: INTRO_SKIP }} />
    <div className="intro" aria-hidden="true">
      <div className="intro-bot" style={{ gridTemplateColumns: `repeat(${W}, 12px)`, gridTemplateRows: `repeat(${H}, 12px)` }}>
        {cells.map((x, i) => (
          <i key={i} className={x.cls} style={{ gridRow: `${x.r + 1} / span ${x.span ?? 1}`, gridColumn: `${x.c + 1} / span ${x.span ?? 1}`, animationDelay: x.cls === "eye" ? `${x.delay}ms, ${x.delay + 260}ms` : `${x.delay}ms` }} />
        ))}
      </div>
      <p className="intro-name">Rizwan’s agent</p>
      <p className="intro-boot">
        {BOOT.map((b, i) => <span key={b} style={{ animationDelay: `${160 + i * 90}ms` }}>{b} <b>✓</b></span>)}
      </p>
    </div>
    </>
  );
}

const NAME = "Syed Mohammad Rizwan";
const LETTER = 34; // ms per letter as the name types out

/** Classic's opening: his name types out in dot-matrix, a pixel bar fills, then the panel wipes up. Pure CSS. */
export function ClassicIntro() {
  return (
    <>
    <script dangerouslySetInnerHTML={{ __html: skip("rz_intro_classic") }} />
    <div className="intro intro-classic" aria-hidden="true">
      <p className="intro-title">{[...NAME].map((ch, i) => <span key={i} style={{ animationDelay: `${120 + i * LETTER}ms` }}>{ch === " " ? "\u00a0" : ch}</span>)}</p>
      <p className="intro-sub" style={{ animationDelay: `${180 + NAME.length * LETTER}ms` }}>AI engineer · Bangalore</p>
      <div className="intro-bar"><i /></div>
    </div>
    </>
  );
}
