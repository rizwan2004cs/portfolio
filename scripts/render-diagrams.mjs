// Pre-renders every project's Mermaid diagrams to static SVG (public/diagrams/<id>-<i>.svg).
// Runs at author time, not build time: the SVGs are committed so the deploy needs no browser.
// Chrome: set PUPPETEER_EXECUTABLE_PATH, or the macOS default below is used.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const { projects } = JSON.parse(readFileSync(join(root, "src/content/projects.json"), "utf8"));
const out = join(root, "public/diagrams");
mkdirSync(out, { recursive: true });

const chrome = process.env.PUPPETEER_EXECUTABLE_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
if (!existsSync(chrome)) throw new Error(`Chrome not found at ${chrome}; set PUPPETEER_EXECUTABLE_PATH`);
const work = join(tmpdir(), `diagrams-${process.pid}`);
mkdirSync(work, { recursive: true });
const puppeteerCfg = join(work, "puppeteer.json");
writeFileSync(puppeteerCfg, JSON.stringify({ executablePath: chrome, args: ["--no-sandbox"], headless: "new" }));
// site palette: ink on warm paper, square corners, Geist-like stack
const mermaidCfg = join(work, "mermaid.json");
writeFileSync(mermaidCfg, JSON.stringify({
  theme: "base",
  fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif",
  themeVariables: { background: "#f9f8f5", primaryColor: "#eeece8", primaryBorderColor: "#171717", primaryTextColor: "#171717", lineColor: "#4f4d48", secondaryColor: "#f9f8f5", tertiaryColor: "#f9f8f5", fontSize: "14px" },
  flowchart: { curve: "basis", htmlLabels: false },
}));

const mmdc = join(root, "node_modules/.bin/mmdc");
let n = 0;
const sizes = {};
for (const p of projects) {
  for (const [i, d] of (p.diagrams ?? []).entries()) {
    const src = join(work, `${p.id}-${i}.mmd`), dst = join(out, `${p.id}-${i}.svg`);
    writeFileSync(src, d.mermaid);
    execFileSync(mmdc, ["-i", src, "-o", dst, "-p", puppeteerCfg, "-c", mermaidCfg, "-b", "transparent", "-q"], { stdio: "inherit" });
    // give the SVG its real size (Mermaid writes width="100%"), so <img> knows the aspect ratio and pages can cap its height
    const svg = readFileSync(dst, "utf8");
    const [, , w, h] = svg.match(/viewBox="([\d.-]+) ([\d.-]+) ([\d.]+) ([\d.]+)"/)?.slice(1).map(Number) ?? [];
    if (!w || !h) throw new Error(`${p.id}-${i}: no viewBox`);
    writeFileSync(dst, svg.replace(/^<svg([^>]*?) width="100%"/, `<svg$1 width="${Math.round(w)}" height="${Math.round(h)}"`).replace(/ style="max-width:[^"]*"/, ""));
    sizes[`${p.id}-${i}`] = [Math.round(w), Math.round(h)];
    console.log(`✓ ${p.id}-${i}.svg  ${d.title}`);
    n++;
  }
}
rmSync(work, { recursive: true, force: true });
writeFileSync(join(root, "src/content/diagram-sizes.json"), JSON.stringify(sizes, null, 2) + "\n");
console.log(`${n} diagram${n === 1 ? "" : "s"} rendered to public/diagrams`);
