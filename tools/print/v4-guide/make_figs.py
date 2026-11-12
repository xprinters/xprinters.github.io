"""Иллюстрации инструкции XP-428A (V4 rev.2) из заводского макета tmp/428A-User Manual_2.pdf.

В этой копии заводского макета подписи вокруг рисунков уже удалены, линии-выноски оставлены.
Рисунки вырезаются с разрешением 600 dpi. Номера к выноскам ставит макет (guide.html):
их координаты — в миллиметрах заводского макета, пересчитаны в проценты рисунка.
Список подписей у рисунка — запасной путь: прямоугольник закрывается белой плашкой.

Запуск:  python tools/print/v4-guide/make_figs.py
"""
import pathlib

import pymupdf

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent.parent / "tmp" / "428A-User Manual_2.pdf"   # заводской макет, подписи вокруг рисунков удалены
MM = 72 / 25.4
GRID = None   # папка для контрольных картинок с сеткой (мм) или None

# имя: (страница, рамка рисунка x0,y0,x1,y1 мм, [подписи: (x0,y0,x1,y1 мм, номер или None — просто убрать)])
FIGS = {
    "views": (0, (72, 11, 138, 86), []),
    "roll": (0, (210.5, 20.4, 280, 39.3), []),
    "open": (0, (240.5, 47.6, 276, 69.4), []),
    "inside": (0, (213.5, 84.4, 281, 111), [((213.5, 84.4, 238.0, 85.5), None)]),   # хвост строки текста над рисунком
    "close": (1, (17, 11.4, 43, 31.6), []),
}


def main():
    doc = pymupdf.open(SRC)
    for name, (pno, box, labs) in FIGS.items():
        page = doc[pno]
        for (x0, y0, x1, y1), _ in labs:
            page.draw_rect(pymupdf.Rect(x0 * MM, y0 * MM, x1 * MM, y1 * MM), color=None, fill=(1, 1, 1), overlay=True)
        clip = pymupdf.Rect(*(v * MM for v in box))
        page.get_pixmap(dpi=600, clip=clip, alpha=False).save(HERE / "img" / (name + ".png"))
        if GRID:
            from PIL import Image, ImageDraw
            pix = page.get_pixmap(dpi=200, clip=clip, alpha=False)
            im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples); dr = ImageDraw.Draw(im); k = pix.width / (box[2] - box[0])
            for v in range(int(box[0]), int(box[2]) + 1):
                X = (v - box[0]) * k
                dr.line([(X, 0), (X, im.height)], fill=(255, 0, 0) if v % 5 == 0 else (255, 215, 215)); v % 5 == 0 and dr.text((X + 1, 1), str(v), fill=(255, 0, 0))
            for v in range(int(box[1]), int(box[3]) + 1):
                Y = (v - box[1]) * k
                dr.line([(0, Y), (im.width, Y)], fill=(0, 0, 255) if v % 5 == 0 else (215, 215, 255)); v % 5 == 0 and dr.text((1, Y + 1), str(v), fill=(0, 0, 255))
            im.save(GRID / ("grid_" + name + ".png"))
    print("готово:", ", ".join(FIGS))


if __name__ == "__main__":
    main()
