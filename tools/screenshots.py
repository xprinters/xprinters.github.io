"""Скриншоты основных страниц сайта: десктоп и мобильный, тёмная и светлая тема.

Нужен запущенный `mkdocs serve` и пакет playwright (браузер — установленный Edge):
    pip install playwright
    python tools/screenshots.py [адрес сайта]
Результат: design/screenshots/
"""

import pathlib
import sys

from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000").rstrip("/")
OUT = pathlib.Path(__file__).resolve().parent.parent / "design" / "screenshots"

PAGES = {
    "01-glavnaya": "/",
    "02-printery": "/models/",
    "03-model-xp-365b": "/xp-365b/",
    "04-model-pocket": "/pocket/",
    "05-faq": "/faq/paper/",
    "06-podderzhka": "/support/",
}
DEVICES = {
    "desktop": dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1),
    "mobile": dict(viewport={"width": 390, "height": 844}, device_scale_factor=2,
                   is_mobile=True, has_touch=True),
}

OUT.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge")
    for scheme in ("dark", "light"):
        for device, opts in DEVICES.items():
            ctx = browser.new_context(color_scheme=scheme, **opts)
            page = ctx.new_page()
            for name, path in PAGES.items():
                page.goto(BASE + path, wait_until="load")
                page.evaluate("""() => {
                    document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager');
                    document.querySelectorAll('details').forEach(d => d.open = true);
                }""")
                page.evaluate("document.fonts.ready.then(() => true)")
                page.wait_for_function("[...document.images].every(i => i.complete)")
                file = OUT / f"{name}__{device}__{scheme}.png"
                page.screenshot(path=str(file), full_page=True)
                print(file.name)
            ctx.close()
    browser.close()
