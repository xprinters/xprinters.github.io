"""Хук MkDocs для страниц моделей.

1. Ссылки вида `cloud:Драйвер/Windows` превращаются в ссылку на папку
   в Облаке Mail.ru, заданную в шапке страницы (`cloud: https://...`).
   Если в пути есть пробелы или скобки — пишите в угловых скобках:
   [Видео](<cloud:Драйвер/Windows/Переустановка (полная).mp4>)
   Путь, начинающийся с `/`, считается от корня публичных ссылок:
   cloud:/Kfzk/HHA7de4t3/Инструкции — для ссылки в чужую папку.

2. На страницу модели (в шапке есть блок `model:`) автоматически
   добавляется заголовок с фото, интерфейсами и кнопкой «Все файлы».

3. Метка <!-- models --> заменяется сеткой карточек всех моделей.
   Карточки собираются из шапок страниц, поэтому новая модель
   появляется на главной сама — достаточно создать её страницу.
"""

import html
import re
import urllib.parse

from mkdocs.utils.meta import get_data

CLOUD_ROOT = "https://cloud.mail.ru/public/"
CLOUD_LINK = re.compile(r"\]\((?:<cloud:([^>]*)>|cloud:([^)\s]*))\)")


def _cloud_url(base, path):
    if path.startswith("/"):
        base, path = CLOUD_ROOT, path.lstrip("/")
    if not base:
        raise ValueError("cloud: ссылка на странице без поля cloud в шапке")
    url = base.rstrip("/")
    if path:
        url += "/" + urllib.parse.quote(path, safe="/")
    return url


def _prefix(page):
    # Относительный путь от страницы к корню сайта
    return "../" * page.url.count("/")


def _tags(interfaces):
    return "".join(
        f'<span class="xp-tag">{html.escape(i)}</span>' for i in interfaces or []
    )


def _model_pages(files):
    models = []
    for f in files.documentation_pages():
        with open(f.abs_src_path, encoding="utf-8") as fh:
            _, meta = get_data(fh.read())
        if isinstance(meta.get("model"), dict):
            models.append((meta["model"], f))
    models.sort(key=lambda m: (m[0].get("order", 999), m[0].get("name", "")))
    return models


def _models_grid(page, files):
    pre = _prefix(page)
    cards = []
    for model, f in _model_pages(files):
        name = html.escape(model["name"])
        cards.append(
            f'<a class="xp-model" href="{pre}{f.url}">'
            f'<span class="xp-model__img"><img src="{pre}{model["image"]}" alt="{name}" loading="lazy"></span>'
            f'<span class="xp-model__name">{name}</span>'
            f'<span class="xp-model__tags">{_tags(model.get("interfaces"))}</span>'
            f"</a>"
        )
    return '<div class="xp-models">' + "".join(cards) + "</div>"


def _model_header(page):
    model = page.meta["model"]
    name = html.escape(model["name"])
    note = model.get("note")
    button = ""
    if page.meta.get("cloud"):
        button = (
            f'<a class="md-button md-button--primary" href="{page.meta["cloud"]}">'
            f"Все файлы одной папкой</a>"
        )
    if model.get("manual"):
        button += f' <a class="md-button" href="{model["manual"]}">Инструкция (PDF)</a>'
    if model.get("youtube"):
        button += f' <a class="md-button" href="{model["youtube"]}">Видео на YouTube</a>'
    return (
        '<div class="xp-hero-model">'
        f'<div class="xp-hero-model__img"><img src="{_prefix(page)}{model["image"]}" alt="{name}"></div>'
        '<div class="xp-hero-model__body">'
        f"<h1>{name}</h1>"
        f'<div class="xp-model__tags">{_tags(model.get("interfaces"))}</div>'
        + (f'<p class="xp-hero-model__note">{html.escape(note)}</p>' if note else "")
        + f"{button}</div></div>\n\n"
    )


def on_page_markdown(markdown, page, config, files):
    base = page.meta.get("cloud")
    markdown = CLOUD_LINK.sub(
        lambda m: "](" + _cloud_url(base, m.group(1) if m.group(1) is not None else m.group(2)) + ")",
        markdown,
    )
    if "<!-- models -->" in markdown:
        markdown = markdown.replace("<!-- models -->", _models_grid(page, files))
    if isinstance(page.meta.get("model"), dict):
        markdown = _model_header(page) + markdown
    return markdown
