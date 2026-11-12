"""Иллюстрации инструкции Xprinter A4 (BP1) из заводского макета tmp/BP1-User manual_2.pdf.

В этой копии заводского макета подписи вокруг рисунков уже удалены, линии-выноски оставлены.
Рисунки вырезаются с разрешением 600 dpi. Номера к выноскам ставит макет (guide.html):
их координаты — в миллиметрах заводского макета, пересчитаны в проценты рисунка.
Список подписей у рисунка — запасной путь: прямоугольник закрывается белой плашкой.

Запуск:  python tools/print/v4-guide/make_figs.py
"""
import pathlib

import pymupdf

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent.parent / "tmp" / "BP1-User manual_2.pdf"   # заводской макет, подписи вокруг рисунков удалены
MM = 72 / 25.4
GRID = None   # папка для контрольных картинок с сеткой (мм) или None

# имя: (страница, рамка рисунка x0,y0,x1,y1 мм, [подписи: (x0,y0,x1,y1 мм, номер или None — просто убрать)])
FIGS = {
    "cover":     (0, (10, 47, 68, 70.5), []),
    "kit_printer": (0, (87.5, 16.5, 110.5, 26), []),
    "kit_cable": (0, (131.5, 12.5, 139.5, 28.5), []),
    "kit_roll":  (0, (96.5, 42.5, 104.5, 63.5), []),
    "kit_guide": (0, (129.5, 46.5, 144.5, 62.5), []),
    "ext":       (0, (165, 17, 219.5, 56.5), []),
    "int":       (0, (167.5, 64.5, 220, 98), []),
    "t_roll":    (0, (256.5, 21.5, 267, 42.5), []),
    "t_fold":    (0, (283, 22.5, 314, 45.6), []),
    "roll1":     (0, (244.5, 71, 274.6, 88.6), []),
    "roll3":     (0, (282.5, 70.5, 315.4, 93), []),
    "fold1":     (0, (326.5, 18.5, 390, 35.5), []),
    "fold2":     (0, (351.5, 42.5, 388.5, 64.5), []),
    "fold3":     (0, (359.5, 69.5, 381.5, 96.5), []),
    "width1":    (0, (404.5, 26.5, 450, 50.5), []),
    "width2":    (0, (404.5, 73.5, 438.5, 90.5), []),
    "width3":    (0, (443.5, 75.5, 473.5, 96.5), []),
    "xlife":     (1, (48.5, 26, 64.5, 42.5), []),
    "bt_on":     (1, (102.5, 17.5, 136, 32.5), []),
    "bt_conn":   (1, (102.5, 47.5, 136, 64.5), []),
    "charge":    (1, (166.2, 53.6, 234.4, 83.6), []),
    "clean":     (1, (250.2, 53.6, 315.8, 83.6), []),
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
