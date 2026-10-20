// Определение модели принтера в браузере (страница /detect/, блок #xp-detect).
// USB: WebUSB отдаёт VID/PID и строки дескриптора без драйвера; строку IEEE-1284
// (MFG/MDL) пробуем запросить классовым запросом GET_DEVICE_ID — на Windows
// интерфейс обычно занят usbprint.sys, тогда остаётся то, что есть в дескрипторе.
// Bluetooth: Web Bluetooth показывает имя устройства, по нему и определяем.
(function () {
  // MFG + MDL из строки IEEE-1284 (как в tools/printer_ids.tsv) -> модель сайта
  var IDS = {
    "XPRINTER|XP-365B": "xp-365b", "4BARCODE|3B-365B": "xp-365b",
    "4BARCODE|4B-2083B": "v1bt", "XPRINTER|XP-D362B": "v1bt",
    "4BARCODE|3B-T371U": "v2", "4BARCODE|3B-Q371U": "v2",
    "XPRINTER|XP-T371U": "v2", "XPRINTER|XP-Q371U": "v2",
    "4BARCODE|3B-Q361U": "v3", "4BARCODE|3B-T361U": "v3",
    "XPRINTER|XP-Q361U": "v3", "XPRINTER|XP-T361U": "v3",
    "4BARCODE|4B-2064C": "v4",
    "4BARCODE|4B-2054N": "mini", "XPRINTER|XP-D465B": "mini",
    "XPRINTER|XP-P322B": "pocket",
    "XLIFE|P83": "a4pro", "XLIFE|P83C": "a4pro", "XLIFE|P84": "a4pro"
  };
  // Запасной вариант: модель встречается в названии USB-устройства или Bluetooth-имени
  var NAME_RULES = [
    [/365B/i, "xp-365b"], [/2083B|D362B/i, "v1bt"], [/371U/i, "v2"],
    [/361U/i, "v3"], [/2064C/i, "v4"], [/2054N|D465B/i, "mini"],
    [/P322/i, "pocket"], [/P8[34]/i, "a4pro"]
  ];
  // Гипотеза (подтверждена на Pocket: VID 0x2D37, PID 0x5BB5): Xprinter ставит PID
  // равным 4 hex-символам в конце Hardware ID Windows. Сверять на каждой новой модели.
  var XPRINTER_VID = 0x2D37;
  var PIDS = {
    0x6494: "xp-365b", 0xD2E6: "xp-365b", 0x44BB: "v1bt", 0x99C4: "v1bt",
    0x8381: "v2", 0x834F: "v2", 0x6414: "v2", 0x64D8: "v2",
    0x431E: "v3", 0xA489: "v3", 0x7519: "v4", 0xB028: "mini", 0xDDC7: "mini",
    0x5BB5: "pocket"
  };
  // PID от Hardware ID прошивки Xprinter (остальные в PIDS — прошивка 4BARCODE)
  var XPRINTER_PIDS = [0x6494, 0x99C4, 0x6414, 0x64D8, 0xA489, 0xDDC7, 0x5BB5];
  // A4PRO / A4 Tattoo (Xlife) по USB не называет модель: чип Jieli, «USB Composite
  // Device», PID 0xD033. Принтер на Jieli у нас один, поэтому VID + класс 07 = A4PRO.
  var JIELI_VID = 0x2D84;
  var MODELS = {
    "xp-365b": "Xprinter XP-365B", "v1bt": "Xprinter V1BT", "v2": "Xprinter V2",
    "v3": "Xprinter V3", "v4": "Xprinter V4", "mini": "Xprinter Mini",
    "pocket": "Xprinter Pocket", "a4pro": "A4PRO / A4 Tattoo"
  };

  var log = [];
  var root, out, siteRoot;

  function hex4(n) { return "0x" + ("0000" + n.toString(16).toUpperCase()).slice(-4); }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function write(line) {
    log.push(line);
    out.textContent = log.join("\n");
  }

  function parse1284(s) {
    var o = {};
    s.split(";").forEach(function (part) {
      var i = part.indexOf(":");
      if (i > 0) o[part.slice(0, i).trim().toUpperCase()] = part.slice(i + 1).trim();
    });
    return {
      mfg: o.MFG || o.MANUFACTURER || "",
      mdl: o.MDL || o.MODEL || "",
      cmd: o["COMMAND SET"] || o.CMD || ""
    };
  }

  function byIds(mfg, mdl) {
    return IDS[(mfg || "").toUpperCase() + "|" + (mdl || "").toUpperCase()] || null;
  }

  function byName(s) {
    for (var i = 0; i < NAME_RULES.length; i++) if (NAME_RULES[i][0].test(s || "")) return NAME_RULES[i][1];
    return null;
  }

  // Пак драйверов: по прошивке (производитель в USB, Bluetooth-имя XP-…), иначе по модели.
  // Прошивка 4BARCODE требует пак 4BARCODE, Xprinter — пак Xprinter, A4PRO (чип Jieli) — Xlife.
  var DEFAULT_PACK = { "xp-365b": "xprinter", "pocket": "xprinter", "a4pro": "xlife" };
  var PACK_TITLES = { xprinter: "Xprinter", "4barcode": "4BARCODE", xlife: "Xlife" };

  function packFor(slug, hint) {
    hint = hint || "";
    if (slug === "a4pro" || /xlife|jieli/i.test(hint)) return "xlife";
    if (/4barcode/i.test(hint)) return "4barcode";
    if (/xprinter|(^|\s)XP-/i.test(hint)) return "xprinter";
    return DEFAULT_PACK[slug] || "4barcode";
  }

  function driverSteps(pack) {
    var ol = el("ol");
    ol.appendChild(el("li", null, "Кнопка откроет файл в Облаке Mail.ru — нажмите там «Скачать»."));
    if (pack === "xlife") {
      ol.appendChild(el("li", null, "Запустите скачанный файл и пройдите установку до конца. Принтер должен быть подключён по USB и включён."));
    } else {
      ol.appendChild(el("li", null, "Запустите файл: он распакует драйвер и откроет мастер установки."));
      ol.appendChild(el("li", null, "Выберите «Установить драйверы принтера» и подключение USB — мастер сам найдёт включённый принтер. Нажимайте «Далее» до конца."));
    }
    ol.appendChild(el("li", null, "Задайте размер этикетки: «Принтеры и сканеры» → принтер → «Настройки печати» → «Параметры страницы»."));
    return ol;
  }

  function showResult(slug, how, hint) {
    var box = root.querySelector(".xpd-result");
    box.innerHTML = "";
    if (!slug) {
      box.className = "xpd-result admonition warning";
      box.appendChild(el("p", { "class": "admonition-title" }, "Модель не определена"));
      box.appendChild(el("p", null, "Скопируйте отчёт ниже и пришлите в поддержку — подскажем модель и драйвер."));
      return;
    }
    box.className = "xpd-result admonition success";
    box.appendChild(el("p", { "class": "admonition-title" }, "Ваш принтер: " + MODELS[slug]));
    box.appendChild(el("p", null, "Определено " + how + "."));

    var pack = packFor(slug, hint);
    var link = document.querySelector('.xpd-packs a[data-pack="' + pack + '"]');
    var buttons = el("p", { "class": "xpd-buttons" });
    if (link && /Windows/i.test(navigator.userAgent)) {
      write("Драйвер: " + PACK_TITLES[pack] + " — " + decodeURIComponent(link.href.split("/").pop()));
      buttons.appendChild(el("a", { href: link.href, target: "_blank", rel: "noopener", "class": "md-button md-button--primary" },
        "Скачать драйвер " + PACK_TITLES[pack]));
      buttons.appendChild(document.createTextNode(" "));
      buttons.appendChild(el("a", { href: siteRoot + slug + "/", "class": "md-button" }, "Страница модели"));
      box.appendChild(buttons);
      box.appendChild(driverSteps(pack));
    } else {
      buttons.appendChild(el("a", { href: siteRoot + slug + "/", "class": "md-button md-button--primary" }, "Драйверы и программы"));
      box.appendChild(buttons);
    }
  }

  async function readDeviceId(dev) {
    await dev.open();
    try {
      if (!dev.configuration) await dev.selectConfiguration(1);
      var cfg = dev.configuration;
      var target = null;
      cfg.interfaces.forEach(function (itf) {
        itf.alternates.forEach(function (alt) {
          if (!target && alt.interfaceClass === 7) target = { n: itf.interfaceNumber, alt: alt.alternateSetting };
        });
      });
      if (!target) throw new Error("нет интерфейса класса Printer (07)");
      await dev.claimInterface(target.n);
      try {
        var r = await dev.controlTransferIn({
          requestType: "class", recipient: "interface", request: 0,
          value: cfg.configurationValue - 1, index: (target.n << 8) | target.alt
        }, 1024);
        if (r.status !== "ok" || !r.data || r.data.byteLength < 2) throw new Error("ответ " + r.status);
        var len = r.data.getUint16(0);
        var bytes = new Uint8Array(r.data.buffer, r.data.byteOffset + 2, Math.min(len, r.data.byteLength) - 2);
        return new TextDecoder("latin1").decode(bytes);
      } finally {
        try { await dev.releaseInterface(target.n); } catch (e) { /* ignore */ }
      }
    } finally {
      try { await dev.close(); } catch (e) { /* ignore */ }
    }
  }

  function hasPrinterInterface(dev) {
    return (dev.configurations || []).some(function (c) {
      return c.interfaces.some(function (itf) {
        return itf.alternates.some(function (a) { return a.interfaceClass === 7; });
      });
    });
  }

  async function describeUsb(dev) {
    write("== USB");
    write("VID/PID: " + hex4(dev.vendorId) + " / " + hex4(dev.productId));
    write("Производитель: " + (dev.manufacturerName || "—"));
    write("Устройство: " + (dev.productName || "—"));
    write("Серийный номер: " + (dev.serialNumber || "—"));
    write("USB " + dev.usbVersionMajor + "." + dev.usbVersionMinor + ", класс " + dev.deviceClass +
      ", версия устройства " + dev.deviceVersionMajor + "." + dev.deviceVersionMinor + "." + dev.deviceVersionSubminor);
    (dev.configurations || []).forEach(function (c) {
      c.interfaces.forEach(function (itf) {
        itf.alternates.forEach(function (a) {
          write("  интерфейс " + itf.interfaceNumber + "." + a.alternateSetting + ": класс " +
            a.interfaceClass + "/" + a.interfaceSubclass + "/" + a.interfaceProtocol +
            (a.interfaceName ? " «" + a.interfaceName + "»" : ""));
        });
      });
    });

    var slug = null, how = "", mfg = "";
    try {
      var id = await readDeviceId(dev);
      write("IEEE-1284: " + id);
      var p = parse1284(id);
      mfg = p.mfg;
      slug = byIds(p.mfg, p.mdl) || byName(p.mdl);
      how = "по ответу принтера (" + p.mfg + " " + p.mdl + ")";
    } catch (e) {
      write("IEEE-1284: не прочитать — " + e.message);
    }
    if (!slug) {
      slug = byName((dev.manufacturerName || "") + " " + (dev.productName || ""));
      how = "по названию USB-устройства";
    }
    if (!slug && dev.vendorId === XPRINTER_VID && PIDS[dev.productId]) {
      slug = PIDS[dev.productId];
      how = "по коду USB-устройства";
      mfg = XPRINTER_PIDS.indexOf(dev.productId) >= 0 ? "Xprinter" : "4BARCODE";
    }
    if (!slug && dev.vendorId === JIELI_VID && hasPrinterInterface(dev)) {
      slug = "a4pro";
      how = "по USB-чипу принтера";
    }
    write("Итог: " + (slug ? MODELS[slug] : "не определено"));
    showResult(slug, how, [mfg, dev.manufacturerName, dev.productName].join(" "));
  }

  async function onUsb() {
    log = [];
    try {
      // В окне выбора только принтеры: класс 07 у устройства или интерфейса.
      var dev = await navigator.usb.requestDevice({ filters: [
        { classCode: 7 }, { vendorId: XPRINTER_VID }, { vendorId: JIELI_VID, classCode: 7 }
      ] });
      await describeUsb(dev);
    } catch (e) {
      if (e.name !== "NotFoundError") write("Ошибка USB: " + e.name + ": " + e.message);
    }
  }

  async function onBt() {
    log = [];
    try {
      var dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      write("== Bluetooth");
      write("Имя: " + (dev.name || "—"));
      write("ID: " + dev.id);
      var slug = byName(dev.name);
      write("Итог: " + (slug ? MODELS[slug] : "не определено"));
      showResult(slug, "по имени Bluetooth (" + dev.name + ")", dev.name);
    } catch (e) {
      if (e.name !== "NotFoundError") write("Ошибка Bluetooth: " + e.name + ": " + e.message);
    }
  }

  // Принтеры, к которым пользователь уже давал доступ, определяем без окна выбора:
  // при открытии страницы и при подключении кабеля.
  async function autoUsb() {
    var devs = await navigator.usb.getDevices();
    var printers = devs.filter(hasPrinterInterface);
    if (!printers.length) return;
    log = [];
    await describeUsb(printers[printers.length - 1]);
  }

  var connectHooked = false;
  function hookConnect() {
    if (connectHooked || !navigator.usb) return;
    connectHooked = true;
    navigator.usb.addEventListener("connect", function (e) {
      if (document.getElementById("xp-detect") && hasPrinterInterface(e.device)) {
        log = [];
        describeUsb(e.device);
      }
    });
  }

  function mount(r) {
    hookConnect();
    root = r;
    siteRoot = new URL(r.getAttribute("data-root") || "../", location.href).href;
    r.innerHTML = "";
    var hasUsb = !!navigator.usb, hasBt = !!navigator.bluetooth;
    var bar = el("p", { "class": "xpd-buttons" });
    var bUsb = el("button", { type: "button", "class": "md-button md-button--primary" }, "Найти по USB");
    var bBt = el("button", { type: "button", "class": "md-button" }, "Найти по Bluetooth");
    bUsb.disabled = !hasUsb;
    bBt.disabled = !hasBt;
    bUsb.onclick = onUsb;
    bBt.onclick = onBt;
    bar.appendChild(bUsb);
    bar.appendChild(document.createTextNode(" "));
    bar.appendChild(bBt);
    r.appendChild(bar);
    if (hasUsb) {
      r.appendChild(el("p", { "class": "xpd-hint" },
        "В окне выбора будут только принтеры. A4PRO и A4 Tattoo там называются «USB Composite Device»."));
    }
    if (!hasUsb && !hasBt) {
      r.appendChild(el("p", null, "Ваш браузер не умеет искать устройства. Откройте страницу в Google Chrome или Microsoft Edge на компьютере."));
    }
    r.appendChild(el("div", { "class": "xpd-result" }));

    var det = el("details", { "class": "xpd-log" });
    det.appendChild(el("summary", null, "Технический отчёт"));
    out = el("pre");
    det.appendChild(out);
    var copy = el("button", { type: "button", "class": "md-button" }, "Скопировать отчёт");
    copy.onclick = function () {
      var text = out.textContent + "\n\n" + navigator.userAgent;
      navigator.clipboard.writeText(text).then(function () { copy.textContent = "Скопировано"; });
    };
    det.appendChild(copy);
    r.appendChild(det);
    write(navigator.userAgent);
    write("WebUSB: " + (hasUsb ? "есть" : "нет") + ", Web Bluetooth: " + (hasBt ? "есть" : "нет"));
    if (hasUsb) autoUsb();
  }

  document$.subscribe(function () {
    var r = document.getElementById("xp-detect");
    if (r) mount(r);
  });
})();
