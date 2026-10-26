"""Собирает библиотеку знаков для редактора этикеток.

Источники (лицензии — в tools/signs-src/CREDITS.txt):
  tools/signs-src/commons/  — знаки с Wikimedia Commons (общественное достояние / CC0)
  tools/signs-src/tabler/   — знаки ухода за изделием из Tabler Icons (MIT)

Что делает:
  * чистит SVG (метаданные редакторов, лишние атрибуты), ставит viewBox по реальным границам рисунка;
  * надписи (температура в тазике, коды переработки, возраст) рисует контурами шрифта Arimo,
    чтобы знак не зависел от шрифтов на компьютере пользователя;
  * пишет docs/editor/signs/<id>.svg и список docs/editor/signs.js.

Запуск:  python tools/build_signs.py      (нужны fonttools и playwright с установленным Edge)
"""

import json
import pathlib
import re

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "signs-src"
OUT = ROOT / "docs" / "editor" / "signs"
FONT = TTFont(str(ROOT / "docs" / "editor" / "fonts" / "Arimo-Bold.ttf"))
GLYPHS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()
UPM = FONT["head"].unitsPerEm


# ---------- текст -> контур ----------
def text_path(s, cx, baseline, size, anchor="middle", font=None):
    """Строка шрифтом (по умолчанию Arimo Bold) как SVG-путь; cx — центр (или левый край при anchor='start')."""
    font = font or FONT
    glyphs, cmap, upm = font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm
    scale = size / upm
    width = sum(glyphs[cmap[ord(ch)]].width for ch in s) * scale
    x = cx - width / 2 if anchor == "middle" else cx
    pen = SVGPathPen(glyphs)
    for ch in s:
        g = cmap[ord(ch)]
        tp = TransformPen(pen, (scale, 0, 0, -scale, x, baseline))
        glyphs[g].draw(tp)
        x += glyphs[g].width * scale
    return '<path fill="#000" d="%s"/>' % pen.getCommands()


# ---------- шрифты для знаков валют: Noto Sans Bold с Google Fonts ----------
# Скачиваются один раз и хранятся урезанными до нужных символов в tools/signs-src/fonts/ (OFL 1.1)
def noto(family, chars):
    import urllib.request
    from fontTools import subset
    path = SRC / "fonts" / (family.replace(" ", "") + "-Bold.ttf")
    if not path.exists():
        ua = {"User-Agent": "Python-urllib"}   # так Google Fonts отдаёт статический TTF
        css = urllib.request.urlopen(urllib.request.Request(
            "https://fonts.googleapis.com/css2?family=" + family.replace(" ", "+") + ":wght@700", headers=ua), timeout=60).read().decode()
        url = re.search(r"url\((https://[^)]+\.ttf)\)", css).group(1)
        import io
        font = TTFont(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=60).read()))
        sub = subset.Subsetter(subset.Options())
        sub.populate(text=chars)
        sub.subset(font)
        path.parent.mkdir(parents=True, exist_ok=True)
        font.save(path)
    return TTFont(str(path))


# ---------- чтение и чистка SVG ----------
def clean(svg):
    svg = re.sub(r"<\?xml.*?\?>|<!DOCTYPE.*?>|<!--.*?-->", "", svg, flags=re.S)
    svg = re.sub(r"<metadata.*?</metadata>|<sodipodi:namedview.*?(/>|</sodipodi:namedview>)", "", svg, flags=re.S)
    svg = re.sub(r'\s(inkscape|sodipodi):[\w-]+="[^"]*"', "", svg)
    svg = re.sub(r'\sxmlns:(dc|cc|rdf|svg|sodipodi|inkscape)="[^"]*"', "", svg)
    # служебные теги редакторов с префиксом (inkscape:perspective и т.п.)
    svg = re.sub(r"<\w+:[\w-]+\b[^>]*/>", "", svg)
    svg = re.sub(r"<(\w+):([\w-]+)\b[^>]*>.*?</\1:\2>", "", svg, flags=re.S)
    # серые уголки рамки из ISO 7000 — служебная разметка, не часть знака
    svg = re.sub(r'<g\b[^>]*stroke="#999(?:999)?"[^>]*>.*?</g>', "", svg, flags=re.S)
    return svg.strip()


def inner(svg):
    """Содержимое корневого <svg> и его viewBox (или размеры)."""
    svg = clean(svg)
    m = re.match(r"<svg\b([^>]*)>(.*)</svg>\s*$", svg, flags=re.S)
    attrs, body = m.group(1), m.group(2)
    vb = re.search(r'viewBox="([^"]+)"', attrs)
    if vb:
        vb = vb.group(1)
    else:
        w = float(re.sub(r"[a-z]+", "", re.search(r'\swidth="([^"]+)"', attrs).group(1)))
        h = float(re.sub(r"[a-z]+", "", re.search(r'\sheight="([^"]+)"', attrs).group(1)))
        vb = "0 0 %g %g" % (w, h)
    # оформление корневого тега (fill/stroke у Tabler) переносим в группу
    keep = " ".join(re.findall(r'\s((?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin)="[^"]*")', attrs))
    return body, vb, keep


def src(path):
    return (SRC / path).read_text(encoding="utf-8")


def tabler(name):
    body, vb, keep = inner(src("tabler/%s.svg" % name))
    body = body.replace('<path stroke="none" d="M0 0h24v24H0z" fill="none"/>', "")
    keep = keep.replace("currentColor", "#000")
    return '<g %s>%s</g>' % (keep, body.replace("currentColor", "#000")), vb


def commons(name):
    body, vb, keep = inner(src("commons/%s.svg" % name))
    return '<g %s>%s</g>' % (keep, body), vb


# ---------- набор знаков ----------
SIGNS = []   # (категория, id, название, тело, viewBox, отступ)


def add(cat, sid, name, body_vb, pad=None):
    body, vb = body_vb
    SIGNS.append((cat, sid, name, body, vb, pad))


# Соответствие
add("conf", "eac", "EAC — единый знак обращения ЕАЭС", commons("EAC-black-on-white"))
add("conf", "pct", "РСТ — знак соответствия ГОСТ Р", commons("Знак_соответствия"))
add("conf", "ce", "CE — соответствие требованиям ЕС", commons("Conformité_Européenne_logo_"))

# Уход за изделием (Tabler Icons) + температура цифрами
def tub_with(name, label, baseline):
    body, vb = tabler(name)
    return body + text_path(label, 12, baseline, 6.2), vb

for t in ("30", "40", "50", "60", "95"):
    add("care", "wash" + t, "Стирка %s °C" % t, tub_with("wash", t, 16.4))
for t in ("30", "40"):
    add("care", "wash%sg" % t, "Деликатная стирка %s °C" % t, tub_with("wash-press", t, 15.4))
add("care", "wash30vg", "Очень деликатная стирка 30 °C", tub_with("wash-gentle", "30", 13.4))
for sid, name, icon in [
    ("washhand", "Ручная стирка", "wash-hand"),
    ("nowash", "Не стирать", "wash-off"),
    ("bleach", "Отбеливание разрешено", "bleach"),
    ("bleachcl", "Отбеливание хлором", "bleach-chlorine"),
    ("bleachox", "Только кислородный отбеливатель", "bleach-no-chlorine"),
    ("nobleach", "Не отбеливать", "bleach-off"),
    ("tumble", "Барабанная сушка", "wash-tumble-dry"),
    ("tumble1", "Барабанная сушка, низкая температура", "wash-dry-1"),
    ("tumble2", "Барабанная сушка, обычная температура", "wash-dry-2"),
    ("notumble", "Не сушить в барабане", "wash-tumble-off"),
    ("dry", "Сушка разрешена", "wash-dry"),
    ("dryline", "Сушка на верёвке", "wash-dry-hang"),
    ("drydrip", "Сушка без отжима", "wash-dry-dip"),
    ("dryflat", "Сушка в горизонтальном положении", "wash-dry-flat"),
    ("dryshade", "Сушка в тени", "wash-dry-shade"),
    ("iron", "Глажка разрешена", "ironing"),
    ("iron1", "Глажка до 110 °C", "ironing-1"),
    ("iron2", "Глажка до 150 °C", "ironing-2"),
    ("iron3", "Глажка до 200 °C", "ironing-3"),
    ("noiron", "Не гладить", "ironing-off"),
    ("steam", "Глажка с паром", "ironing-steam"),
    ("nosteam", "Глажка без пара", "ironing-steam-off"),
    ("dc", "Профессиональная чистка", "wash-dryclean"),
    ("dcA", "Химчистка любыми растворителями (A)", "wash-dry-a"),
    ("dcP", "Химчистка (P)", "wash-dry-p"),
    ("dcF", "Химчистка углеводородами (F)", "wash-dry-f"),
    ("wcW", "Аквачистка (W)", "wash-dry-w"),
    ("nodc", "Не подвергать химчистке", "wash-dryclean-off"),
]:
    add("care", sid, name, tabler(icon))

# Манипуляционные (ISO 7000 / ГОСТ 14192)
add("handling", "fragile", "Хрупкое, обращаться осторожно", commons("ISO_7000_-_Ref-No_0621"))
add("handling", "up", "Верх", commons("ISO_7000_-_Ref-No_0623"))
add("handling", "keepdry", "Беречь от влаги", commons("ISO_7000_-_Ref-No_0626"))
add("handling", "sun", "Беречь от солнечных лучей", commons("ISO_7000_-_Ref-No_0624"))
add("handling", "nohook", "Не применять крюки", commons("ISO_7000_-_Ref-No_0622"))

# Переработка: стрелки из Plastic-recyc-06 (общественное достояние) + код и обозначение контурами
ARROWS = re.search(r"(<path stroke-width.*?/>\s*<path d=.*?/>)", src("commons/Plastic-recyc-06.svg"), flags=re.S).group(1)
add("eco", "recycle", "Пригодно для переработки (петля Мёбиуса)", commons("Recycling_symbol"))
for code, abbr, what in [("01", "PET", "полиэтилентерефталат"), ("02", "PE-HD", "полиэтилен высокой плотности"),
                         ("03", "PVC", "поливинилхлорид"), ("04", "PE-LD", "полиэтилен низкой плотности"),
                         ("05", "PP", "полипропилен"), ("06", "PS", "полистирол"), ("07", "O", "прочие пластики"),
                         ("20", "PAP", "гофрокартон"), ("21", "PAP", "картон"), ("22", "PAP", "бумага"),
                         ("40", "FE", "сталь"), ("41", "ALU", "алюминий"), ("70", "GL", "стекло")]:
    body = ARROWS + text_path(code, 50, 55, 22) + text_path(abbr, 50, 96, 20 if len(abbr) < 4 else 17)
    add("eco", "rc" + code, "%s %s — %s" % (code, abbr, what), (body, "0 0 100 100"))
add("eco", "weee", "Не выбрасывать с бытовыми отходами", commons("WEEE_symbol_vectors"))
add("eco", "tidy", "Выбрасывать в урну", commons("International_tidyman"))

# Пищевой контакт (символ ЕС «бокал и вилка»)
food_body, food_vb = commons("EU_food_contact_material_symbol")
add("food", "food", "Для контакта с пищевыми продуктами", (food_body, food_vb))
_, _, fw, fh = map(float, food_vb.split())
slash = '<path d="M%g %g L%g %g" stroke="#fff" stroke-width="%g" stroke-linecap="round"/>' \
        '<path d="M%g %g L%g %g" stroke="#000" stroke-width="%g" stroke-linecap="round"/>' % (
            fw * .08, fh * .92, fw * .92, fh * .08, fw * .11, fw * .08, fh * .92, fw * .92, fh * .08, fw * .06)
add("food", "nofood", "Не для пищевых продуктов", (food_body + slash, food_vb))

# Возраст
def age(label, cross=False):
    body = '<circle cx="50" cy="50" r="44" fill="none" stroke="#000" stroke-width="7"/>'
    if cross:
        body += '<path d="M19 81 L81 19" stroke="#000" stroke-width="7" stroke-linecap="round"/>'
        body += text_path(label, 50, 61, 34).replace('fill="#000"', 'fill="#000" stroke="#fff" stroke-width="9" paint-order="stroke"')
    else:
        body += text_path(label, 50, 63, 40 if len(label) < 3 else 34)
    return body, "0 0 100 100"

add("safety", "age03", "Не для детей до 3 лет", age("0-3", True))
for a in ("0+", "3+", "6+", "12+", "16+", "18+"):
    add("safety", "age" + a[:-1], "Возрастная маркировка " + a, age(a))

# Валюты: символ шрифтом Noto Sans Bold (армянский драм — Noto Sans Armenian)
CURRENCIES = [
    ("rub", "₽", "Российский рубль (RUB)"), ("rubtxt", "руб.", "Рубль — сокращение «руб.»"),
    ("usd", "$", "Доллар США (USD)"), ("eur", "€", "Евро (EUR)"),
    ("cny", "¥", "Китайский юань (CNY), японская иена (JPY)"),
    ("kzt", "₸", "Казахстанский тенге (KZT)"), ("byn", "Br", "Белорусский рубль (BYN)"),
    ("uzs", "сўм", "Узбекский сум (UZS)"), ("kgs", "⃀", "Киргизский сом (KGS)"),
    ("tjs", "смн", "Таджикский сомони (TJS)"), ("amd", "֏", "Армянский драм (AMD)"),
    ("azn", "₼", "Азербайджанский манат (AZN)"), ("gel", "₾", "Грузинский лари (GEL)"),
    ("uah", "₴", "Украинская гривна (UAH)"), ("mnt", "₮", "Монгольский тугрик (MNT)"),
    ("try", "₺", "Турецкая лира (TRY)"), ("gbp", "£", "Британский фунт (GBP)"),
    ("inr", "₹", "Индийская рупия (INR)"), ("krw", "₩", "Южнокорейская вона (KRW)"),
    ("btc", "₿", "Биткоин (BTC)"),
]
NOTO = noto("Noto Sans", "".join(c for _, sym, _ in CURRENCIES if sym != "֏" for c in sym))
NOTO_AM = noto("Noto Sans Armenian", "֏")
for sid, sym, name in CURRENCIES:
    add("money", "cur-" + sid, name, (text_path(sym, 0, 0, 100, font=NOTO_AM if sym == "֏" else NOTO), "0 -100 100 100"))

CATS = [("conf", "Соответствие"), ("care", "Уход за изделием"), ("handling", "Манипуляционные"),
        ("eco", "Переработка"), ("food", "Пищевой контакт"), ("safety", "Возраст"), ("money", "Валюты")]


# ---------- точные границы рисунка (считает браузер) ----------
def tight_boxes(items):
    from playwright.sync_api import sync_playwright
    html = "".join('<svg id="s%d" xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="200" height="200">'
                   '<g class="all">%s</g></svg>' % (i, vb, body) for i, (_, _, _, body, vb, _) in enumerate(items))
    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge")
        pg = b.new_page()
        pg.set_content("<!doctype html><body>" + html)
        boxes = pg.evaluate("""() => [...document.querySelectorAll('svg')].map(s => {
            const b = s.querySelector('g.all').getBBox();
            // учесть толщину линий: максимальная stroke-width среди элементов
            let sw = 0;
            s.querySelectorAll('*').forEach(e => { const v = parseFloat(getComputedStyle(e).strokeWidth) || 0;
              if (getComputedStyle(e).stroke !== 'none') sw = Math.max(sw, v); });
            return [b.x, b.y, b.width, b.height, sw];
        })""")
        b.close()
    return boxes


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.svg"):
        old.unlink()
    boxes = tight_boxes(SIGNS)
    manifest = {c: {"name": n, "items": []} for c, n in CATS}
    for (cat, sid, name, body, vb, pad), (x, y, w, h, sw) in zip(SIGNS, boxes):
        # stroke у Tabler задан на группе — getComputedStyle его видит; плюс небольшой воздух
        p = sw / 2 + max(w, h) * 0.02 if pad is None else pad
        x, y, w, h = x - p, y - p, w + 2 * p, h + 2 * p
        vb2 = "%.3f %.3f %.3f %.3f" % (x, y, w, h)
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s">%s</svg>\n' % (vb2, body)
        (OUT / (sid + ".svg")).write_text(svg, encoding="utf-8")
        manifest[cat]["items"].append({"id": sid, "name": name, "ratio": round(h / w, 4)})
    cats = [{"id": c, "name": manifest[c]["name"], "items": manifest[c]["items"]} for c, _ in CATS]
    js = ("/* Сгенерировано tools/build_signs.py — не редактировать вручную. Файлы знаков: signs/<id>.svg */\n"
          "window.XPSignList = " + json.dumps(cats, ensure_ascii=False, indent=1) + ";\n")
    (ROOT / "docs" / "editor" / "signs-list.js").write_text(js, encoding="utf-8")
    print("знаков:", len(SIGNS))


if __name__ == "__main__":
    main()
