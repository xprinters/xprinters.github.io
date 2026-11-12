"""Собирает PDF бумажной инструкции Xprinter A4 из guide.html (Edge через Playwright).

Запуск:  python tools/print/v3-guide/build.py
Результат: tools/print/v3-guide/Xprinter_A4_guide.pdf и превью preview-1.png, preview-2.png.
Проверяет, что текст ни на одной полосе не вылез за её границы.
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "Xprinter_A4_guide.pdf"

with sync_playwright() as p:
    br = p.chromium.launch(channel="msedge")
    pg = br.new_page()
    pg.goto(HERE.joinpath("guide.html").as_uri())
    pg.wait_for_load_state("networkidle")
    pg.evaluate("document.fonts.ready")
    over = pg.evaluate("""() => [...document.querySelectorAll('.panel')].map((el, i) => {
        const pad = parseFloat(getComputedStyle(el).paddingBottom);
        return { i, over: Math.round(el.scrollHeight - el.clientHeight), free: Math.round(el.clientHeight - pad - [...el.children]
          .filter(c => !['num', 'foot', 'run'].some(k => c.classList.contains(k))).reduce((m, c) => Math.max(m, c.offsetTop + c.offsetHeight), 0)) };
    })""")
    pg.pdf(path=str(OUT), width="480mm", height="105mm", print_background=True, prefer_css_page_size=True)
    br.close()

names = ["обложка"] + ["стр. %d" % i for i in range(1, 11)] + ["задняя обложка"]
bad = False
for o in over:
    state = "ВЫЛЕЗАЕТ на %d px" % o["over"] if o["over"] > 0 or o["free"] < 0 else "свободно %d px" % o["free"]
    bad |= o["over"] > 0 or o["free"] < 0
    print("%-15s %s" % (names[o["i"]], state))

import pymupdf
doc = pymupdf.open(OUT)
for i, page in enumerate(doc):
    page.get_pixmap(dpi=110).save(HERE / ("preview-%d.png" % (i + 1)))
print("PDF:", OUT, "страниц:", doc.page_count)
sys.exit(1 if bad else 0)
