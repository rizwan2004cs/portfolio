"""Adds his two Novulis roles to his own resume (resume/original.pdf) and changes nothing else.

Word drew every element as its own `q … Q` block. Blocks above the Supraja entry are left exactly as they are;
blocks below get one translate in front of them (moved down by two lines); blocks that would run past the
original bottom margin go to page 2. No existing drawing instruction is rewritten, so the text renders as it
did, only lower. The two new lines use Calibri like the rest of the page.
Run: .scratch/pdfenv/bin/python resume/add-novulis.py  →  public/resume.pdf
"""
import pikepdf
import pymupdf as fitz

SRC, MID, OUT = "resume/original.pdf", ".scratch/resume-shifted.pdf", "public/resume.pdf"
FONTS = "/Applications/Microsoft PowerPoint.app/Contents/Resources/DFonts/"
H = 24.96          # two lines of 12.48pt: a whole number of pixels at 150 dpi, so shifted text renders identically
CUT = 322.0        # top-down y between the "Internship Experience" heading (rule at 315.7) and the Supraja line
LAST = 770.6       # the original bottom margin: the last line on page 1 ends here
PAGE_H = 792.0

def top_of(ops):
    """Top-down y of a block: its text origin, its image, or its rule (the full-page clip rectangle is ignored)."""
    for o in ops:
        op = str(o.operator)
        if op == "Tm" and len(o.operands) == 6: return PAGE_H - float(o.operands[5]), "text"
        if op == "cm" and len(o.operands) == 6: return PAGE_H - float(o.operands[5]) - float(o.operands[3]), "image"
        if op in ("m", "l") and len(o.operands) == 2: return PAGE_H - float(o.operands[1]), "path"
        if op == "re" and len(o.operands) == 4 and not (float(o.operands[2]) >= 600 and float(o.operands[3]) >= 780): return PAGE_H - float(o.operands[1]) - float(o.operands[3]), "path"
    return None, None

pdf = pikepdf.open(SRC)
page = pdf.pages[0]
ops = list(pikepdf.parse_content_stream(page))

# split into top-level q … Q blocks (marked-content wrappers and loose state ops stay where they are)
# Word also draws the section rules as free-standing paths (m … l … S) outside any block: those become their own
# group, wrapped in q … Q when moved so the translate touches nothing else
PAINT = {"S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"}
items, depth, cur, path = [], 0, None, None
for o in ops:
    op = str(o.operator)
    if path is not None:
        path.append(o)
        if op in PAINT: items.append(("path", path)); path = None
        continue
    if op == "q" and depth == 0: cur = [o]; depth = 1; continue
    if cur is not None:
        cur.append(o)
        depth += op == "q"; depth -= op == "Q"
        if depth == 0: items.append(("block", cur)); cur = None
        continue
    if op in ("m", "re"): path = [o]; continue
    items.append(("op", o))

translate = lambda dy: pikepdf.ContentStreamInstruction([1, 0, 0, 1, 0, dy], pikepdf.Operator("cm"))
page1, page2, moved_first = [], [], None
Q, Qop = pikepdf.ContentStreamInstruction([], pikepdf.Operator("q")), pikepdf.ContentStreamInstruction([], pikepdf.Operator("Q"))
for kind, it in items:
    if kind == "op": page1.append(it); continue
    if kind == "path": it = [Q, *it, Qop]                       # isolate a free-standing path so it can be moved alone
    y, what = top_of(it)
    if y is None or y < CUT:
        page1.extend(it); continue
    bottom = y + (10 if what == "text" else 0)
    if bottom + H <= LAST:
        page1.extend([it[0], translate(-H), *it[1:]])          # same block, drawn H lower
    else:
        moved_first = y if moved_first is None else min(moved_first, y)
        page2.append(it)

page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(page1))
if page2:
    lift = round((moved_first - 59.7) / 0.48) * 0.48   # near his name's height on page 1; whole pixels so text renders identically
    body = []
    for blk in page2:
        body.extend([blk[0], translate(lift), *blk[1:]])
    new = pikepdf.Dictionary(Type=pikepdf.Name.Page, MediaBox=page.MediaBox, Resources=page.Resources,
                             Contents=pdf.make_stream(pikepdf.unparse_content_stream(body)))
    pdf.pages.append(pikepdf.Page(new))
pdf.save(MID)

# the two Novulis lines, in the Supraja line's style, in the gap that opened above it
doc = fitz.open(MID)
p = doc[0]
FILES = {"cb": "Calibrib.ttf", "cr": "Calibri.ttf", "ci": "Calibrii.ttf"}
METRICS = {k: fitz.Font(fontfile=FONTS + v) for k, v in FILES.items()}
for k, v in FILES.items():
    p.insert_font(fontname=k, fontfile=FONTS + v)
SIZE, BASE = 9.78, 331.5   # the Supraja line's size and baseline (it now sits H lower)
for i, (title, company, dates) in enumerate([("Associate Software Engineer (R&D)", "Novulis Consulting, Bengaluru", "Jun 2026 – Present"),
                                             ("Software Engineering Intern (R&D)", "Novulis Consulting, Remote", "Mar 2026 – May 2026")]):
    y, x = BASE + i * (H / 2), 67.0
    for text, f in ((title + " ", "cb"), ("— ", "cr"), (company, "ci")):
        p.insert_text((x, y), text, fontname=f, fontsize=SIZE, color=(0, 0, 0))
        x += METRICS[f].text_length(text, fontsize=SIZE)
    p.insert_text((397.1, y), dates, fontname="ci", fontsize=SIZE, color=(0, 0, 0))
doc.subset_fonts()                 # embed only the glyphs used (keeps the file near the original size)
doc.save(OUT, garbage=3, deflate=True)
print("written", OUT, "pages", len(doc), "moved to page 2:", len(page2), "blocks", "lift", round(lift, 2) if page2 else 0)
