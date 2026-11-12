---
title: Xprinter V3 rev.2
seo_title: "Драйвер Xprinter V3 rev.2 — скачать, инструкция, настройка"
description: Драйверы, программы и видеоинструкции для Xprinter V3 rev.2 (прошивка Xprinter)
model:
  order: 3
  name: Xprinter V3 rev.2
  image: assets/models/v3.png
  interfaces: [USB, USB + Bluetooth]
  note: Прошивка Xprinter — в установщике драйвера принтер называется «Xprinter XP-Q361U»
cloud: https://cloud.mail.ru/public/Kfzk/HHA7de4t3
---

!!! info "V3 или V3 rev.2?"

    **Rev.2** указан на обложке бумажной инструкции, а установщик драйвера находит принтер как **Xprinter XP-Q361U**.
    Если установщик показывает **4BARCODE 3B-Q361U** — у вас [Xprinter V3](../v3/index.md) первой ревизии, драйвер для неё другой.
    Не уверены — [определите модель](../detect/index.md) автоматически.

## Драйвер

=== ":fontawesome-brands-windows: Windows"

    | Система | Драйвер | |
    |---|---|---|
    | **Windows 7–11** | Xprinter 12.6 <span class="xp-new">актуальный</span> | [Скачать](<cloud:Драйвер/Windows/Windows 7-11/Xprinter_12.6.exe>){ .md-button .md-button--primary } |
    | Windows 7–11, предыдущая версия | Xprinter 2024.3 | [Скачать](<cloud:Драйвер/Windows/Windows 7-11/Xprinter_2024.3.exe>){ .md-button } |
    | Windows 7 | Xprinter 2022.2 | [Скачать](<cloud:Драйвер/Windows/Windows 7>){ .md-button } |
    | Для кассовых программ (чеки) | XPrinter Driver Setup 7.77 | [Скачать](<cloud:Драйвер/Windows/Для кассовых программ>){ .md-button } |

    Установщик сам найдёт принтер по USB как **Xprinter XP-Q361U**. По Bluetooth принтер виден как **Printer001** или **XP-Q361U**, PIN-код **0000**.

=== ":fontawesome-brands-apple: macOS"

    Драйвер Xprinter `net.xprinter.drv_3.13.1` и тестовые этикетки.

    [Скачать для macOS](cloud:Драйвер/MacOS){ .md-button .md-button--primary }

=== ":fontawesome-brands-linux: Linux"

    [Для печати этикеток](<cloud:Драйвер/Linux/Для печати этикеток>){ .md-button .md-button--primary }
    [Для чековой ленты](<cloud:Драйвер/Linux/Для печати на чековой ленте>){ .md-button }

## Видеоинструкции

<div class="grid cards xp-videos" markdown>

-   :material-play-circle: [Переустановка драйвера](<cloud:Инструкции/Переустановка драйвера.mp4>)
-   :material-play-circle: [Установка Bluetooth-драйвера](<cloud:Инструкции/УСТАНОВКА BLUETOOTH_драйвера.mp4>)
-   :material-play-circle: [Печать из MS Word](cloud:Инструкции/MS_Word.mp4)
-   :material-play-circle: [Печать с телефона в 4BarCode](<cloud:/uw49/fVe11mmQd/Софт/Android/4BarCode.mp4>)
-   :material-play-circle: [Установка BarTender](<cloud:/uw49/fVe11mmQd/Софт/Bartender/Установка.mp4>)
-   :material-play-circle: [Создание этикеток в BarTender](<cloud:/uw49/fVe11mmQd/Софт/Bartender/Создание этикеток.mp4>)

</div>

## Программы для этикеток

### BarTender для Windows

BarTender 11.4: бесплатная бессрочная лицензия **UltraLite**.

1. Скачайте и установите BarTender — установщик один для всех редакций, поэтому в названии файла стоит «Full».
2. При активации введите ключ из файла `КЛЮЧ_ЛИЦЕНЗИИ.txt` из той же папки.
3. Ключ включит редакцию UltraLite. Её возможностей хватает для печати этикеток.

[Скачать BarTender](<cloud:/uw49/fVe11mmQd/Софт/Bartender>){ .md-button .md-button--primary }

### Телефон и веб

--8<-- "apps.md"

--8<-- "help.md"
