"""Хук MkDocs для поисковиков и превью ссылок.

1. robots.txt со ссылкой на карту сайта — адрес берётся из site_url, поэтому при смене
   домена (переезд на 4barcode.ru) ничего править не нужно.
2. Разметка Schema.org (JSON-LD) в page.meta["jsonld"], её выводит overrides/main.html:
   * хлебные крошки (BreadcrumbList) — на всех страницах, кроме главной;
   * WebSite — на главной;
   * FAQPage — на страницах «Частые проблемы»: вопрос — заголовок ##, ответ — текст под ним.
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


def _faq(content):
    """Пары вопрос–ответ: <h2> и всё до следующего <h2>."""
    parts = re.split(r'<h2 id="[^"]*">(.*?)</h2>', content, flags=re.S)
    out = []
    for i in range(1, len(parts) - 1, 2):
        q = _text(re.sub(r'<a class="headerlink".*?</a>', "", parts[i]))
        a = _text(parts[i + 1])
        if q and a:
            if len(a) > MAX_ANSWER:
                a = a[:MAX_ANSWER].rsplit(" ", 1)[0] + "…"
            out.append({"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}})
    return out


def on_page_content(html_, page, config, files):
    if page.file.src_uri.startswith("faq/") and not page.is_index:
        qa = _faq(html_)
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
