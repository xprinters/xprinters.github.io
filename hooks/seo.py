"""Хук MkDocs для поисковиков и превью ссылок.

1. robots.txt со ссылкой на карту сайта — адрес берётся из site_url, поэтому при смене
   домена (переезд на 4barcode.ru) ничего править не нужно.
2. Разметка Schema.org (JSON-LD) в page.meta["jsonld"], её выводит overrides/main.html:
   * хлебные крошки (BreadcrumbList) — на всех страницах, кроме главной;
   * WebSite — на главной;
   * FAQPage — на страницах «Частые проблемы»: вопрос — заголовок ##, ответ — текст под ним;
     на других страницах с полем `faq: h3` в шапке — вопросы-заголовки ### (раздел «Частые вопросы»);
   * WebApplication — на странице с полем `app:` в шапке (редактор этикеток): бесплатное веб-приложение.
3. Картинка превью (og:image) — фото модели из шапки страницы или общая assets/og.png.

SEO-заголовок страницы задаётся полем seo_title в шапке страницы (если нет — обычный title).
"""

import html
import re

MAX_ANSWER = 900   # символов ответа в FAQPage — поисковикам нужен смысл, а не вся статья


def _abs(config, url):
    return config["site_url"].rstrip("/") + "/" + url.lstrip("/")


def _text(fragment):
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", fragment, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def _faq(content, tag="h2"):
    """Пары вопрос–ответ: заголовок <tag> и всё до следующего такого же или более крупного заголовка."""
    parts = re.split(r'<%s id="[^"]*">(.*?)</%s>' % (tag, tag), content, flags=re.S)
    out = []
    for i in range(1, len(parts) - 1, 2):
        q = _text(re.sub(r'<a class="headerlink".*?</a>', "", parts[i]))
        stop = r"<h[1-%s][ >]" % tag[1] + (r"|<details" if tag == "h3" else "")   # раздел вопросов кончается перед справкой
        a = _text(re.split(stop, parts[i + 1])[0])
        if q and a:
            if len(a) > MAX_ANSWER:
                a = a[:MAX_ANSWER].rsplit(" ", 1)[0] + "…"
            out.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
    return out


def on_page_content(html_, page, config, files):
    tag = "h2" if page.file.src_uri.startswith("faq/") and not page.is_index else page.meta.get("faq")
    if tag in ("h2", "h3"):
        qa = _faq(html_, tag)
        if qa:
            page.meta["_faq"] = qa
    return html_


def on_page_context(context, page, config, nav):
    ld = []
    if page.is_homepage:
        ld.append({"@context": "https://schema.org", "@type": "WebSite", "name": config["site_name"],
                   "url": config["site_url"], "inLanguage": "ru",
                   "description": config.get("site_description") or ""})
    else:
        crumbs = [("Главная", config["site_url"])]
        for sec in reversed(page.ancestors):
            first = sec.children[0] if getattr(sec, "children", None) else None
            if first is not None and getattr(first, "is_index", False) and first is not page:
                crumbs.append((sec.title, _abs(config, first.url)))
        crumbs.append((page.meta.get("title") or page.title, page.canonical_url))
        ld.append({"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": n, "item": u} for i, (n, u) in enumerate(crumbs)]})
    app = page.meta.get("app")
    if isinstance(app, dict):
        ld.append({"@context": "https://schema.org", "@type": "WebApplication", "name": app["name"],
                   "url": page.canonical_url, "inLanguage": "ru", "applicationCategory": app.get("category", "UtilitiesApplication"),
                   "operatingSystem": "Windows, macOS, Linux (в браузере)", "browserRequirements": "Современный браузер",
                   "description": page.meta.get("description", ""), "featureList": app.get("features", []),
                   "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "RUB"}})
    if page.meta.get("_faq"):
        ld.append({"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": page.meta["_faq"]})
    page.meta["jsonld"] = ld
    model = page.meta.get("model")
    image = model.get("image") if isinstance(model, dict) and model.get("image") else "assets/og.png"
    page.meta["og_image"] = _abs(config, image)
    return context


def on_post_build(config):
    import pathlib
    robots = "User-agent: *\nAllow: /\n\nSitemap: %s\n" % _abs(config, "sitemap.xml")
    pathlib.Path(config["site_dir"], "robots.txt").write_text(robots, encoding="utf-8")
