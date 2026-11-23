"""Иллюстрации инструкции Xprinter Tattoo K82 из заводского макета tmp/K82-A4L-User Manual_notext.pdf.

В этой копии заводского макета текст удалён, линии-выноски оставлены.
Рамки-плашки вокруг шагов (скруглённые прямоугольники) закрашиваются белым — у нас своя вёрстка.
Рамка рисунка задаётся грубо, затем обрезается по краю рисунка; итоговые рамки (мм заводского
макета) пишутся в img/figs.json — по ним макет пересчитывает координаты номеров выносок.
Рисунки вырезаются с разрешением 600 dpi.

Запуск:  python tools/print/k82-guide/make_figs.py
"""
import json
import pathlib

import numpy as np
import pymupdf

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent.parent.parent / "tmp" / "K82-A4L-User Manual_notext.pdf"
MM = 72 / 25.4
PAD = 0.4   # поле вокруг рисунка после обрезки, мм

# Логотип BLACK • SAMURAI на крышке принтера на обложке (на заводе наносится шелкографией).
# Кладётся по плоскости крышки: центр, направление вдоль крышки и поперёк — от задней кромки к передней
# (снято с квадратной кнопки питания), squash — сжатие поперёк крышки в этой проекции (px рисунка при 600 dpi).
LOGO = HERE.parent.parent.parent / "tmp" / "bl_logo_tattoo.pdf"
LOGO_ON = {"cover": dict(center=(715, 238), along=(920, 304), across=(-70, 32), length=560, squash=0.85)}

# имя: (страница, грубая рамка x0,y0,x1,y1 мм)
FIGS = {
    "cover":       (0, (10, 44, 70, 73)),
    "kit_printer": (0, (88, 15, 115, 30)),
    "kit_cable":   (0, (130, 14, 141, 31)),
    "kit_paper":   (0, (94, 46, 107, 63)),
    "kit_guide":   (0, (131, 46, 145, 63)),
    "ext":         (0, (176, 18, 236, 48.5)),
    "int":         (0, (178, 67, 230, 98)),
    "layers":      (0, (245, 19, 296, 63.5)),
    "st1":         (0, (326, 13, 357, 43.6)),
    "st2":         (0, (363.5, 13, 395.5, 43.6)),
    "st3":         (0, (326, 49, 357, 79.6)),
    "st4":         (0, (363.5, 49, 395.5, 79.6)),
    "man1":        (0, (409, 13, 471, 38.2)),
    "man2":        (0, (409, 42.5, 471, 67.6)),
    "man3":        (0, (401, 72, 471, 96.9)),
    "app_icon":    (0, (526, 25, 547, 43)),
    "bt_on":       (1, (24, 18, 57, 35)),
    "bt_conn":     (1, (24, 48, 57, 65)),
    "transfer":    (1, (88, 44, 152.5, 76.8)),
    "charge":      (1, (165.8, 52.6, 234.2, 87.6)),
    "clean":       (1, (245.8, 52.6, 314.2, 87.6)),
}


def frames(page):
    """Скруглённые рамки-плашки: серая заливка-контур, крупнее 30 x 25 мм."""
    out = []
    for g in page.get_drawings():
        r, f = g["rect"], g.get("fill")
        if f and abs(f[0] - .137) < .01 and r.width > 30 * MM and r.height > 25 * MM:
            out.append(g)
    return out


def whiteout(page, g):
    sh = page.new_shape()
    for it in g["items"]:
        if it[0] == "l":
            sh.draw_line(it[1], it[2])
        elif it[0] == "c":
            sh.draw_bezier(it[1], it[2], it[3], it[4])
        elif it[0] == "re":
            sh.draw_rect(it[1])
        elif it[0] == "qu":
            sh.draw_quad(it[1])
    sh.finish(color=(1, 1, 1), width=1.6, fill=None)
    sh.commit(overlay=True)


def put_logo(path, center, along, across, length, squash=1.0):
    """Векторный логотип растрируется в 1200 dpi и кладётся аффинно по плоскости крышки."""
    from PIL import Image
    lp = pymupdf.open(LOGO)[0].get_pixmap(dpi=1200, alpha=True)
    logo = Image.frombytes("RGBA", (lp.width, lp.height), lp.samples)
    logo = logo.crop(logo.getbbox())
    im = Image.open(path).convert("RGBA")
    w, h = logo.size
    k = length / w
    u = np.array(along, float); u /= np.linalg.norm(u)
    v = np.array(across, float); v /= np.linalg.norm(v)
    inv = np.linalg.inv(np.column_stack([u * k, v * k * squash]))
    off = -inv @ np.array(center, float) + np.array([w / 2, h / 2])
    m = (inv[0, 0], inv[0, 1], off[0], inv[1, 0], inv[1, 1], off[1])
    im.alpha_composite(logo.transform(im.size, Image.AFFINE, m, resample=Image.BICUBIC))
    im.convert("RGB").save(path)


def main():
    doc = pymupdf.open(SRC)
    for page in doc:
        for g in frames(page):
            whiteout(page, g)
    boxes = {}
    for name, (pno, box) in FIGS.items():
        page = doc[pno]
        clip = pymupdf.Rect(*(v * MM for v in box))
        pix = page.get_pixmap(dpi=150, clip=clip, alpha=False, colorspace=pymupdf.csGRAY)
        a = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width) < 235
        ys, xs = np.where(a)
        k = pix.width / (box[2] - box[0])
        b = (max(box[0], box[0] + xs.min() / k - PAD), max(box[1], box[1] + ys.min() / k - PAD),
             min(box[2], box[0] + (xs.max() + 1) / k + PAD), min(box[3], box[1] + (ys.max() + 1) / k + PAD))
        boxes[name] = [round(float(v), 2) for v in b]
        page.get_pixmap(dpi=600, clip=pymupdf.Rect(*(v * MM for v in b)), alpha=False).save(HERE / "img" / (name + ".png"))
        if name in LOGO_ON:
            put_logo(HERE / "img" / (name + ".png"), **LOGO_ON[name])
    (HERE / "img" / "figs.json").write_text(json.dumps(boxes, indent=1), encoding="utf-8")
    for n, b in boxes.items():
        print("%-12s %s  %.1f x %.1f мм" % (n, b, b[2] - b[0], b[3] - b[1]))


if __name__ == "__main__":
    main()
