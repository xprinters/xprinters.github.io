/* assistant.js — AI-ассистент для 4barcode.ru
   Скрытая функция: активируется вводом «4bai» в строку поиска сайта.
   Загружает зависимости и инжектит виджет только после активации. */

(function () {
"use strict";

var SECRET = "4bai";
var WORKER_URL = "https://barcode-assistant.4barcode.workers.dev";
var MODEL = "4";
var STORAGE_KEY = "bc_ai";
var NAME = "Мия";

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
  "- Если модель принтера не названа или неясна — сначала спроси модель, потом ОС. Не угадывай.",
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
  "   Ширина: 25–75 мм. Есть режим чеков.",
  "",
  "3) Xprinter V2 rev.2 (прошивка Xprinter) — страница: https://4barcode.ru/v2rev2/",
  "   Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-Q371U» (или XP-T371U).",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–75 мм. Есть режим чеков.",
  "   ВАЖНО: V2 и V2 rev.2 — разные прошивки, разные драйверы! Если не уверен — определить автоматически.",
  "",
  "4) Xprinter V3 (прошивка 4BARCODE) — страница: https://4barcode.ru/v3/",
  "   Windows-драйвер: 4BARCODE 11.5, в установщике: «4BARCODE 3B-Q361U».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS). Есть отдельные пакеты для этикеток и чеков.",
  "   Ширина: 25–75 мм. Есть режим чеков.",
  "",
  "5) Xprinter V4 (прошивка 4BARCODE) — страница: https://4barcode.ru/v4/",
  "   Windows-драйвер: 4BARCODE 11.5, в установщике: «4BARCODE 4B-2064C».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: до 100 мм. Нет режима чеков. Есть драйвер для Windows ARM.",
  "",
  "6) Xprinter V4 rev.2 (прошивка Xprinter) — страница: https://4barcode.ru/v4rev2/",
  "   Windows-драйвер: Xprinter 12.6, в установщике: «Xprinter XP-428A».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   ВАЖНО: на обложке бумажной инструкции указано «rev.2». V4 и V4 rev.2 — разные драйверы!",
  "   Ширина: до 100 мм. Нет режима чеков.",
  "",
  "7) Xprinter Mini (4BARCODE 4B-2054N) — страница: https://4barcode.ru/mini/",
  "   Windows-драйвер: 4BARCODE 2025.1 (для этикеток), Receipt 7.77 (для чеков), в установщике: «4BARCODE 4B-2054N».",
  "   macOS-драйвер: отдельный .pkg, скачивается со страницы модели (раздел macOS).",
  "   Ширина: 25–115 мм. Нет режима чеков (кнопка). Лента подаётся сзади.",
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
  "РЕШЕНИЕ (XP-365B, V2, V3): 1) выключить; 2) зажать PAUSE и включить; 3) держать до «Current mode: RECEIPT»; 4) нажать FEED → «Current mode: LABEL»; 5) ОБЯЗАТЕЛЬНО выключить и включить принтер.",
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
  "Только термоэтикетки (прямая термопечать). НЕ термотрансферные.",
  "ЭКО — дешевле, но смазываются. ТОП — с защитным слоем, лучше для штрихкодов.",
  "Прозрачные не поддерживаются. Круглые только на V1BT и V4 (датчик по центру).",
  "Цветной печати нет — только чёрный.",
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

var GREETING = "Привет! Я " + NAME + ", помощник сайта 4barcode.ru. Расскажите, что случилось с принтером или что вы ищете — постараюсь помочь.";

// ═══════════════════════ Состояние ═══════════════════════

var active = false;
var panelOpen = false;
var busy = false;
var msgs = [];
var $launcher, $panel, $log, $input, $send;

// ═══════════════════════ Мониторинг поиска ═══════════════════════

function watchSearch() {
  if (active) return;
  if (sessionStorage.getItem(STORAGE_KEY)) { activate(); return; }
  var q = document.querySelector("[data-md-component=search-query]");
  if (!q || q._bcAI) return;
  q._bcAI = true;
  q.addEventListener("input", function () {
    if (q.value.trim().toLowerCase() === SECRET) {
      q.value = "";
      q.blur();
      setTimeout(function () {
        var toggle = document.getElementById("__search");
        if (toggle) { toggle.checked = false; toggle.dispatchEvent(new Event("change")); }
        sessionStorage.setItem(STORAGE_KEY, "1");
        activate();
      }, 60);
    }
  });
}

// ═══════════════════════ Активация ═══════════════════════

function activate() {
  if (active) { togglePanel(); return; }
  active = true;
  loadDeps(function () {
    injectCSS();
    buildWidget();
    togglePanel();
  });
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
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js", done);
  loadScript("https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js", done);
}

// ═══════════════════════ CSS ═══════════════════════

function injectCSS() {
  if (document.getElementById("bc-ai-css")) return;
  var style = document.createElement("style");
  style.id = "bc-ai-css";
  style.textContent = [
    "#bc-ai-btn{position:fixed;right:20px;bottom:20px;width:52px;height:52px;border:none;",
    "  border-radius:50%;background:var(--xp-accent-strong,#2563eb);color:#fff;font-size:24px;",
    "  cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.18);z-index:2147483000;",
    "  display:flex;align-items:center;justify-content:center;transition:transform .15s}",
    "#bc-ai-btn:hover{transform:scale(1.08)}",
    "#bc-ai-btn svg{width:26px;height:26px;fill:currentColor}",
    "",
    "#bc-ai-panel{position:fixed;right:20px;bottom:84px;width:380px;max-width:calc(100vw - 32px);",
    "  height:560px;max-height:calc(100vh - 110px);background:var(--md-default-bg-color,#fff);",
    "  border:1px solid var(--xp-card-border,#e2e8f0);border-radius:14px;",
    "  box-shadow:0 12px 40px rgba(0,0,0,.18);display:none;flex-direction:column;overflow:hidden;",
    "  z-index:2147483000}",
    "#bc-ai-panel.open{display:flex}",
    "",
    ".bc-ai-head{display:flex;align-items:center;gap:10px;padding:12px 14px;",
    "  border-bottom:1px solid var(--xp-card-border,#e2e8f0)}",
    ".bc-ai-ava{width:32px;height:32px;border-radius:8px;background:var(--xp-accent-strong,#2563eb);",
    "  color:#fff;display:grid;place-items:center;font-weight:700;font-size:13px;flex:0 0 auto}",
    ".bc-ai-name{font-weight:650;font-size:14px;line-height:1.2;color:var(--md-default-fg-color)}",
    ".bc-ai-sub{font-size:11px;color:var(--md-default-fg-color--light,#64748b)}",
    ".bc-ai-close{margin-left:auto;background:none;border:none;",
    "  color:var(--md-default-fg-color--light,#64748b);font-size:22px;cursor:pointer;padding:0 4px}",
    "",
    "#bc-ai-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}",
    ".bc-ai-msg{max-width:85%;padding:9px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;",
    "  word-wrap:break-word;font-family:var(--md-text-font-family,system-ui,sans-serif)}",
    ".bc-ai-user{align-self:flex-end;background:var(--xp-accent-soft,#dbeafe);",
    "  color:var(--md-default-fg-color);border-bottom-right-radius:4px}",
    ".bc-ai-bot{align-self:flex-start;background:var(--xp-card-bg,#f8fafc);",
    "  border:1px solid var(--xp-card-border,#e2e8f0);border-bottom-left-radius:4px;",
    "  color:var(--md-default-fg-color)}",
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
    ".bc-ai-foot{border-top:1px solid var(--xp-card-border,#e2e8f0);padding:10px;display:flex;gap:8px;align-items:flex-end}",
    "#bc-ai-input{flex:1;resize:none;max-height:100px;border:1px solid var(--xp-card-border,#e2e8f0);",
    "  border-radius:10px;padding:8px 10px;font:inherit;font-size:13.5px;",
    "  background:var(--md-default-bg-color,#fff);color:var(--md-default-fg-color);outline:none}",
    "#bc-ai-input:focus{border-color:var(--xp-accent,#2563eb)}",
    "#bc-ai-input::placeholder{color:var(--md-default-fg-color--light,#64748b)}",
    "#bc-ai-send{border:none;background:var(--xp-accent-strong,#2563eb);color:#fff;border-radius:10px;",
    "  width:38px;height:38px;font-size:17px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}",
    "#bc-ai-send:disabled{opacity:.45;cursor:default}",
    "#bc-ai-send svg{width:18px;height:18px;fill:currentColor}",
    ".bc-ai-note{font-size:10.5px;color:var(--md-default-fg-color--lighter,#94a3b8);text-align:center;padding:0 10px 7px}",
    "",
    "@media(max-width:30em){",
    "  #bc-ai-panel{right:0;bottom:0;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}",
    "  #bc-ai-btn{right:14px;bottom:14px;width:48px;height:48px}",
    "}",
  ].join("\n");
  document.head.appendChild(style);
}

// ═══════════════════════ DOM ═══════════════════════

function buildWidget() {
  if (document.getElementById("bc-ai-btn")) return;

  $launcher = document.createElement("button");
  $launcher.id = "bc-ai-btn";
  $launcher.title = "Спросить " + NAME;
  $launcher.innerHTML = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/><path d="M7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z"/></svg>';
  $launcher.onclick = togglePanel;
  document.body.appendChild($launcher);

  $panel = document.createElement("div");
  $panel.id = "bc-ai-panel";
  $panel.setAttribute("role", "dialog");
  $panel.setAttribute("aria-label", NAME + " — помощник 4barcode");
  $panel.innerHTML = [
    '<div class="bc-ai-head">',
    '  <div class="bc-ai-ava">' + NAME[0] + '</div>',
    '  <div><div class="bc-ai-name">' + NAME + '</div><div class="bc-ai-sub">Помощник 4barcode.ru</div></div>',
    '  <button class="bc-ai-close" id="bc-ai-close" aria-label="Закрыть">&times;</button>',
    '</div>',
    '<div id="bc-ai-log"></div>',
    '<div class="bc-ai-foot">',
    '  <textarea id="bc-ai-input" rows="1" placeholder="Опишите проблему или что ищете…"></textarea>',
    '  <button id="bc-ai-send" aria-label="Отправить"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>',
    '</div>',
    '<div class="bc-ai-note">Ответы генерирует ИИ — проверяйте важное</div>',
  ].join("\n");
  document.body.appendChild($panel);

  $log = document.getElementById("bc-ai-log");
  $input = document.getElementById("bc-ai-input");
  $send = document.getElementById("bc-ai-send");

  document.getElementById("bc-ai-close").onclick = togglePanel;

  $input.addEventListener("input", function () {
    $input.style.height = "auto";
    $input.style.height = Math.min($input.scrollHeight, 100) + "px";
  });
  $input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  $send.onclick = sendMessage;
}

// ═══════════════════════ Toggle ═══════════════════════

function togglePanel() {
  panelOpen = !panelOpen;
  if ($panel) {
    $panel.classList.toggle("open", panelOpen);
    if (panelOpen) {
      if (!$log.children.length) addBubble("bot", renderMd(GREETING));
      $input.focus();
    }
  }
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

  busy = true;
  $send.disabled = true;
  var out = addBubble("bot", '<span class="bc-ai-typing">думает…</span>');
  var acc = "";

  try {
    var resp = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: msgs, model: MODEL, system: SYSTEM }),
    });
    if (!resp.ok || !resp.body) throw new Error("HTTP " + resp.status);
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
    out.innerHTML = renderMd(
      "⚠️ Не удалось получить ответ. Попробуйте ещё раз или напишите в " +
      "[Telegram @xprintershop](https://t.me/xprintershop).\n\n`" + e.message + "`"
    );
  } finally {
    busy = false;
    $send.disabled = false;
    $input.focus();
  }
}

// ═══════════════════════ Инициализация ═══════════════════════

if (typeof document$ !== "undefined") {
  document$.subscribe(watchSearch);
} else {
  document.addEventListener("DOMContentLoaded", watchSearch);
}

})();
