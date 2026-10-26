// Prints resume/resume-v2.html to resume/Syed-Mohammad-Rizwan-Resume.pdf with Chrome: exactly one US Letter page.
// Does not touch the site's public/resume.pdf; that is swapped in only after he approves.
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const out = join(root, "resume/Syed-Mohammad-Rizwan-Resume.pdf");
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(pathToFileURL(join(root, "resume/resume-v2.html")).href);
await page.evaluate(() => document.fonts.ready);

// ATS: a right-aligned date sits across a wide empty gap from its title, so layout-based extractors
// (pdfminer, used by many resume parsers) read it as a separate text block and move it below the bullets.
// Fill each gap with ordinary spaces in the title's font so title and date are one text line in the PDF.
// Looks identical: the date keeps its exact right-aligned position.
await page.evaluate(() => {
  for (const row of document.querySelectorAll(".row")) {
    const t = row.querySelector(".t"), d = row.querySelector(".d");
    if (!t || !d) continue;
    const fill = document.createElement("span");
    fill.style.cssText = "white-space:pre;flex:none;font-style:normal;font-weight:400";
    row.insertBefore(fill, d);
    row.style.gap = "0";
    d.style.minWidth = "0"; // the date stays flush right; its box now hugs the text so no gap is left before it
    fill.textContent = " ";
    const space = fill.getBoundingClientRect().width;
    const range = document.createRange();
    range.selectNodeContents(t);
    const titleEnd = Math.max(...[...range.getClientRects()].map((r) => r.right));
    range.selectNodeContents(d);
    const dateStart = Math.min(...[...range.getClientRects()].map((r) => r.left));
    fill.textContent = " ".repeat(Math.max(1, Math.floor((dateStart - titleEnd) / space) - 1));
  }
});

// one page or nothing: the last line of content must end above the bottom margin of the US Letter page
const spare = await page.evaluate(() => {
  const b = document.body;
  const bottom = Math.max(...[...b.children].map((e) => e.getBoundingClientRect().bottom));
  const rowsWrapped = [...document.querySelectorAll(".row")].some((r) => r.getBoundingClientRect().height > 20);
  if (rowsWrapped || b.scrollWidth > b.clientWidth) return -999;
  return Math.floor(11 * 96 - parseFloat(getComputedStyle(b).paddingBottom) - bottom);
});
// title/date pairs, used after printing to check the reading order a text extractor sees
const rows = await page.evaluate(() =>
  [...document.querySelectorAll(".row")].map((r) => [r.querySelector(".t").textContent.trim().slice(0, 25), r.querySelector(".d").textContent.trim()]));
if (spare < 0) { await browser.close(); throw new Error(`resume does not fit one page (spare ${spare}px); trim the HTML`); }
await page.pdf({ path: out, format: "Letter", printBackground: true, preferCSSPageSize: true, tagged: true });
await browser.close();

// Document properties (Chrome writes only the title). pikepdf rewrites the Info dictionary and XMP
// metadata in place; pages, fonts and text are untouched.
const py = join(root, ".scratch/pdfenv/bin/python");
if (!existsSync(py)) throw new Error(`need ${py} (python with pikepdf) to write PDF metadata`);
const meta = {
  title: "Syed Mohammad Rizwan – Resume",
  author: "Syed Mohammad Rizwan",
  subject: "Resume of Syed Mohammad Rizwan, software engineer: AI agents and full-stack development",
  keywords: "Python, TypeScript, LangGraph, multi-agent systems, RAG, LLMs, FastAPI, React, Next.js, Azure",
};
execFileSync(py, ["-I", "-c", `
import sys, json, pikepdf
path, m = sys.argv[1], json.loads(sys.argv[2])
with pikepdf.open(path, allow_overwriting_input=True) as pdf:
    assert len(pdf.pages) == 1, "resume must be one page"
    keep = {k: pdf.docinfo[k] for k in ("/Creator", "/Producer", "/CreationDate", "/ModDate") if k in pdf.docinfo}
    with pdf.open_metadata(set_pikepdf_as_editor=False) as x:
        x["dc:title"] = m["title"]
        x["dc:creator"] = [m["author"]]
        x["dc:description"] = m["subject"]
        x["pdf:Keywords"] = m["keywords"]
    for k, v in keep.items():
        pdf.docinfo[k] = v
    pdf.docinfo["/Title"] = m["title"]
    pdf.docinfo["/Author"] = m["author"]
    pdf.docinfo["/Subject"] = m["subject"]
    pdf.docinfo["/Keywords"] = m["keywords"]
    pdf.Root.Lang = pikepdf.String("en")
    pdf.Root.ViewerPreferences = pikepdf.Dictionary(DisplayDocTitle=True)
    pdf.save(path)
`, out, JSON.stringify(meta)], { stdio: "inherit" });
// ATS check: in pdftotext's plain reading order every date must come after its own title and before the next title.
try {
  const text = execFileSync("pdftotext", [out, "-"], { encoding: "utf8" });
  const lines = text.split("\n").filter((l) => l.trim());
  const bad = rows.filter(([title, date]) => {
    const i = lines.findIndex((l) => l.includes(title));
    return i < 0 || !(lines[i].includes(date) || lines[i + 1]?.trim() === date); // date on the title line or the next one
  });
  if (bad.length) console.warn("WARNING: pdftotext reads these dates out of order:", bad.map((r) => r.join(" / ")));
} catch (e) {
  if (e.code !== "ENOENT") throw e; // pdftotext not installed: skip the check
}
console.log("printed", out, `(${spare}px to spare)`);
