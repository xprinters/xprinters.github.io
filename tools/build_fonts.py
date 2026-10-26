"""Скачивает шрифты редактора этикеток с Google Fonts и урезает их до нужных символов.

Для каждого семейства берутся статические начертания 400 и 700, обычные и курсивные (если
есть), в TTF (jsPDF встраивает только TrueType); из них оставляются латиница, кириллица,
типографские знаки, № и ₽. Результат — docs/editor/fonts/<Файл>-Regular/Bold/Italic/BoldItalic.ttf,
файл @font-face
docs/editor/fonts/fonts.css и список лицензий docs/editor/fonts/LICENSES.txt.

Запуск: python tools/build_fonts.py
Новый шрифт — строка в FONTS и такая же строка в BUILTIN в docs/editor/editor.js.
"""

import io
import pathlib
import re
import sys
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont

sys.stdout.reconfigure(encoding="utf-8")
OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "editor" / "fonts"

# семейство, имя файла, лицензия, скачивать ли (False — оставить файлы, что уже лежат в fonts/)
FONTS = [
    ("Arimo", "Arimo", "OFL 1.1", True),
    ("Tinos", "Tinos", "OFL 1.1", True),
    ("Cousine", "Cousine", "OFL 1.1", True),
    ("Roboto Condensed", "RobotoCondensed", "OFL 1.1", True),
    ("Roboto", "Roboto", "OFL 1.1", True),
    ("Open Sans", "OpenSans", "OFL 1.1", True),
    ("Montserrat", "Montserrat", "OFL 1.1", True),
    ("PT Sans", "PTSans", "OFL 1.1", True),
    ("PT Serif", "PTSerif", "OFL 1.1", True),
    ("Inter", "Inter", "OFL 1.1", True),
    ("Rubik", "Rubik", "OFL 1.1", True),
    ("Fira Sans", "FiraSans", "OFL 1.1", True),
    ("Ubuntu", "Ubuntu", "Ubuntu Font Licence 1.0", True),
    ("Exo 2", "Exo2", "OFL 1.1", True),
    ("Roboto Slab", "RobotoSlab", "OFL 1.1", True),
    ("Oswald", "Oswald", "OFL 1.1", True),
    ("Comfortaa", "Comfortaa", "OFL 1.1", True),
    ("Caveat", "Caveat", "OFL 1.1", True),
]

# латиница, Latin-1, кириллица (+ украинская, казахская), типографика, €, ₽, №, ™, стрелки, минус
UNICODES = (
    list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x131, 0x152, 0x153, 0x2C6, 0x2DA, 0x2DC]
    + list(range(0x400, 0x460)) + [0x490, 0x491, 0x4B0, 0x4B1]
    + list(range(0x2000, 0x2070)) + [0x20AC, 0x20BD, 0x2116, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215]
)


def fetch(url):
    # без «браузерного» User-Agent Google Fonts отдаёт полные статические TTF, а не woff2-подмножества
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Python-urllib"}), timeout=60).read()


STYLES = [("Regular", "normal", "400"), ("Bold", "normal", "700"), ("Italic", "italic", "400"), ("BoldItalic", "italic", "700")]


def ttf_urls(family):
    """{'Regular': url, 'Bold': url, 'Italic': url, 'BoldItalic': url}; курсивов может не быть."""
    css = fetch("https://fonts.googleapis.com/css2?family=" + family.replace(" ", "+")
                + ":ital,wght@0,400;0,700;1,400;1,700").decode()
    found = {(st, w): u for st, w, u in re.findall(
        r"font-style: (\w+);\s*font-weight: (\d+);.*?url\((https://[^)]+\.ttf)\)", css, re.S)}
    urls = {name: found[(st, w)] for name, st, w in STYLES if (st, w) in found}
    if "Regular" not in urls or "Bold" not in urls:
        raise SystemExit(f"{family}: нет начертаний 400/700 в TTF")
    return urls


# у кого нет ₽ — знак берём у похожего шрифта (в PDF браузер подменить символ не может)
RUBLE_DONOR = {"Open Sans": "Roboto", "Ubuntu": "Roboto", "Roboto Slab": "PT Serif", "Cousine": "JetBrains Mono"}


def add_ruble(font, donor):
    """Копирует глиф ₽ из donor (TTFont того же начертания), масштабируя под unitsPerEm шрифта."""
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    from fontTools.pens.transformPen import TransformPen
    from fontTools.pens.ttGlyphPen import TTGlyphPen
    src_name = donor.getBestCmap()[0x20BD]
    for tag in ("hdmx", "LTSH", "VDMX"):   # заранее посчитанные метрики по глифам — после добавления неверны
        if tag in font:
            del font[tag]
    k = font["head"].unitsPerEm / donor["head"].unitsPerEm
    rec = DecomposingRecordingPen(donor.getGlyphSet())
    donor.getGlyphSet()[src_name].draw(rec)
    pen = TTGlyphPen(None)
    rec.replay(TransformPen(pen, (k, 0, 0, k, 0, 0)))
    name = "uni20BD"
    font["glyf"][name] = pen.glyph()
    font["glyf"][name].recalcBounds(font["glyf"])
    adv, _lsb = donor["hmtx"][src_name]
    font["hmtx"][name] = (round(adv * k), font["glyf"][name].xMin)
    if name not in font.getGlyphOrder():   # glyf обычно уже дописал его в общий порядок глифов
        font.setGlyphOrder(font.getGlyphOrder() + [name])
    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[0x20BD] = name


def make_subset(data, path, donor=None):
    font = TTFont(io.BytesIO(data))
    if donor is not None and 0x20BD not in font.getBestCmap():
        add_ruble(font, donor)
    if "fvar" in font:
        raise SystemExit(f"{path.name}: вариативный шрифт, нужен статический")
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    cmap = font.getBestCmap()
    missing = [c for c in (0x0416, 0x044F, 0x2116) if c not in cmap]   # Ж, я, №
    if missing:
        raise SystemExit(f"{path.name}: нет символов {', '.join('U+%04X' % c for c in missing)}")
    font.save(path)
    return path.stat().st_size, 0x20BD in cmap


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    donors = {}
    for family, file, _lic, download in FONTS:
        if not download:
            continue
        urls = ttf_urls(family)
        for stale in OUT.glob(f"{file}-*.ttf"):   # курсив мог пропасть в новой версии
            stale.unlink()
        sizes = []
        for style, url in urls.items():
            donor = None
            if family in RUBLE_DONOR:
                d_urls = ttf_urls(RUBLE_DONOR[family])
                d_style = style if style in d_urls else style.replace("Italic", "") or "Regular"
                key = (RUBLE_DONOR[family], d_style)
                if key not in donors:
                    donors[key] = TTFont(io.BytesIO(fetch(d_urls[d_style])))
                donor = donors[key]
            size, rub = make_subset(fetch(url), OUT / f"{file}-{style}.ttf", donor)
            sizes.append(f"{style} {size // 1024}{'' if rub else ' без ₽'}")
        print(f"{family:18} {' · '.join(sizes)} КБ")

    css = ["/* Сгенерировано tools/build_fonts.py — не править вручную */"]
    for family, file, _lic, _dl in FONTS:
        for style, fst, weight in STYLES:
            if not (OUT / f"{file}-{style}.ttf").exists():
                continue   # курсива нет — браузер наклонит обычное начертание сам
            css.append(f'@font-face {{ font-family: "{family}"; src: url("{file}-{style}.ttf") format("truetype"); '
                       f"font-weight: {weight}; font-style: {fst}; font-display: swap; }}")
    (OUT / "fonts.css").write_text("\n".join(css) + "\n", encoding="utf-8")

    lic = ["Шрифты редактора этикеток. Источник — Google Fonts (fonts.google.com), файлы урезаны",
           "до латиницы, кириллицы и типографских знаков скриптом tools/build_fonts.py.", ""]
    lic += [f"{family} — {license}" for family, _f, license, _d in FONTS]
    lic += ["", "OFL 1.1: https://openfontlicense.org",
            "Ubuntu Font Licence 1.0: https://ubuntu.com/legal/font-licence"]
    (OUT / "LICENSES.txt").write_text("\n".join(lic) + "\n", encoding="utf-8")
    print("fonts.css и LICENSES.txt обновлены")


if __name__ == "__main__":
    main()
