"""Проверка центровки цифр и значков в кружках готового PDF инструкции.

Ищет в PDF круги диаметром 3–5 мм, рендерит каждый крупно и сравнивает центр «чернил»
знака внутри круга с центром самого круга. Печатает смещение в сотых долях мм.
Запуск:  python tools/print/v3-guide/check_circles.py
"""
import pathlib
import sys

import numpy as np
import pymupdf

HERE = pathlib.Path(__file__).resolve().parent
MM = 72 / 25.4
DPI = 2400

doc = pymupdf.open(HERE / "Xprinter_V3rev2_guide.pdf")
worst = 0
for pno, page in enumerate(doc):
    seen = []
    for d in page.get_drawings():
        r = d["rect"]
        w, h = r.width / MM, r.height / MM
        if not (3.0 <= w <= 5.0 and abs(w - h) < 0.15):
            continue
        if any(abs(r.x0 - s.x0) < 1 and abs(r.y0 - s.y0) < 1 for s in seen):
            continue
        seen.append(r)
        filled = d.get("fill") is not None and d["fill"][0] < 0.5
        pix = page.get_pixmap(dpi=DPI, clip=r, colorspace=pymupdf.csGRAY)
        a = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width)
        hgt, wid = a.shape
        yy, xx = np.mgrid[0:hgt, 0:wid]
        cx, cy, rad = (wid - 1) / 2, (hgt - 1) / 2, min(wid, hgt) / 2
        inside = (xx - cx) ** 2 + (yy - cy) ** 2 < (rad * 0.78) ** 2
        ink = (a > 128) if filled else (a < 128)   # белый знак на чёрном или чёрный на белом
        m = ink & inside
        if m.sum() < 20:
            continue
        ys, xs = np.nonzero(m)
        dx = ((xs.min() + xs.max()) / 2 - cx) / DPI * 25.4
        dy = ((ys.min() + ys.max()) / 2 - cy) / DPI * 25.4
        worst = max(worst, abs(dx), abs(dy))
        kind = "чёрный" if filled else "белый "
        flag = "  <-- " if max(abs(dx), abs(dy)) > 0.05 else ""
        print("лист %d  %s круг %.1f мм в (%5.1f; %5.1f) мм:  dx %+.2f  dy %+.2f мм%s" % (
            pno + 1, kind, w, r.x0 / MM, r.y0 / MM, dx, dy, flag))
print("наибольшее смещение: %.2f мм" % worst)
sys.exit(1 if worst > 0.05 else 0)
