// Renders public/resume.pdf to page images (1× and 2×) plus its text, for the inline resume viewer.
// Author-time like the diagrams: needs poppler (pdftoppm, pdftotext, pdfinfo). Re-run after updating the PDF.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const pdf = join(root, "public/resume.pdf"), out = join(root, "public/resume");
mkdirSync(out, { recursive: true });
const pages = Number(execFileSync("pdfinfo", [pdf]).toString().match(/Pages:\s+(\d+)/)[1]);
const sizes = [];
for (let n = 1; n <= pages; n++) {
  for (const [dpi, suffix] of [[150, ""], [300, "@2x"]]) {
    execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-f", String(n), "-l", String(n), "-singlefile", pdf, join(out, `page-${n}${suffix}`)]);
  }
  const png = readFileSync(join(out, `page-${n}.png`));
  sizes.push([png.readUInt32BE(16), png.readUInt32BE(20)]); // PNG IHDR width/height
}
const text = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString().replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
const kb = Math.round(statSync(pdf).size / 1024);
writeFileSync(join(root, "src/content/resume.json"), JSON.stringify({ pages, sizes, kb, text }, null, 2) + "\n");
console.log(`resume: ${pages} page${pages > 1 ? "s" : ""}, ${kb} KB → public/resume/`);
