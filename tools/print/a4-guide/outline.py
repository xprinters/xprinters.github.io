"""Переводит текст PDF инструкции в кривые — файл для типографии.

Берёт Xprinter_A4_guide.pdf (собран build.py), убирает текстовый слой и рисует на месте каждого
знака его контур из того же файла шрифта (docs/editor/fonts). Картинки и графика не меняются.
Затем сравнивает растр исходного и нового файла: внешне они должны совпадать.

Запуск:  python tools/print/v3-guide/outline.py
Результат: Xprinter_A4_guide_curves.pdf
"""
import pathlib
import re
import sys

import numpy as np
import pymupdf
from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont

HERE = pathlib.Path(__file__).resolve().parent
FONTS = HERE.parent.parent.parent / "docs" / "editor" / "fonts"
SRC = HERE / "Xprinter_A4_guide.pdf"
OUT = HERE / "Xprinter_A4_guide_curves.pdf"

_fonts = {}


def font_for(name):
    """'AAAAAA+Rubik-Regular' -> TTFont из docs/editor/fonts."""
    base = re.sub(r"^[A-Z]{6}\+", "", name)
    if base not in _fonts:
        path = FONTS / (base + ".ttf")
        if not path.exists():
            raise SystemExit("нет файла шрифта для «%s»: %s" % (name, path))
        f = TTFont(str(path))
        _fonts[base] = (f, f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm)
    return _fonts[base]


class ShapePen(BasePen):
    """Контур глифа -> пути pymupdf.Shape (квадратичные сегменты TrueType переводятся в кубические)."""

    def __init__(self, glyphset, shape, tf):
        super().__init__(glyphset)
        self.sh, self.tf, self.cur, self.start = shape, tf, None, None

    def _moveTo(self, p):
        self.cur = self.start = p

    def _lineTo(self, p):
        self.sh.draw_line(self.tf(self.cur), self.tf(p))
        self.cur = p

    def _curveToOne(self, c1, c2, p):
        self.sh.draw_bezier(self.tf(self.cur), self.tf(c1), self.tf(c2), self.tf(p))
        self.cur = p

    def _qCurveToOne(self, q, p):
        p0 = self.cur
        c1 = (p0[0] + 2 / 3 * (q[0] - p0[0]), p0[1] + 2 / 3 * (q[1] - p0[1]))
        c2 = (p[0] + 2 / 3 * (q[0] - p[0]), p[1] + 2 / 3 * (q[1] - p[1]))
        self._curveToOne(c1, c2, p)

    def _closePath(self):
        if self.cur != self.start:
            self._lineTo(self.start)
        self.cur = self.start


def rgb(c):
    return ((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255


def main():
    doc = pymupdf.open(SRC)
    glyphs = 0
    for page in doc:
        chars = []
        for block in page.get_text("rawdict")["blocks"]:
            for line in block.get("lines", []):
                dx, dy = line["dir"]
                for span in line["spans"]:
                    for ch in span["chars"]:
                        if ch["c"].strip():
                            chars.append((ch["c"], ch["origin"], (dx, dy), span["size"], span["font"], span["color"]))
        # убрать текст, оставив картинки и графику
        page.add_redact_annot(page.rect)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE,
                              text=pymupdf.PDF_REDACT_TEXT_REMOVE)
        shape = page.new_shape()
        for c, (ox, oy), (dx, dy), size, fname, color in chars:
            font, gs, cmap, upm = font_for(fname)
            gname = cmap.get(ord(c))
            if gname is None:
                raise SystemExit("в шрифте %s нет знака «%s»" % (fname, c))
            s = size / upm
            ux, uy = dy, -dx   # «вверх» для глифа в координатах страницы (y вниз)

            def tf(p, ox=ox, oy=oy, s=s, dx=dx, dy=dy, ux=ux, uy=uy):
                return pymupdf.Point(ox + p[0] * s * dx + p[1] * s * ux, oy + p[0] * s * dy + p[1] * s * uy)

            gs[gname].draw(ShapePen(gs, shape, tf))
            shape.finish(fill=rgb(color), color=None, even_odd=False, closePath=True, width=0)
            glyphs += 1
        shape.commit()
    doc.save(OUT, garbage=4, deflate=True)
    print("знаков переведено в кривые:", glyphs)

    # проверка: в новом файле нет шрифтов и текста, растр совпадает с исходным
    a, b = pymupdf.open(SRC), pymupdf.open(OUT)
    fonts = sum(len(p.get_fonts()) for p in b)
    text = sum(len(p.get_text().strip()) for p in b)
    # растр 300 dpi, усреднённый блоками 4×4 точки (≈ 0,34 мм): отличия сглаживания на краях букв
    # (текст и контуры рисуются чуть по-разному) уходят, а пропавшая или сдвинутая буква — нет
    worst = 0.0
    for pa, pb in zip(a, b):
        imgs = []
        for p in (pa, pb):
            px = p.get_pixmap(dpi=300, colorspace=pymupdf.csGRAY)
            im = np.frombuffer(px.samples, np.uint8).reshape(px.height, px.width).astype(float)
            h, w = im.shape[0] // 4 * 4, im.shape[1] // 4 * 4
            imgs.append(im[:h, :w].reshape(h // 4, 4, w // 4, 4).mean(axis=(1, 3)))
        h = min(imgs[0].shape[0], imgs[1].shape[0]); w = min(imgs[0].shape[1], imgs[1].shape[1])   # новый лист на 0,1 мм выше
        worst = max(worst, (np.abs(imgs[0][:h, :w] - imgs[1][:h, :w]) > 48).mean() * 100)
    print("шрифтов в файле: %d, текста: %d знаков, отличающихся участков: %.3f %%" % (fonts, text, worst))
    ok = fonts == 0 and text == 0 and worst < 0.01
    print("OK:", OUT if ok else "ПРОВЕРЬТЕ РЕЗУЛЬТАТ")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
