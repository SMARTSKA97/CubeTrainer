#!/usr/bin/env python3
"""
Extract the F2L cases from "Best F2L Algorithms" (a PDF with tables of case pictures + algorithms).

Usage: python3 tools/extract_f2l.py <Best_F2L_Algorithms.pdf> <out.json>      (needs: pip install pdfplumber)

The pictures themselves are not needed: every case is rebuilt from its algorithms by the cube
engine (inverse of the algorithm applied to a solved cube). What we take from the PDF is which
algorithms share a table cell (= the same case), the section headings, and which algorithms are
highlighted pink ("affects more than 1 slot").
"""
import json
import re
import sys
from collections import Counter

import pdfplumber

MOVE_WORD = re.compile(r"^[()UDLRFBudlrfbMESxyz0-9']+$")


def is_alg(text: str) -> bool:
    words = text.split()
    return bool(words) and all(MOVE_WORD.match(w) for w in words) and any(re.search(r"[URFDLBurfdlbMESxyz]", w) for w in words)


def is_pink(c) -> bool:
    if not c or len(c) != 3:
        return False
    r, g, b = c
    return r > 0.9 and g < 0.9 and b < 0.9 and abs(g - b) < 0.12


def main(pdf_path: str, out: str) -> None:
    cases = []
    major = section = sub = ""
    desc_pending = False
    with pdfplumber.open(pdf_path) as pdf:
        for pageno, page in enumerate(pdf.pages, 1):
            tables = page.find_tables()
            boxes = [t.bbox for t in tables]
            pinks = [r for r in page.rects if is_pink(r.get("non_stroking_color")) and r.get("fill")]

            def inside(l):
                return any(b[0] - 2 <= l["x0"] and l["x1"] <= b[2] + 2 and b[1] - 2 <= l["top"] and l["bottom"] <= b[3] + 2 for b in boxes)

            events = [("head", l["top"], l["text"]) for l in page.extract_text_lines() if not inside(l)]
            events += [("table", t.bbox[1], t) for t in tables]
            events.sort(key=lambda e: e[1])

            for kind, _, payload in events:
                if kind == "head":
                    t = payload.strip()
                    m = re.match(r"^Section (\d+):\s*(.*)$", t)
                    if m:
                        section, major, desc_pending, sub = m.group(1), m.group(2), True, ""
                        continue
                    m = re.match(r"^Section (\d[A-Z])$", t)
                    if m:
                        section, desc_pending, sub = m.group(1), True, ""
                        continue
                    if desc_pending:
                        desc_pending = False
                        continue
                    if t and not t.startswith(("http", "Updated", "Tutorial", "Learn", "How to", "Highlighted", "I recommend", "This algorithm", "41 ", "36 ")):
                        sub = t
                    continue

                table = payload
                for row in table.rows:
                    for cell in row.cells:
                        if cell is None:
                            continue
                        crop = page.crop(cell)
                        lines = [l for l in crop.extract_text_lines() if is_alg(l["text"])]
                        if not lines:
                            continue
                        algs = []
                        for l in lines:
                            mid_y = (l["top"] + l["bottom"]) / 2
                            multi = any(p["x0"] - 1 <= l["x0"] and l["x1"] <= p["x1"] + 1 and p["top"] - 1 <= mid_y <= p["bottom"] + 1 for p in pinks)
                            algs.append({"text": re.sub(r"\s+", " ", l["text"]).strip(), "multi": multi})
                        cases.append(
                            {
                                "page": pageno,
                                "major": major,
                                "section": section,
                                "sub": sub,
                                "column": "left" if cell[0] < page.width * 0.5 else "right",
                                "algs": algs,
                            }
                        )

    json.dump(cases, open(out, "w"), indent=1, ensure_ascii=False)
    print(len(cases), "cells,", sum(len(c["algs"]) for c in cases), "algorithms,", sum(a["multi"] for c in cases for a in c["algs"]), "highlighted")
    for k, v in Counter((c["major"], c["section"], c["sub"]) for c in cases).items():
        print(f"  {v:3d}  {k}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
