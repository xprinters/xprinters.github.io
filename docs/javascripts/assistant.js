/* assistant.js — AI-ассистент Тейла для 4barcode.ru */

(function () {
"use strict";

var API_DIRECT = "https://api.4barcode.ru";
var API_PROXY  = "https://4barcode-api.netlify.app";
var WORKER_URL = API_DIRECT;
var MODEL = "4";
var NAME = "Тейла";
var NAME_ACC = "Тейлу";
var IMG_AVA = "/images/teyla-avatar.webp";
var IMG_PORT = "/images/teyla-portrait.webp";

// ═══════════════════════ Системный промпт ═══════════════════════

var PERSONA = [
  "Ты — " + NAME + ", AI-ассистент сайта технической поддержки 4barcode.ru.",
  "Ты помогаешь пользователям термопринтеров Xprinter и 4BARCODE решать проблемы, находить драйверы и разбираться с настройками.",
  "",
  "ВАЖНЕЙШЕЕ ПРАВИЛО: НИКОГДА не начинай ответ с приветствия (Здравствуйте, Привет, Добрый день и т.п.) и не представляйся. Приветствие уже показано пользователю автоматически в начале чата. Начинай сразу с сути ответа.",
  "",
  "ПРАВИЛА ПОВЕДЕНИЯ:",
  "- Общайся на «вы», дружелюбно, но по делу. Не растягивай ответ — коротко и точно.",
  "- Когда пользователь спрашивает про драйвер или установку: 1) подтверди модель (например «Я поняла, модель у вас Xprinter XP-365B.»), 2) спроси какая ОС (Windows / macOS / телефон). НЕ давай название драйвера, ссылки и шаги установки, пока не узнаешь ОС. Только после ответа про ОС — дай конкретный драйвер, ссылку и пошаговую инструкцию.",
  "- Когда пользователь спрашивает про Bluetooth: 1) подтверди модель, 2) спроси куда подключать — к Windows, телефону (Android/iPhone) или Mac. Bluetooth работает на Windows (через установщик драйвера), Android и iOS (через приложение 4BarCode). На macOS Bluetooth НЕ работает. Давай инструкцию только для названной платформы. УНИВЕРСАЛЬНОЕ ПРАВИЛО: подключаться к принтеру ВНУТРИ приложения/установщика, а НЕ через системные настройки Bluetooth!",
  "- Если модель принтера не названа или неясна — сначала спроси модель, потом ОС. Не угадывай.",
  "- НЕ спрашивай модель, если ответ от неё не зависит. Например, типичные размеры этикеток для маркетплейсов (WB, Ozon) одинаковы для всех моделей — отвечай сразу. Уточняй модель только если она влияет на ответ (например, 100×150 мм не помещается на 3-дюймовых).",
  "- Мы поддерживаем ТОЛЬКО эти модели: XP-365B, V2, V2 rev.2, V3, V4, V4 rev.2, Mini, V1BT, Pocket, A4 (BP1), A4PRO (P83), Tattoo P84, Tattoo K82. Если пользователь назвал модель, которой НЕТ в этом списке (например XP-420B, XP-460B, XP-370B и т.п.) — вежливо сообщи: «К сожалению, поставкой и поддержкой данной модели мы не занимаемся. Рекомендуем обратиться к продавцу этого товара за необходимой консультацией.» Не пытайся подобрать похожую модель, не предлагай автоопределение и не спрашивай ОС.",
  "- Давай конкретные ссылки на страницы сайта. Формат ссылки: [текст](https://4barcode.ru/путь/).",
  "- Если знаешь решение — опиши пошагово. Если нет — так и скажи, и предложи обратиться в техподдержку.",
  "- Если похоже на неисправность или ты не можешь помочь — направь в Telegram: [@xprintershop](https://t.me/xprintershop) (Пн–Пт, 10:00–16:00 МСК).",
  "- Не выдумывай информацию. Если не уверен — скажи «не уверен» и дай ссылку на нужный раздел.",
  "- Отвечай только по-русски.",
  "- Не отвечай на вопросы, не связанные с принтерами, штрихкодами и работой сайта 4barcode.ru.",
].join("\n");

var KNOWLEDGE = [
  "=== КАРТА САЙТА ===",
  "Главная: https://4barcode.ru/",
  "Все модели: https://4barcode.ru/models/",
  "Определить модель автоматически (USB/Bluetooth): https://4barcode.ru/detect/",
  "Первый запуск: https://4barcode.ru/guides/start/",
  "Как узнать модель: https://4barcode.ru/guides/model/",
  "Печать с телефона: https://4barcode.ru/guides/phone/",
  "Редактор этикеток онлайн (бесплатно, без установки): https://4barcode.ru/editor/",
  "Частые проблемы: https://4barcode.ru/faq/",
  "Техподдержка: https://4barcode.ru/support/ → Telegram @xprintershop",
  "",
  "=== МОДЕЛИ ПРИНТЕРОВ ===",
  "",
  "ПРИНТЕРЫ ЭТИКЕТОК И ЧЕКОВ (ширина до 75–115 мм, подключение USB / USB+Bluetooth):",
  "",
  "1) Xprinter XP-365B — страница: https://4barcode.ru/xp-365b/",
  "   Прошивка Xprinter. Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-365B».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина этикетки: 25–75 мм. Есть режим чеков. Windows, macOS, Linux.",
  "   Есть версии USB и USB+Bluetooth. Bluetooth-модуль ставится отдельно.",
  "",
  "2) Xprinter V2 (прошивка 4BARCODE) — страница: https://4barcode.ru/v2/",
  "   Windows-драйвер: 4BARCODE 2025.1, в установщике: «4BARCODE 3B-Q371U» (или 3B-T371U).",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–75 мм. Есть режим чеков. Есть версии USB и USB+Bluetooth.",
  "",
  "3) Xprinter V2 rev.2 (прошивка Xprinter) — страница: https://4barcode.ru/v2rev2/",
  "   Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-Q371U» (или XP-T371U).",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–75 мм. Есть режим чеков. Есть версии USB и USB+Bluetooth.",
  "   ВАЖНО: V2 и V2 rev.2 — разные прошивки, разные драйверы! Если не уверен — определить автоматически.",
  "",
  "4) Xprinter V3 (прошивка 4BARCODE) — страница: https://4barcode.ru/v3/",
  "   Windows-драйвер: 4BARCODE 11.5, в установщике: «4BARCODE 3B-Q361U».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS). Есть отдельные пакеты для этикеток и чеков.",
  "   Ширина: 25–75 мм. Есть режим чеков. Есть версии USB и USB+Bluetooth.",
  "",
  "5) Xprinter V4 (прошивка 4BARCODE) — страница: https://4barcode.ru/v4/",
  "   Windows-драйвер: 4BARCODE 11.5, в установщике: «4BARCODE 4B-2064C».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: до 100 мм. Нет режима чеков. Есть драйвер для Windows ARM. Есть версии USB и USB+Bluetooth.",
  "",
  "6) Xprinter V4 rev.2 (прошивка Xprinter) — страница: https://4barcode.ru/v4rev2/",
  "   Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-428A».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   ВАЖНО: на обложке бумажной инструкции указано «rev.2». V4 и V4 rev.2 — разные драйверы!",
  "   Ширина: до 100 мм. Нет режима чеков. USB+Bluetooth.",
  "",
  "7) Xprinter Mini (4BARCODE 4B-2054N) — страница: https://4barcode.ru/mini/",
  "   Windows-драйвер: 4BARCODE 2025.1 (для этикеток), Receipt 7.77 (для чеков), в установщике: «4BARCODE 4B-2054N».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–115 мм. Нет режима чеков (кнопка). Лента подаётся сзади. Есть версии USB и USB+Bluetooth.",
  "",
  "8) Xprinter V1BT (4BARCODE 4B-2083B) — страница: https://4barcode.ru/v1bt/",
  "   Windows-драйвер: 4BARCODE 11.5, в установщике: «4BARCODE 4B-2083B».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–75 мм. Нет режима чеков. Лента подаётся сзади. Только USB+Bluetooth.",
  "",
  "9) Xprinter Pocket (XP-P322B) — страница: https://4barcode.ru/pocket/",
  "   Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-P322B».",
  "   Портативный (аккумулятор), USB+Bluetooth. Ширина: 20–75 мм.",
  "   Режим чеков переключается в меню на экране принтера.",
  "",
  "A4 ТЕРМОПРИНТЕРЫ:",
  "",
  "10) Xprinter A4 (BP1) — страница: https://4barcode.ru/a4/",
  "    Портативный A4 на термобумаге, 203 dpi. Драйвер: Xlife 26.09.16.",
  "    Windows, macOS, Linux, ChromeOS. Bluetooth-приложение: XLife Pro.",
  "    Ширина: 53–216 мм. USB Type-C, Bluetooth.",
  "",
  "11) Xprinter A4PRO (P83) — страница: https://4barcode.ru/a4pro/",
  "    Портативный A4. Драйвер: Xlife 2025.06. Windows, macOS.",
  "    Приложение для телефона: XlifePRO. Подключение из приложения, НЕ из настроек Bluetooth.",
  "",
  "ТАТУ-ПРИНТЕРЫ:",
  "",
  "12) Xprinter Tattoo P84 — страница: https://4barcode.ru/p84/",
  "    Тот же драйвер, что у A4PRO (Xlife 2025.06). В списке установщика выбирать P83.",
  "    Приложение: TattooGo. Трансферная бумага: белая калька СВЕРХУ, синий лист СНИЗУ.",
  "",
  "13) Xprinter Tattoo K82 — страница: https://4barcode.ru/k82/",
  "    Портативный тату-принтер. Драйвер: Xlife 26.09.16 (тот же, что у A4 BP1).",
  "    Windows, macOS, Linux, ChromeOS. Приложение: Tattoo Go.",
  "    Трансферная бумага: белая калька СВЕРХУ, синий лист СНИЗУ.",
  "",
  "=== РАЗЛИЧИЕ ПРОШИВОК (ВАЖНО!) ===",
  "Драйвер Xprinter и драйвер 4BARCODE — РАЗНЫЕ. Нельзя путать.",
  "Модели XP-365B, V2 rev.2, V4 rev.2 → Windows-драйвер Xprinter.",
  "Модели V1BT, V2, V3, V4, Mini → Windows-драйвер 4BARCODE.",
  "На macOS у КАЖДОЙ модели свой отдельный .pkg-файл, который скачивается со страницы модели (вкладка macOS). Названия Windows-драйверов (4BARCODE 11.5, Xprinter 12.6 и т.п.) к macOS НЕ относятся — не упоминай их при ответах про macOS.",
  "Если установщик не видит принтер — первым делом проверьте, что драйвер скачан со страницы именно нужной модели.",
  "Не уверен в модели? Определить автоматически: https://4barcode.ru/detect/",
  "",
  "=== СОВМЕСТИМОСТЬ С ОС (кроме Windows/macOS) ===",
  "Linux: драйвер есть ТОЛЬКО у XP-365B, A4 (BP1), Tattoo K82. Остальные модели Linux-драйвера не имеют. Можно попробовать CUPS + ESC/POS (неофициально, без гарантий).",
  "ChromeOS: драйвер есть ТОЛЬКО у A4 (BP1) и Tattoo K82. Остальные — нет. Альтернативы: онлайн-редактор (https://4barcode.ru/editor/), печать с телефона через приложение.",
  "Windows ARM (Snapdragon): ARM-драйвер есть ТОЛЬКО у V4. Остальные модели — ARM не поддерживается. Эмуляция x64 на ARM может работать нестабильно.",
  "Два разных принтера на одном ПК: разные драйверы (Xprinter и 4BARCODE) не конфликтуют. Каждый ставится отдельно. В BarTender и других программах оба принтера видны, можно переключаться.",
  "",
  "=== ПРИЛОЖЕНИЯ ДЛЯ ТЕЛЕФОНА ===",
  "Принтеры этикеток (XP-365B, V-серия, Mini, Pocket) → приложение 4BarCode:",
  "  Android: https://play.google.com/store/apps/details?id=com.xinye.barcode4",
  "  iPhone: https://apps.apple.com/ru/app/4barcode/id6443980426",
  "A4 (BP1), K82 → приложение XLife Pro:",
  "  Android: https://play.google.com/store/apps/details?id=com.yoyinprintera4.app",
  "  iPhone: https://apps.apple.com/ru/app/xlife-pro/id1585620114",
  "A4PRO (P83) → приложение XlifePRO",
  "Tattoo P84 → приложение TattooGo",
  "Tattoo K82 → приложение Tattoo Go:",
  "  Android: https://play.google.com/store/apps/details?id=com.vida.tattoogo",
  "  iPhone: https://apps.apple.com/ru/app/id6737122641",
  "Подключайтесь к принтеру ВНУТРИ приложения, а НЕ из настроек Bluetooth! PIN: 0000.",
  "",
  "=== BarTender ===",
  "BarTender 11.4 UltraLite — бесплатная бессрочная версия для создания своих этикеток на Windows.",
  "Скачивать со страницы модели. Ключ лицензии в файле КЛЮЧ_ЛИЦЕНЗИИ.txt в папке с установщиком.",
  "При первом запуске выбирать редакцию UltraLite.",
  "Если просит ключ / 30 дней / демо → Справка → Выбор редакции → UltraLite.",
  "Подробнее: https://4barcode.ru/faq/bartender/",
  "",
  "=== ЧАСТЫЕ ПРОБЛЕМЫ И РЕШЕНИЯ ===",
  "",
  "ПРОБЛЕМА: Печатает иероглифы, символы или бесконечную ленту.",
  "ПРИЧИНА: Принтер в режиме чеков (RECEIPT).",
  "РЕШЕНИЕ (XP-365B, V2, V3): 1) выключить; 2) зажать PAUSE и включить; 3) держать до «Current mode: RECEIPT»; 4) нажать FEED → «Current mode: LABEL»; 5) ОБЯЗАТЕЛЬНО выключить и включить принтер. Если FEED не помогает — нажать несколько раз, затем зажать ОБЕ кнопки и включить (сброс).",
  "ВАЖНО: Если пользователь ставил чековый драйвер (XP-80, POS-принтер и т.п.) — его НУЖНО удалить перед установкой штатного драйвера для этикеток. Два драйвера для одного физического принтера (чековый + этикеточный) на одном порту будут конфликтовать.",
  "Подробнее: https://4barcode.ru/faq/paper/#печатает-иероглифы-символы-или-бесконечную-ленту",
  "",
  "ПРОБЛЕМА: Выходят пустые этикетки.",
  "ПРИЧИНА: Рулон не той стороной или этикетки не термо.",
  "РЕШЕНИЕ: У XP-365B/V2/V3 лента снизу, этикетками вниз. У V4 — сверху, этикетками вверх. Проверить: провести ногтем — на термоэтикетке остаётся тёмный след.",
  "Подробнее: https://4barcode.ru/faq/paper/#выходят-пустые-этикетки",
  "",
  "ПРОБЛЕМА: Горит красный индикатор и пищит.",
  "ПРИЧИНА: Принтер не видит бумагу.",
  "РЕШЕНИЕ: Вставить рулон правильно. Лента через левую зелёную направляющую. Правый бегунок к ленте. Вытянуть ленту за корпус. Закрыть крышку.",
  "Подробнее: https://4barcode.ru/faq/paper/#горит-красный-индикатор-и-принтер-пищит",
  "",
  "ПРОБЛЕМА: Печатает на двух этикетках, боком, мелко.",
  "ПРИЧИНА: Не настроен размер этикетки в драйвере.",
  "РЕШЕНИЕ: Принтеры и сканеры → принтер → Настройки печати → Параметры страницы → Новая → ширина×высота в мм (58×40) → Применить. Перезапустить программу печати.",
  "Подробнее: https://4barcode.ru/faq/size/#как-настроить-размер-этикетки-в-windows",
  "",
  "ПРОБЛЕМА: PDF с маркетплейса печатается криво.",
  "РЕШЕНИЕ: Печатать через Google Chrome. Ctrl+P → принтер → размер бумаги → масштаб «По размеру бумаги» → поля «Нет». НЕ через Яндекс Браузер, Edge, Adobe.",
  "Подробнее: https://4barcode.ru/faq/size/#как-печатать-этикетки-ozon-wb-яндекс-маркет-pdf",
  "",
  "ПРОБЛЕМА: Установщик драйвера не находит принтер.",
  "РЕШЕНИЯ: 1) Проверить, не установлен ли уже (Принтеры и сканеры); 2) Драйвер не от той модели; 3) Рулон не вставлен (красный); 4) Принтер в режиме чеков; 5) Другой USB-порт/кабель; 6) Win11: отключить «Защищённый режим печати Windows».",
  "Подробнее: https://4barcode.ru/faq/install/#установщик-не-находит-принтер",
  "",
  "ПРОБЛЕМА: Вместо печати предлагает сохранить файл (.prn).",
  "РЕШЕНИЕ: Полная переустановка драйвера — удалить через установщик (Seagull → Удалить все драйверы → Далее), затем установить заново.",
  "Подробнее: https://4barcode.ru/faq/install/#полная-переустановка-драйвера",
  "",
  "ПРОБЛЕМА: Штрихкод печатается волнами/зигзагом.",
  "РЕШЕНИЕ: В драйвере вкладка «Графика» → Сглаживание → «Нет» → Применить.",
  "Подробнее: https://4barcode.ru/faq/quality/#штрихкод-печатается-волнами-зигзагом-или-точками",
  "",
  "ПРОБЛЕМА: Белая полоса на этикетке.",
  "РЕШЕНИЕ: Почистить термоголовку ватным тампоном со 100% этиловым спиртом. Не металлом!",
  "Подробнее: https://4barcode.ru/faq/quality/#белая-полоса-или-не-пропечатывается-часть-этикетки",
  "",
  "ПРОБЛЕМА: Телефон не видит принтер по Bluetooth.",
  "РЕШЕНИЕ: 1) Подключаться ТОЛЬКО из приложения 4BarCode (не из настроек Bluetooth); 2) Удалить сопряжение в настройках; 3) PIN 0000; 4) Дать ВСЕ разрешения (Bluetooth, геолокация, файлы).",
  "Подробнее: https://4barcode.ru/faq/phone/#телефон-не-видит-принтер",
  "",
  "ПРОБЛЕМА: Как подключить принтер по Bluetooth к Windows.",
  "РЕШЕНИЕ: Через установщик драйвера, а НЕ через «Добавить устройство» в настройках Windows. 1) Если принтер уже добавлен в «Bluetooth и устройства» — удалить его оттуда. 2) Запустить установщик → «Установить принтер» → тип подключения Bluetooth. 3) Выбрать Printer001 (или имя модели), PIN 0000. 4) Выбрать модель. По Bluetooth печать медленнее, чем по USB — это нормально. На компьютере нужен Bluetooth-адаптер.",
  "Подробнее: https://4barcode.ru/faq/phone/#bluetooth-на-компьютере-windows",
  "",
  "ПРОБЛЕМА: BarTender просит ключ / 30 дней / демо.",
  "РЕШЕНИЕ: Справка → Выбор редакции → UltraLite. Если не помогло — удалить BarTender, удалить папку «BarTender» в «Документах», установить заново со страницы модели.",
  "Подробнее: https://4barcode.ru/faq/bartender/#просит-ключ-пробный-период-30-дней-демо-режим",
  "",
  "ПРОБЛЕМА: macOS — как подключить принтер.",
  "РЕШЕНИЕ: Только по USB. Скачать .pkg со страницы модели, установить, добавить принтер в «Принтеры и сканеры» → «+». Bluetooth НЕ поддерживается на macOS.",
  "Подробнее: https://4barcode.ru/faq/mac/",
  "",
  "ПРОБЛЕМА: macOS на Apple Silicon (M1/M2/M3/M4) — ошибка «The printer software is not compatible with this device», сбой фильтра Data, задание остановлено.",
  "РЕШЕНИЕ: Нужно установить Rosetta 2. В Терминале: softwareupdate --install-rosetta --agree-to-license. После установки очистить очередь печати и отправить заново. Актуально для принтеров этикеток (XP-365B, V2, V2rev2, V3, V4, V4rev2, Mini, V1BT, Pocket), НЕ для A4/Tattoo.",
  "Подробнее: https://4barcode.ru/faq/mac/#по-принтера-несовместимо-с-этим-устройством-apple-silicon",
  "",
  "ПРОБЛЕМА: Принтер сам дёргает ленту раз в 3–4 минуты (V3).",
  "РЕШЕНИЕ: Это защита от залипания. Отключается через приложение xtest по Bluetooth командой HEX: 1F 1B 1F D0 20 30 0D 0A.",
  "Подробнее: https://4barcode.ru/faq/hardware/#принтер-сам-дёргает-ленту-или-пищит-v3",
  "",
  "ПРОБЛЕМА: Не включается.",
  "РЕШЕНИЕ: Блок питания вставлен? Кнопка питания нажата? USB — только данные, от USB принтер не работает. Нужен блок питания 24В.",
  "Портативные (Pocket, A4PRO): снять плёнку с контактов аккумулятора, зарядить.",
  "Подробнее: https://4barcode.ru/faq/hardware/#принтер-не-включается",
  "",
  "ПРОБЛЕМА: Эскиз тату бледный / не переносится (P84, K82).",
  "РЕШЕНИЕ: Бумага вставлена не той стороной! Белая калька — СВЕРХУ, синий трансферный лист — СНИЗУ.",
  "Подробнее: https://4barcode.ru/faq/tattoo/#эскиз-бледный-не-переносится-не-печатает-линии",
  "",
  "ПРОБЛЕМА: Калибровка.",
  "XP-365B, V2, V3: автоматическая при включении. Если не работает — зажать ОБЕ кнопки и включить.",
  "V1BT, V4, Mini: зажать верхнюю кнопку и включить, отпустить после сигнала.",
  "Подробнее: https://4barcode.ru/faq/paper/#калибровка",
  "",
  "ПРОБЛЕМА: Непрерывный рулон (без зазоров) — принтер не останавливается, ищет зазор.",
  "ПРИЧИНА: В драйвере выбран тип носителя «Этикетки с зазором» (Gap), а бумага — сплошная лента.",
  "РЕШЕНИЕ: 1) Настройки печати → Параметры страницы → тип носителя: «Непрерывная» (Continuous). 2) Задать ширину и нужную высоту отрезка. 3) Откалибровать принтер (зажать обе кнопки + включить). 4) Выключить/включить.",
  "Подробнее: https://4barcode.ru/faq/paper/#калибровка",
  "",
  "ПРОБЛЕМА: Код ошибки 10 в диспетчере устройств Windows (жёлтый треугольник).",
  "РЕШЕНИЕ: 1) Удалить устройство из диспетчера (галочка «удалить драйвер»). 2) Вид → Показать скрытые устройства → удалить все «призрачные» копии. 3) Остановить службу Print Spooler, очистить C:\\Windows\\System32\\spool\\PRINTERS, запустить снова. 4) Другой USB-порт/кабель. 5) Win11: отключить «Защищённый режим печати Windows». 6) Переустановить драйвер.",
  "",
  "ПРОБЛЕМА: Несколько одинаковых принтеров на одном ПК.",
  "При Bluetooth: переименовать BT-имя (Printer001) НЕЛЬЗЯ — зашито в модуле. Но при установке драйвера для второго такого же принтера Windows автоматически назначает уникальное имя: «Xprinter XP-365B» → «Xprinter XP-365B#1» (или «копия 1»). Два принтера с одинаковым именем в системе быть не может.",
  "При USB: если драйвер уже установлен для одного принтера, при подключении второго такого же — драйвер пропишется автоматически, заново запускать установщик не нужно. Появится «Xprinter XP-365B#1» (или «копия 1»).",
  "Можно переименовать очереди печати (ПКМ → Переименовать) для удобства, например «Склад-1», «Склад-2».",
  "",
  "ПРОБЛЕМА: Зажёвывает ленту при включении.",
  "ПРИЧИНА: Рулон слишком большой (диаметр > 85 мм).",
  "РЕШЕНИЕ: Отмотать часть этикеток или использовать меньший рулон. При включении придерживать ленту.",
  "Подробнее: https://4barcode.ru/faq/paper/#зажёвывает-ленту-рулон-не-помещается",
  "",
  "ПРОБЛЕМА: Как подключить к 1С.",
  "РЕШЕНИЕ: Установить обычный драйвер, затем Proton TTP-4306 на тот же порт. В 1С драйвер «Гексагон».",
  "Подробнее: https://4barcode.ru/faq/pos/#как-подключить-к-1с",
  "",
  "=== ТИПИЧНЫЕ РАЗМЕРЫ ЭТИКЕТОК ===",
  "Wildberries: товары 58×40.",
  "Ozon: товары 58×40 (или 43×25), отправления FBS 75×120.",
  "Яндекс Маркет, СДЭК: 75×120 или 100×150 (100×150 не помещается на 3-дюймовых: XP-365B, V2, V3).",
  "",
  "=== РЕДАКТОР ЭТИКЕТОК ===",
  "Бесплатный онлайн-редактор: https://4barcode.ru/editor/",
  "Штрихкоды EAN-13, Code 128, QR, DataMatrix (Честный знак). Нумерация, знаки ухода. Экспорт в PDF.",
  "Работает в браузере, без установки и регистрации.",
  "",
  "=== КАКИЕ ЭТИКЕТКИ ПОДХОДЯТ ===",
  "Только термоэтикетки (прямая термопечать). НЕ термотрансферные. Риббон (красящая лента) НЕ поддерживается ни одной моделью.",
  "ЭКО — дешевле, но смазываются. ТОП — с защитным слоем, лучше для штрихкодов и складов. Мы не продаём расходники — ищите на маркетплейсах.",
  "Прозрачные не поддерживаются. Круглые только на V1BT и V4 (датчик по центру).",
  "Цветной печати нет — только чёрный. Цветных лент/риббонов для наших принтеров не существует.",
  "Разрешение: все модели 203 dpi. Принтеров с 300 dpi в нашей линейке нет. Выбор 300 dpi в приложении 4BarCode — программная интерполяция, физическое разрешение не меняется.",
  "",
  "=== ГАРАНТИЯ И ВОЗВРАТ ===",
  "Принтер покупается на маркетплейсе → возврат через маркетплейс.",
  "Сначала написать в Telegram @xprintershop — многие «неисправности» решаются настройкой.",
  "",
  "=== КОГДА НАПРАВИТЬ В ТЕХПОДДЕРЖКУ ===",
  "- Подозрение на аппаратную неисправность (не включается, нет реакции на USB, дефект головки)",
  "- Нужен драйвер Proton TTP-4306 для 1С",
  "- Приложение вылетает (нужна конкретная версия APK)",
  "- Вопрос по возврату/гарантии",
  "- Проблема не решается стандартными шагами",
  "→ Telegram: [@xprintershop](https://t.me/xprintershop), Пн–Пт 10:00–16:00 МСК.",
].join("\n");

var SYSTEM = PERSONA + "\n\n" + KNOWLEDGE;

var GREETING = "Привет! Я " + NAME + ".\nПомогу настроить принтер, найти драйвер или решить проблему с печатью. Расскажите, что случилось.";

// ═══════════════════════ Состояние ═══════════════════════

var active = false;
var panelOpen = false;
var busy = false;
var msgs = [];
var hasConversation = false;
var feedbackGiven = false;
var $launcher, $panel, $log, $input, $send, $feedback, $nudge, nudgeTimer;

function playNudgeSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    g.connect(ctx.destination);
    [880, 1047].forEach(function (freq, i) {
      var o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(g);
      o.start(ctx.currentTime + i * 0.12);
      o.stop(ctx.currentTime + i * 0.12 + 0.15);
    });
  } catch (e) {}
}

// ═══════════════════════ Активация ═══════════════════════

function activate() {
  if (active) { togglePanel(); return; }
  active = true;
  loadDeps(function () {
    injectCSS();
    buildWidget();
  });
}

function probeApi(cb) {
  var saved;
  try { saved = localStorage.getItem("bc_api"); } catch(x){}
  if (saved) {
    WORKER_URL = saved === "proxy" ? API_PROXY : API_DIRECT;
    cb();
    return;
  }
  var done = false;
  function win(url) {
    if (done) return;
    done = true;
    WORKER_URL = url;
    try { localStorage.setItem("bc_api", url === API_PROXY ? "proxy" : "direct"); } catch(x){}
    cb();
  }
  var c1 = new AbortController();
  var c2 = new AbortController();
  setTimeout(function () { c1.abort(); }, 5000);
  setTimeout(function () { c2.abort(); }, 5000);
  fetch(API_DIRECT, { method: "HEAD", mode: "no-cors", signal: c1.signal })
    .then(function () { win(API_DIRECT); })
    .catch(function () {});
  fetch(API_PROXY, { method: "HEAD", mode: "no-cors", signal: c2.signal })
    .then(function () { win(API_PROXY); })
    .catch(function () {});
  setTimeout(function () { if (!done) { done = true; cb(); } }, 6000);
}

function init() {
  if (active) return;
  probeApi(function () { activate(); });
}

// ═══════════════════════ Загрузка зависимостей ═══════════════════════

function loadScript(src, cb) {
  if (document.querySelector('script[src="' + src + '"]')) { cb(); return; }
  var s = document.createElement("script");
  s.src = src;
  s.onload = cb;
  s.onerror = function () { console.error("assistant: failed to load " + src); cb(); };
  document.head.appendChild(s);
}

function loadDeps(cb) {
  var pending = 2;
  function done() { if (--pending === 0) cb(); }
  loadScript("/javascripts/vendor/marked.min.js", done);
  loadScript("/javascripts/vendor/purify.min.js", done);
}

// ═══════════════════════ CSS ═══════════════════════

function injectCSS() {
  if (document.getElementById("bc-ai-css")) return;
  var style = document.createElement("style");
  style.id = "bc-ai-css";
  style.textContent = [
    "#bc-ai-btn{position:fixed;right:20px;bottom:20px;border:none;border-radius:40px;",
    "  padding:5px 15px 5px 5px;display:flex;align-items:center;gap:9px;",
    "  background:#245dea;color:#fff;font-weight:650;font-size:14px;",
    "  cursor:pointer;box-shadow:0 6px 24px #245dea55;z-index:2147483000;transition:transform .15s;animation:bc-ai-pulse 2.5s ease-in-out infinite}",
    "#bc-ai-btn:hover{transform:scale(1.04)}",
    "#bc-ai-btn .bc-ai-btn-ava{width:43px;height:43px;border-radius:50%;object-fit:cover;object-position:50% 12%;border:2px solid #ffffff60;background:#e8f0fe}",
    "#bc-ai-btn.bc-ai-open{display:none}",
    "",
    "#bc-ai-panel{position:fixed;right:20px;bottom:84px;width:392px;max-width:calc(100vw - 32px);",
    "  height:600px;max-height:calc(100vh - 110px);background:var(--md-default-bg-color,#fff);",
    "  border-radius:20px;box-shadow:0 0 0 1px var(--xp-card-border,#9eafc8),0 8px 24px rgba(24,43,77,.15),0 22px 56px rgba(24,43,77,.19);",
    "  display:none;flex-direction:column;overflow:visible;z-index:2147483000}",
    "#bc-ai-panel.open{display:flex}",
    "",
    ".bc-ai-head{background:linear-gradient(110deg,#1948bf,#2865e6);color:#fff;",
    "  display:flex;gap:12px;align-items:center;padding:20px 120px 20px 20px;",
    "  min-height:100px;position:relative;overflow:visible;isolation:isolate;flex-shrink:0;border-radius:20px 20px 0 0}",
    ".bc-ai-ava{display:none}",
    ".bc-ai-name{font-weight:700;font-size:19px;letter-spacing:-.3px;line-height:1.2;display:flex;align-items:center;gap:8px}",
    ".bc-ai-online{font-size:11px;font-weight:500;color:#4ade80;letter-spacing:0}",
    ".bc-ai-sub{font-size:12px;color:#e4edff;margin-top:3px}",
    ".bc-ai-close{position:absolute;right:9px;top:10px;z-index:3;",
    "  background:rgba(255,255,255,.12);border:none;color:#fff;",
    "  width:29px;height:29px;border-radius:8px;font-size:20px;cursor:pointer;padding:0;",
    "  display:flex;align-items:center;justify-content:center}",
    ".bc-ai-close:hover{background:rgba(255,255,255,.22)}",
    ".bc-ai-portrait{position:absolute;right:12px;bottom:0;width:150px;height:150px;",
    "  object-fit:contain;z-index:1;pointer-events:none;transform:scaleX(-1)}",
    "",
    "[data-md-color-scheme=slate] .bc-ai-head{background:linear-gradient(110deg,#1c3c8d,#2457be)}",
    "[data-md-color-scheme=slate] #bc-ai-panel{box-shadow:0 0 0 1px var(--xp-card-border,#60748f),0 10px 28px rgba(0,0,0,.55),0 24px 60px rgba(0,0,0,.5)}",
    "",
    "#bc-ai-log{flex:1;overflow-y:auto;padding:17px;display:flex;flex-direction:column;gap:12px;",
    "  background:var(--xp-card-bg,#f0f4f9)}",
    "[data-md-color-scheme=slate] #bc-ai-log{background:var(--md-default-bg-color--light,#0f172a)}",
    ".bc-ai-msg{max-width:94%;padding:12px 14px;border-radius:14px;font-size:14px;line-height:1.5;",
    "  word-wrap:break-word;font-family:var(--md-text-font-family,system-ui,sans-serif)}",
    ".bc-ai-user{align-self:flex-end;background:var(--xp-accent-soft,#d9e8ff);",
    "  color:var(--md-default-fg-color);border-radius:14px 14px 5px 14px}",
    ".bc-ai-bot{align-self:flex-start;background:var(--md-default-bg-color,#fff);",
    "  border:1px solid var(--xp-card-border,#c7d2e2);border-radius:14px 14px 14px 5px;",
    "  color:var(--md-default-fg-color);animation:bc-ai-fadein .4s ease-out}",
    ".bc-ai-bot p{margin:.35em 0}",
    ".bc-ai-bot p:first-child{margin-top:0}",
    ".bc-ai-bot p:last-child{margin-bottom:0}",
    ".bc-ai-bot ul,.bc-ai-bot ol{margin:.35em 0;padding-left:1.3em}",
    ".bc-ai-bot li{margin:.15em 0}",
    ".bc-ai-bot pre{overflow-x:auto;background:rgba(127,127,127,.1);padding:8px;border-radius:6px;font-size:.88em}",
    ".bc-ai-bot code{font-family:var(--md-code-font-family,monospace);font-size:.9em}",
    ".bc-ai-bot a{color:var(--xp-accent,#2563eb)}",
    ".bc-ai-bot strong{font-weight:650}",
    ".bc-ai-typing{color:var(--md-default-fg-color--light,#64748b);font-style:italic}",
    "",
    ".bc-ai-foot{border-top:1px solid var(--xp-card-border,#e2e8f0);padding:12px 14px;",
    "  background:var(--md-default-bg-color,#fff);border-radius:0 0 20px 20px}",
    ".bc-ai-input-row{display:flex;gap:8px;border:1px solid var(--xp-card-border,#c7d2e2);",
    "  border-radius:13px;padding:6px;align-items:center}",
    ".bc-ai-input-row:focus-within{border-color:var(--xp-accent,#2563eb)}",
    "#bc-ai-input{flex:1;resize:none;max-height:100px;min-width:0;background:none;border:none;",
    "  color:var(--md-default-fg-color);padding:5px;outline:none;font:inherit;font-size:14px}",
    "#bc-ai-input::placeholder{color:var(--md-default-fg-color--light,#64748b)}",
    "#bc-ai-send{border:none;background:var(--xp-accent-strong,#2563eb);color:#fff;border-radius:8px;",
    "  padding:9px 12px;font-size:16px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}",
    "#bc-ai-send:disabled{opacity:.45;cursor:default}",
    "#bc-ai-send svg{width:16px;height:16px;fill:currentColor}",
    ".bc-ai-note{font-size:10px;color:var(--md-default-fg-color--lighter,#94a3b8);text-align:center;margin-top:9px}",
    "",
    ".bc-ai-feedback{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;",
    "  padding:30px 24px;text-align:center;gap:16px;background:var(--xp-card-bg,#f0f4f9);animation:bc-ai-fadein .3s ease-out}",
    "[data-md-color-scheme=slate] .bc-ai-feedback{background:var(--md-default-bg-color--light,#0f172a)}",
    ".bc-ai-feedback-title{font-size:17px;font-weight:650;color:var(--md-default-fg-color)}",
    ".bc-ai-feedback-sub{font-size:13px;color:var(--md-default-fg-color--light,#64748b)}",
    ".bc-ai-stars{display:flex;gap:6px;font-size:32px;cursor:pointer;user-select:none}",
    ".bc-ai-stars span{color:var(--xp-card-border,#c7d2e2);transition:color .15s,transform .15s}",
    ".bc-ai-stars span.active{color:#facc15}",
    ".bc-ai-stars span:hover{transform:scale(1.15)}",
    ".bc-ai-feedback-text{width:100%;max-width:280px;resize:none;height:64px;border:1px solid var(--xp-card-border,#c7d2e2);",
    "  border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;background:var(--md-default-bg-color,#fff);",
    "  color:var(--md-default-fg-color);outline:none}",
    ".bc-ai-feedback-text:focus{border-color:var(--xp-accent,#2563eb)}",
    ".bc-ai-feedback-send{background:var(--xp-accent-strong,#2563eb);color:#fff;border:none;border-radius:10px;",
    "  padding:10px 28px;font-size:14px;font-weight:600;cursor:pointer}",
    ".bc-ai-feedback-send:disabled{opacity:.45;cursor:default}",
    ".bc-ai-feedback-skip{background:none;border:none;color:var(--md-default-fg-color--light,#64748b);",
    "  font-size:13px;cursor:pointer;padding:4px}",
    ".bc-ai-feedback-skip:hover{color:var(--md-default-fg-color)}",
    ".bc-ai-feedback-done{font-size:15px;color:var(--md-default-fg-color);animation:bc-ai-fadein .3s ease-out}",
    "",
    "@keyframes bc-ai-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    "@keyframes bc-ai-pulse{0%,100%{box-shadow:0 6px 24px #245dea55}50%{box-shadow:0 6px 24px #245dea88,0 0 0 10px #245dea28}}",
    "",
    "#bc-ai-nudge{position:fixed;right:20px;bottom:78px;z-index:2147482999;",
    "  background:var(--md-default-bg-color,#fff);color:var(--md-default-fg-color);",
    "  border:1px solid var(--xp-accent,#2563eb);border-radius:14px;",
    "  padding:10px 18px;font-size:14px;font-weight:500;",
    "  box-shadow:0 4px 16px rgba(36,93,234,.18);",
    "  opacity:0;transform:translateY(8px);pointer-events:none;",
    "  transition:opacity .4s ease,transform .4s ease;white-space:nowrap}",
    "#bc-ai-nudge.show{opacity:1;transform:none;pointer-events:auto;cursor:pointer}",
    "#bc-ai-nudge::after{content:'';position:absolute;bottom:-7px;right:30px;",
    "  width:14px;height:14px;background:var(--md-default-bg-color,#fff);",
    "  border-right:1px solid var(--xp-accent,#2563eb);border-bottom:1px solid var(--xp-accent,#2563eb);",
    "  transform:rotate(45deg)}",
    "",
    "@media(max-width:30em){",
    "  #bc-ai-panel{right:0;bottom:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}",
    "  .bc-ai-head{border-radius:0}",
    "  .bc-ai-foot{border-radius:0}",
    "  #bc-ai-btn{right:14px;bottom:14px}",
    "  #bc-ai-nudge{right:14px;bottom:72px}",
    "  .bc-ai-portrait{width:120px;height:120px;right:10px}",
    "}",
  ].join("\n");
  document.head.appendChild(style);
}

// ═══════════════════════ DOM ═══════════════════════

function buildWidget() {
  if (document.getElementById("bc-ai-btn")) return;

  $launcher = document.createElement("button");
  $launcher.id = "bc-ai-btn";
  $launcher.title = "Спросить " + NAME_ACC;
  $launcher.innerHTML = '<img class="bc-ai-btn-ava" src="' + IMG_PORT + '" alt="">' +
    '<span class="bc-ai-btn-text">Спросить ' + NAME_ACC + '</span>';
  $launcher.onclick = togglePanel;
  document.body.appendChild($launcher);

  $nudge = document.createElement("div");
  $nudge.id = "bc-ai-nudge";
  $nudge.textContent = "Если нужна помощь — я тут";
  $nudge.onclick = function () { togglePanel(); };
  document.body.appendChild($nudge);

  nudgeTimer = setTimeout(function () {
    if (!panelOpen) { $nudge.classList.add("show"); playNudgeSound(); }
  }, 30000);

  $panel = document.createElement("div");
  $panel.id = "bc-ai-panel";
  $panel.setAttribute("role", "dialog");
  $panel.setAttribute("aria-label", NAME + " — помощник 4barcode");
  $panel.innerHTML = [
    '<div class="bc-ai-head">',
    '  <img class="bc-ai-ava" src="' + IMG_AVA + '" alt="">',
    '  <div><div class="bc-ai-name">' + NAME + '<span class="bc-ai-online">онлайн</span></div><div class="bc-ai-sub">ИИ-помощник 4barcode.ru</div></div>',
    '  <img class="bc-ai-portrait" src="' + IMG_PORT + '" alt="">',
    '  <button class="bc-ai-close" id="bc-ai-close" aria-label="Закрыть">&times;</button>',
    '</div>',
    '<div id="bc-ai-log"></div>',
    '<div id="bc-ai-feedback" class="bc-ai-feedback" style="display:none">',
    '  <div class="bc-ai-feedback-title">Оцените помощь</div>',
    '  <div class="bc-ai-feedback-sub">Ваш отзыв поможет стать лучше</div>',
    '  <div class="bc-ai-stars" id="bc-ai-stars">',
    '    <span data-star="1">☆</span><span data-star="2">☆</span><span data-star="3">☆</span><span data-star="4">☆</span><span data-star="5">☆</span>',
    '  </div>',
    '  <textarea class="bc-ai-feedback-text" id="bc-ai-fb-text" placeholder="Комментарий (необязательно)"></textarea>',
    '  <button class="bc-ai-feedback-send" id="bc-ai-fb-send" disabled>Отправить</button>',
    '  <button class="bc-ai-feedback-skip" id="bc-ai-fb-skip">Пропустить</button>',
    '</div>',
    '<div class="bc-ai-foot">',
    '  <div class="bc-ai-input-row">',
    '    <textarea id="bc-ai-input" rows="1" placeholder="Опишите проблему…"></textarea>',
    '    <button id="bc-ai-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '  </div>',
    '  <div class="bc-ai-note">Ответы генерирует ИИ — проверяйте важное</div>',
    '</div>',
  ].join("\n");
  document.body.appendChild($panel);

  $log = document.getElementById("bc-ai-log");
  $input = document.getElementById("bc-ai-input");
  $send = document.getElementById("bc-ai-send");
  $feedback = document.getElementById("bc-ai-feedback");

  document.getElementById("bc-ai-close").onclick = togglePanel;

  $input.addEventListener("input", function () {
    $input.style.height = "auto";
    $input.style.height = Math.min($input.scrollHeight, 100) + "px";
  });
  $input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $send.onclick = sendMessage;

  var feedbackRating = 0;
  var stars = document.getElementById("bc-ai-stars");
  stars.addEventListener("click", function (e) {
    var s = e.target.closest("[data-star]");
    if (!s) return;
    feedbackRating = parseInt(s.dataset.star);
    Array.from(stars.children).forEach(function (el, i) {
      el.textContent = i < feedbackRating ? "★" : "☆";
      el.classList.toggle("active", i < feedbackRating);
    });
    document.getElementById("bc-ai-fb-send").disabled = false;
  });

  document.getElementById("bc-ai-fb-send").onclick = function () {
    var comment = document.getElementById("bc-ai-fb-text").value.trim();
    submitFeedback(feedbackRating, comment);
  };
  document.getElementById("bc-ai-fb-skip").onclick = function () {
    feedbackGiven = true;
    closePanelForReal();
  };
}

// ═══════════════════════ Toggle ═══════════════════════

function togglePanel() {
  if (panelOpen && hasConversation && !feedbackGiven && !busy) {
    showFeedback();
    return;
  }
  panelOpen = !panelOpen;
  if ($nudge) { clearTimeout(nudgeTimer); $nudge.classList.remove("show"); }
  if ($panel) {
    $panel.classList.toggle("open", panelOpen);
    $launcher.classList.toggle("bc-ai-open", panelOpen);
    if (panelOpen) {
      hideFeedback();
      if (!$log.children.length) addBubble("bot", renderMd(GREETING));
      $input.focus();
    }
  }
}

function closePanelForReal() {
  panelOpen = false;
  $panel.classList.remove("open");
  $launcher.classList.remove("bc-ai-open");
  hideFeedback();
}

function showFeedback() {
  $log.style.display = "none";
  $panel.querySelector(".bc-ai-foot").style.display = "none";
  $feedback.style.display = "";
}

function hideFeedback() {
  $feedback.style.display = "none";
  $log.style.display = "";
  $panel.querySelector(".bc-ai-foot").style.display = "";
}

function submitFeedback(rating, comment) {
  feedbackGiven = true;
  $feedback.innerHTML = '<div class="bc-ai-feedback-done">Спасибо за отзыв! 🙏</div>';
  var fbUrl = API_DIRECT + "/feedback";
  try { if (localStorage.getItem("bc_api") === "proxy") fbUrl = API_PROXY + "/feedback"; } catch(x){}
  fetch(fbUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rating: rating, comment: comment, messages: msgs }),
  }).catch(function () {});
  setTimeout(closePanelForReal, 1200);
}

// ═══════════════════════ Рендер ═══════════════════════

function renderMd(text) {
  if (typeof marked === "undefined") return escapeHtml(text);
  var renderer = new marked.Renderer();
  renderer.link = function (href, title, text) {
    var t = title ? ' title="' + title + '"' : "";
    return '<a href="' + href + '"' + t + ' target="_blank" rel="noopener">' + text + "</a>";
  };
  var html = marked.parse(text || "", { breaks: true, renderer: renderer });
  if (typeof DOMPurify !== "undefined") html = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] });
  return html;
}

function addBubble(role, html) {
  var el = document.createElement("div");
  el.className = "bc-ai-msg " + (role === "user" ? "bc-ai-user" : "bc-ai-bot");
  el.innerHTML = role === "user" ? escapeHtml(html) : html;
  $log.appendChild(el);
  $log.scrollTop = $log.scrollHeight;
  return el;
}

function escapeHtml(s) {
  var d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════ Чат ═══════════════════════

async function sendMessage() {
  var text = $input.value.trim();
  if (!text || busy) return;
  $input.value = "";
  $input.style.height = "auto";
  addBubble("user", text);
  msgs.push({ role: "user", content: text });
  hasConversation = true;

  busy = true;
  $send.disabled = true;
  var out = addBubble("bot", '<span class="bc-ai-typing">думает…</span>');
  var acc = "";
  var payload = JSON.stringify({ messages: msgs, model: MODEL, system: SYSTEM });

  async function tryFetch(url, ms) {
    var c = new AbortController();
    var t = setTimeout(function () { c.abort(); }, ms);
    var r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      signal: c.signal,
    });
    clearTimeout(t);
    if (!r.ok || !r.body) throw new Error("HTTP " + r.status);
    return r;
  }

  try {
    var resp;
    var saved = "";
    try { saved = localStorage.getItem("bc_api") || ""; } catch(x){}
    var primary = saved === "proxy" ? API_PROXY : API_DIRECT;
    var fallback = primary === API_PROXY ? API_DIRECT : API_PROXY;
    var primaryMs = primary === API_PROXY ? 45000 : 8000;
    try {
      resp = await tryFetch(primary, primaryMs);
      try { localStorage.setItem("bc_api", primary === API_PROXY ? "proxy" : "direct"); } catch(x){}
    } catch (e1) {
      out.innerHTML = '<span class="bc-ai-typing">переключаюсь…</span>';
      var fallbackMs = fallback === API_PROXY ? 45000 : 15000;
      resp = await tryFetch(fallback, fallbackMs);
      try { localStorage.setItem("bc_api", fallback === API_PROXY ? "proxy" : "direct"); } catch(x){}
    }
    var reader = resp.body.getReader();
    var dec = new TextDecoder();
    var firstChunk = true;
    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      if (firstChunk) {
        out.innerHTML = '<span class="bc-ai-typing">печатает…</span>';
        firstChunk = false;
      }
      acc += dec.decode(chunk.value, { stream: true });
      out.innerHTML = renderMd(acc);
      $log.scrollTop = $log.scrollHeight;
    }
    if (!acc) throw new Error("пустой ответ");
    msgs.push({ role: "assistant", content: acc });
  } catch (e) {
    var errText = e.name === "AbortError"
      ? "⏳ Сервер не ответил вовремя. Возможно, соединение заблокировано вашим провайдером — попробуйте через мобильную сеть или VPN.\n\nИли напишите в [Telegram @xprintershop](https://t.me/xprintershop)."
      : "⚠️ Не удалось получить ответ. Попробуйте ещё раз или напишите в " +
        "[Telegram @xprintershop](https://t.me/xprintershop).\n\n`" + e.message + "`";
    out.innerHTML = renderMd(errText);
  } finally {
    busy = false;
    $send.disabled = false;
    $input.focus();
  }
}

// ═══════════════════════ Инициализация ═══════════════════════

if (typeof document$ !== "undefined") {
  document$.subscribe(function () { init(); });
} else {
  document.addEventListener("DOMContentLoaded", function () { init(); });
}

})();
