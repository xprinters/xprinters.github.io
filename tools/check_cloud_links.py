"""Проверяет, что все ссылки на Облако Mail.ru в собранном сайте живые.

Запуск (после `mkdocs build`):
    python tools/check_cloud_links.py
"""

import json
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent / "site"
PREFIX = "https://cloud.mail.ru/public/"
API = "https://cloud.mail.ru/api/v4/public/list?limit=1&weblink="

sys.stdout.reconfigure(encoding="utf-8")

links = {}
for page in ROOT.rglob("*.html"):
    for href in re.findall(r'href="(https://cloud\.mail\.ru/public/[^"]+)"', page.read_text("utf-8")):
        links.setdefault(href, set()).add(str(page.relative_to(ROOT).parent))

broken = 0
for href in sorted(links):
    weblink = urllib.parse.unquote(href[len(PREFIX):])
    try:
        urllib.request.urlopen(API + urllib.parse.quote(weblink, safe="/"), timeout=30).read()
    except urllib.error.HTTPError as e:
        broken += 1
        print(f"НЕ НАЙДЕНО ({e.code}): {weblink}  ← {', '.join(sorted(links[href]))}")

print(f"Проверено ссылок: {len(links)}, битых: {broken}")
sys.exit(1 if broken else 0)
