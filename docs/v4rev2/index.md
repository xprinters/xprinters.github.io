---
title: Xprinter V4 rev.2
seo_title: "Драйвер Xprinter V4 rev.2 — скачать, инструкция, настройка"
description: Драйверы, программы и видеоинструкции для Xprinter V4 rev.2 — термопринтер этикеток шириной до 108 мм, USB и Bluetooth
model:
  order: 4
  name: Xprinter V4 rev.2
  image: assets/models/v4rev2.png
  interfaces: [USB + Bluetooth]
  note: Прошивка Xprinter — в установщике драйвера принтер называется «Xprinter XP-428A». Этикетки шириной до 108 мм.
cloud: https://cloud.mail.ru/public/Kfzk/HHA7de4t3
---

!!! info "V4 или V4 rev.2?"

    **Rev.2** указан на обложке бумажной инструкции, а установщик драйвера находит принтер как **Xprinter XP-428A**.
    Если установщик показывает **4BARCODE 4B-2064C** — у вас [Xprinter V4](../v4/index.md) первой ревизии, драйвер для неё другой.
    Не уверены — [определите модель](../detect/index.md) автоматически.

## Драйвер

=== ":fontawesome-brands-windows: Windows"

    | Система | Драйвер | |
    |---|---|---|
    | **Windows 7–11** | Xprinter 12.6 <span class="xp-new">актуальный</span> | [Скачать](<cloud:Драйвер/Windows/Windows 7-11/Xprinter_12.6.exe>){ .md-button .md-button--primary } |

    Установщик сам найдёт принтер по USB как **Xprinter XP-428A**. По Bluetooth принтер виден как **Printer001** или **XP-428A**, PIN-код **0000**.

=== ":fontawesome-brands-apple: macOS"

    Драйвер Xprinter `net.xprinter.drv_3.13.1` и тестовые этикетки.

    [Скачать для macOS](cloud:Драйвер/MacOS){ .md-button .md-button--primary }

## Кнопка FEED

FEED — единственная кнопка, сверху на крышке принтера. Выключатель питания — сзади: **I** — включено, **O** — выключено.

| Действие | Как |
|---|---|
| Калибровка | Рулон установлен. На **выключенном** принтере зажмите FEED и включите принтер. Когда прозвучит сигнал — отпустите кнопку |
| Подача | Короткое нажатие — лента до начала следующей этикетки |
| Пауза | Нажатие во время печати; индикатор мигает. Повторное нажатие продолжит печать |
| Самотест | Удерживайте FEED **6 секунд**, отпустите после **двух** сигналов |

Калибровку делайте после каждой смены рулона на другой размер.

## Видеоинструкции

<div class="grid cards xp-videos" markdown>

-   :material-play-circle: [Переустановка драйвера](<cloud:Инструкции/Переустановка драйвера.mp4>)
-   :material-play-circle: [Установка Bluetooth-драйвера](<cloud:Инструкции/УСТАНОВКА BLUETOOTH_драйвера.mp4>)
-   :material-play-circle: [Печать с телефона в 4BarCode](<cloud:/biAt/tnWUDxjwK/Софт/Android/4BarCode.mp4>)
-   :material-play-circle: [Установка BarTender](<cloud:/biAt/tnWUDxjwK/Софт/Bartender/Установка.mp4>)
-   :material-play-circle: [Создание этикеток в BarTender](<cloud:/biAt/tnWUDxjwK/Софт/Bartender/Создание этикеток.mp4>)

</div>

## Программы для этикеток

### BarTender для Windows

BarTender 11.4: бесплатная бессрочная лицензия **UltraLite**.

1. Скачайте и установите BarTender — установщик один для всех редакций, поэтому в названии файла стоит «Full».
2. При активации введите ключ из файла `КЛЮЧ_ЛИЦЕНЗИИ.txt` из той же папки.
3. Ключ включит редакцию UltraLite. Её возможностей хватает для печати этикеток.

[Скачать BarTender](<cloud:/biAt/tnWUDxjwK/Софт/Bartender>){ .md-button .md-button--primary }

### Телефон и веб

--8<-- "apps.md"

--8<-- "help.md"
